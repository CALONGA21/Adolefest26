/**
 * STRESS TEST — TOCTOU Race Condition Validation
 * ================================================
 * This script simulates a severe race condition by firing 10 simultaneous
 * POST requests to the check-in endpoint with the SAME order_id.
 *
 * WHY THIS PROVES THE FIX WORKS:
 * --------------------------------
 * Before the fix, the controller used a two-step READ → WRITE pattern:
 *   1. SELECT order WHERE id = ?          (read: is checked_in false?)
 *   2. UPDATE order SET checked_in = true (write: mark as used)
 *
 * Between steps 1 and 2, a concurrent request could also pass step 1
 * (because checked_in was still false), allowing TWO scanners to both
 * receive a 200 success — the classic TOCTOU vulnerability.
 *
 * After the fix, the controller uses a single ATOMIC updateMany:
 *   UPDATE order SET checked_in = true
 *   WHERE id = ? AND status = 'APPROVED' AND checked_in = false
 *
 * The database guarantees that only ONE of the 10 concurrent requests
 * will win the atomic update (count === 1). All others find checked_in
 * already true and receive 409 — "Ingresso já utilizado".
 *
 * EXPECTED RESULT:
 *   ✅  Exactly 1 request → HTTP 200 (check-in successful)
 *   ❌  Exactly 9 requests → HTTP 409 (Ingresso já utilizado)
 *
 * USAGE:
 *   node stress-test.js [order_id]
 *   node stress-test.js 1
 */

// ---------------------------------------------------------------------------
// Configuration — edit ORDER_ID to match a valid APPROVED order in your DB.
// ---------------------------------------------------------------------------
const ORDER_ID = parseInt(process.argv[2] ?? '1', 10);
const ENDPOINT = 'http://localhost:3001/api/checkin';
const CONCURRENCY = 10;

// ---------------------------------------------------------------------------
// Helper: fire one request and return a normalised result object.
// ---------------------------------------------------------------------------
async function fireRequest(index) {
  const start = Date.now();
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: ORDER_ID }),
    });

    const body = await response.json().catch(() => ({}));
    const elapsed = Date.now() - start;

    return {
      index,
      status: response.status,
      body,
      elapsed,
      ok: response.status === 200,
    };
  } catch (err) {
    return {
      index,
      status: null,
      body: { error: err.message },
      elapsed: Date.now() - start,
      ok: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Main: launch all requests simultaneously and summarise the results.
// ---------------------------------------------------------------------------
async function main() {
  console.log('='.repeat(60));
  console.log(' STRESS TEST — Check-in TOCTOU Race Condition');
  console.log('='.repeat(60));
  console.log(`  Endpoint  : ${ENDPOINT}`);
  console.log(`  order_id  : ${ORDER_ID}`);
  console.log(`  Threads   : ${CONCURRENCY} simultaneous requests`);
  console.log('-'.repeat(60));
  console.log('Firing all requests NOW...\n');

  // Promise.all ensures all 10 requests are in-flight at the same time —
  // the closest we can get to a true race condition from a single process.
  const promises = Array.from({ length: CONCURRENCY }, (_, i) => fireRequest(i + 1));
  const results = await Promise.all(promises);

  // ---------------------------------------------------------------------------
  // Individual results
  // ---------------------------------------------------------------------------
  results.forEach(({ index, status, body, elapsed }) => {
    const icon = status === 200 ? '✅' : status === 409 ? '🔒' : '❌';
    const label = status === 200
      ? 'CHECK-IN OK'
      : status === 409
        ? 'Já utilizado'
        : `HTTP ${status ?? 'ERR'}`;

    console.log(
      `  [${String(index).padStart(2, '0')}] ${icon} ${label.padEnd(14)} | ` +
      `${elapsed}ms | ${JSON.stringify(body)}`
    );
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const successes = results.filter((r) => r.status === 200).length;
  const conflicts  = results.filter((r) => r.status === 409).length;
  const errors     = results.filter((r) => r.status !== 200 && r.status !== 409).length;

  console.log('\n' + '='.repeat(60));
  console.log(' SUMMARY');
  console.log('='.repeat(60));
  console.log(`  200 (check-in aceito)  : ${successes} request(s)`);
  console.log(`  409 (já utilizado)     : ${conflicts} request(s)`);
  console.log(`  Outros / Erro de rede  : ${errors} request(s)`);
  console.log('-'.repeat(60));

  if (successes === 1 && conflicts === CONCURRENCY - 1) {
    console.log(
      '\n  🎉 PASSOU! A correção atômica (updateMany) funcionou corretamente.\n' +
      '     Apenas 1 check-in foi aceito. Todos os demais foram bloqueados.'
    );
  } else if (successes === 0) {
    console.log(
      '\n  ⚠️  Nenhum check-in foi aceito.\n' +
      '     Verifique se o order_id existe, está com status APPROVED\n' +
      '     e ainda não foi utilizado (checked_in = false).\n' +
      '     Dica: redefina checked_in para false no banco antes de rodar novamente.'
    );
  } else if (successes > 1) {
    console.log(
      `\n  🚨 FALHOU! ${successes} requests retornaram 200.\n` +
      '     Isso indica que a condição de corrida ainda existe.\n' +
      '     Verifique se o updateMany atômico está sendo usado corretamente.'
    );
  } else {
    console.log('\n  ⚠️  Resultado inesperado — verifique os erros acima.');
  }

  console.log('='.repeat(60) + '\n');
}

main();
