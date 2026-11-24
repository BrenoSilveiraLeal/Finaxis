'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mapTx, mapAccounts, bankKey } = require('../server/openfinance/mapping');

const conn = { id: 'c1', provider: 'pluggy', bank_key: 'nubank', bank_name: 'Nubank', bank_color: '#820AD1' };
const bank = { id: 'acc-1', type: 'BANK', subtype: 'CHECKING_ACCOUNT', balance: 1500.5, name: 'Conta' };
const card = { id: 'card-1', type: 'CREDIT', subtype: 'CREDIT_CARD', balance: 820, number: '5162 **** 4821', name: 'Ultravioleta',
  creditData: { brand: 'MASTERCARD', creditLimit: 6000, availableCreditLimit: 5180, balanceDueDate: '2026-11-10T00:00:00.000Z' } };

test('conta bancária: DEBIT é saída, CREDIT é entrada', () => {
  const out = mapTx({ id: 't1', description: 'PIX ENVIADO Padaria', amount: -18.4, type: 'DEBIT', date: '2026-11-03T10:00:00Z' }, bank, conn);
  assert.equal(out.amount, -18.4);
  assert.equal(out.method, 'pix');
  assert.equal(out.accountId, 'of_acc-1');
  assert.equal(out.id, 'of_t1');
  assert.equal(out.date, '2026-11-03');
  const inc = mapTx({ id: 't2', description: 'Salário', amount: 6200, type: 'CREDIT', date: '2026-11-05' }, bank, conn);
  assert.equal(inc.amount, 6200);
});

test('cartão: compra vira saída mesmo com sinal/tipo inconsistentes; pagamento e estorno viram entrada', () => {
  // a doc da Pluggy mostra compras com sinais diferentes: tratamos as duas formas como compra
  assert.equal(mapTx({ id: 'a', description: 'MERCADOLIVRE', amount: 159.2, type: 'CREDIT', date: '2026-11-01' }, card, conn).amount, -159.2);
  assert.equal(mapTx({ id: 'b', description: 'NETFLIX.COM', amount: -55.9, type: 'DEBIT', date: '2026-11-01' }, card, conn).amount, -55.9);
  const pay = mapTx({ id: 'c', description: 'Pagamento recebido fatura', amount: -900, date: '2026-11-10' }, card, conn);
  assert.equal(pay.amount, 900);
  assert.equal(pay.cat, 'fatura');
  assert.equal(mapTx({ id: 'd', description: 'Estorno compra', amount: -30, date: '2026-11-02' }, card, conn).amount, 30);
  const inst = mapTx({ id: 'e', description: 'Magalu', amount: 100, date: '2026-11-02', creditCardMetadata: { installmentNumber: 2, totalInstallments: 5 } }, card, conn);
  assert.equal(inst.desc, 'Magalu (2/5)');
  assert.equal(inst.method, 'credito');
  assert.equal(inst.cardId, 'of_card-1');
});

test('pagamento de fatura na conta é marcado como fatura (não conta como gasto)', () => {
  const t = mapTx({ id: 'f', description: 'PAGAMENTO FATURA CARTAO', amount: -1199.37, type: 'DEBIT', date: '2026-11-10' }, bank, conn);
  assert.equal(t.cat, 'fatura');
  assert.equal(t.method, 'debito');
});

test('contas e cartões', () => {
  const { accs, cards } = mapAccounts(conn, [bank, card]);
  assert.equal(accs.length, 1);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].last4, '4821');
  assert.equal(cards[0].brand, 'Mastercard');
  assert.equal(cards[0].dueDay, 10);
  assert.equal(cards[0].limit, 6000);
  assert.equal(cards[0].available, 5180);
  assert.equal(cards[0].accountId, 'of_acc-1');
  assert.equal(bankKey('Itaú Unibanco'), 'itau');
  assert.equal(bankKey('Pluggy Bank'), 'other');
});
