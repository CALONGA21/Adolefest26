/**
 * prep-test.js
 * Prepara o banco para o stress-test: define o pedido como APPROVED e
 * checked_in = false, e exibe o id a ser usado.
 *
 * Uso:
 *   node prep-test.js          → usa o 1º pedido encontrado (qualquer status)
 *   node prep-test.js 5        → força o pedido id=5
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const targetId = process.argv[2] ? parseInt(process.argv[2], 10) : null;

  // Busca um pedido existente
  const order = targetId
    ? await prisma.order.findUnique({ where: { id: targetId } })
    : await prisma.order.findFirst({ orderBy: { id: 'asc' } });

  if (!order) {
    console.error('\n❌ Nenhum pedido encontrado no banco.');
    console.error('   Crie um pedido primeiro pelo fluxo normal do sistema.\n');
    process.exit(1);
  }

  // Força status APPROVED e checked_in = false para o teste
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'APPROVED', checked_in: false },
  });

  console.log('\n✅ Pedido preparado para o teste:');
  console.log(`   id          : ${order.id}`);
  console.log(`   status      : APPROVED  (era: ${order.status})`);
  console.log(`   checked_in  : false     (era: ${order.checked_in})`);
  console.log('\n▶  Agora rode:');
  console.log(`   node stress-test.js ${order.id}\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
