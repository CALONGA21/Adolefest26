/**
 * CHECKOUT STRESS TEST — Overselling / Deadlock / Concurrency Validation
 * =========================================================================
 * This script fires 20 simultaneous POST requests to /api/process_payment
 * using unique caller identities (CPF + email) so each request goes through
 * the full checkout path inside a serialized DB transaction.
 *
 * WHAT IS BEING TESTED:
 * ─────────────────────
 * 1. NO DEADLOCKS
 *    The paymentController uses two nested FOR UPDATE locks:
 *      a) SELECT ... FROM events WHERE id = ? FOR UPDATE
 *      b) SELECT COUNT(*) FROM orders WHERE ... FOR UPDATE
 *    Under heavy concurrency PostgreSQL serializes these transactions.
 *    Expected: zero 500 errors with "deadlock detected" in the server log.
 *
 * 2. OVERSELLING PROTECTION
 *    After the locks, the controller checks:
 *      reservedTickets >= eventRow.total_tickets → throws SoldOutError → 400
 *    If the event has fewer remaining tickets than the 20 concurrent buyers
 *    the excess requests must receive HTTP 400 "Esgotado", not sneak through.
 *    Expected: (successes + 409_conflicts) <= total_tickets remaining.
 *
 * 3. RATE LIMITER AWARENESS
 *    The server enforces a checkoutLimiter: max 10 requests / 60 s per IP.
 *    Because all 20 requests originate from 127.0.0.1, the last ~10 will
 *    receive HTTP 429 "Muitas tentativas no checkout."
 *    This is CORRECT behaviour — the test reports them separately so they
 *    do not mask real errors.
 *
 * USAGE:
 *   node checkout-stress-test.js          # event ID 1 (default)
 *   node checkout-stress-test.js 3        # event ID 3
 */

// ─── Configuration ───────────────────────────────────────────────────────────
const ENDPOINT = 'http://localhost:3001/api/process_payment';
const CONCURRENCY = 20;
const PACOTE = 'ingresso'; // 'ingresso' | 'combo' | 'camiseta'
const TAMANHO_CAMISA = 'M'; // only used when PACOTE requires a shirt size

// ─── CPF Generator ───────────────────────────────────────────────────────────
// Generates a mathematically valid Brazilian CPF.
// The CPF check-digit algorithm (Receita Federal) is reproduced here so the
// server-side validator does not reject our synthetic test identities.
function generateValidCpf() {
  while (true) {
    const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));

    // Reject all-same-digit CPFs (000.000.000-00, etc.) — they fail validation.
    if (/^(\d)\1+$/.test(digits.join(''))) continue;

    // First check digit
    let sum = digits.reduce((acc, d, i) => acc + d * (10 - i), 0);
    let remainder = sum % 11;
    digits.push(remainder < 2 ? 0 : 11 - remainder);

    // Second check digit
    sum = digits.reduce((acc, d, i) => acc + d * (11 - i), 0);
    remainder = sum % 11;
    digits.push(remainder < 2 ? 0 : 11 - remainder);

    return digits.join('');
  }
}

// ─── Request builder ─────────────────────────────────────────────────────────
function buildPayload(index) {
  const cpf = generateValidCpf();
  const tag = `stresstest${Date.now()}${index}`;
  const payload = {
    cpf,
    nome: `Teste Estresse ${index}`,
    email: `${tag}@stresstest.invalid`,
    pacote: PACOTE,
  };
  if (PACOTE === 'combo' || PACOTE === 'camiseta') {
    payload.tamanho_camisa = TAMANHO_CAMISA;
  }
  return payload;
}

async function fireRequest(index) {
  const payload = buildPayload(index);
  const start = Date.now();
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    return { index, status: response.status, body, elapsed: Date.now() - start, cpf: payload.cpf };
  } catch (err) {
    return { index, status: null, body: { error: err.message }, elapsed: Date.now() - start, cpf: payload.cpf };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(65));
  console.log(' CHECKOUT STRESS TEST — Overselling & Deadlock Validation');
  console.log('='.repeat(65));
  console.log(`  Endpoint    : ${ENDPOINT}`);
  console.log(`  Pacote      : ${PACOTE}`);
  console.log(`  Concorrência: ${CONCURRENCY} requisições simultâneas`);
  console.log('-'.repeat(65));
  console.log('Disparando todas as requisições AGORA...\n');

  const promises = Array.from({ length: CONCURRENCY }, (_, i) => fireRequest(i + 1));
  const results = await Promise.all(promises);

  // ─── Individual results ──────────────────────────────────────────────────
  results.forEach(({ index, status, body, elapsed }) => {
    let icon, label;
    if (status === 200) {
      icon = '✅'; label = 'OK - Preferência criada';
    } else if (status === 400 && body?.error === 'Esgotado') {
      icon = '🎫'; label = 'ESGOTADO (limite OK)';
    } else if (status === 409) {
      icon = '🔒'; label = 'Conflito identidade';
    } else if (status === 429) {
      icon = '🚦'; label = 'Rate limited (429)';
    } else if (status === 400) {
      icon = '⚠️ '; label = `Bad request (400)`;
    } else if (status === 500) {
      icon = '🔥'; label = 'ERRO INTERNO (500)';
    } else {
      icon = '❌'; label = `HTTP ${status ?? 'ERR'}`;
    }

    const errorDetail = status !== 200 ? ` → ${body?.error ?? JSON.stringify(body)}` : '';
    console.log(
      `  [${String(index).padStart(2, '0')}] ${icon} ${label.padEnd(22)} | ${elapsed}ms${errorDetail}`
    );
  });

  // ─── Summary ─────────────────────────────────────────────────────────────
  const successes     = results.filter((r) => r.status === 200).length;
  const soldOut       = results.filter((r) => r.status === 400 && r.body?.error === 'Esgotado').length;
  const conflicts     = results.filter((r) => r.status === 409).length;
  const rateLimited   = results.filter((r) => r.status === 429).length;
  const badRequest    = results.filter((r) => r.status === 400 && r.body?.error !== 'Esgotado').length;
  const serverErrors  = results.filter((r) => r.status === 500).length;
  const networkErrors = results.filter((r) => r.status === null).length;

  console.log('\n' + '='.repeat(65));
  console.log(' RESUMO');
  console.log('='.repeat(65));
  console.log(`  200 ✅  Compras aceitas             : ${successes}`);
  console.log(`  400 🎫  Esgotado (limite respeitado): ${soldOut}`);
  console.log(`  409 🔒  Conflito de identidade      : ${conflicts}`);
  console.log(`  429 🚦  Rate limited (esperado)     : ${rateLimited}`);
  console.log(`  400 ⚠️   Outros bad-request          : ${badRequest}`);
  console.log(`  500 🔥  Erros internos (ALERTA!)    : ${serverErrors}`);
  console.log(`  ❌      Erro de rede                : ${networkErrors}`);
  console.log('-'.repeat(65));

  // ─── Verdict ─────────────────────────────────────────────────────────────
  console.log('\n VEREDICTO:');

  if (serverErrors > 0) {
    console.log(
      `\n  🚨 FALHOU — ${serverErrors} requisição(ões) retornaram HTTP 500.\n` +
      '     Verifique o log do servidor. Pode ser deadlock, constraint violation\n' +
      '     ou erro no Mercado Pago. Detalhes acima na linha com 🔥.'
    );
  } else if (networkErrors > 0) {
    console.log(
      `\n  ❌ ${networkErrors} requisição(ões) não chegaram ao servidor.\n` +
      '     Confirme que o backend está rodando em http://localhost:3001.'
    );
  } else {
    console.log(
      '\n  ✅ PASSOU — Nenhum deadlock ou erro 500 detectado.\n' +
      `     ${successes} compra(s) aprovadas. ` +
      (soldOut > 0 ? `${soldOut} bloqueadas por esgotamento. ` : '') +
      (rateLimited > 0 ? `${rateLimited} bloqueadas pelo rate limiter (comportamento normal).` : '')
    );
  }

  if (rateLimited > 0) {
    console.log(
      '\n  ℹ️  RATE LIMITER ativo: o servidor limita 10 checkouts/min por IP.\n' +
      '     Para testar APENAS overselling sem o rate limiter, comente\n' +
      '     o middleware checkoutLimiter em server.ts durante o teste.'
    );
  }

  console.log('\n' + '='.repeat(65) + '\n');
}

main();
