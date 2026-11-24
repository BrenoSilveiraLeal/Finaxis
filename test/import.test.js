'use strict';
// Leitura de extratos/faturas: `npm test`
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseStatement, parseAmount, parseDate } = require('../assets/js/importer.js');

const enc = (s) => new TextEncoder().encode(s);

test('valores e datas em formatos brasileiros', () => {
  assert.equal(parseAmount('R$ -1.234,56'), -1234.56);
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount('-12.5'), -12.5);
  assert.equal(parseAmount('(45,00)'), -45);
  assert.equal(parseAmount('150'), 150);
  assert.equal(parseDate('05/11/2026'), '2026-11-05');
  assert.equal(parseDate('2026-11-05'), '2026-11-05');
  assert.equal(parseDate('20261105120000[-3:BRT]'), '2026-11-05');
  assert.equal(parseDate('31/02/2026'), null);
});

test('OFX de conta corrente (Itaú, Windows-1252)', () => {
  const ofx = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0341<ACCTID>123456<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261101
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261103<TRNAMT>-186.40<FITID>A1<MEMO>PAO DE ACUCAR</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105<TRNAMT>6200.00<FITID>A2<MEMO>SALARIO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261106<TRNAMT>-50,00<FITID>A3<MEMO>PIX ENVIADO JOÃO</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>3963.60<DTASOF>20261106</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const bytes = new Uint8Array([...ofx].map((c) => (c === 'Ã' ? 0xC3 : c.charCodeAt(0) & 0xff)));
  const r = parseStatement(bytes, 'extrato.ofx');
  assert.equal(r.format, 'OFX');
  assert.equal(r.kind, 'account');
  assert.equal(r.bank, 'itau');
  assert.equal(r.balance, 3963.6);
  assert.equal(r.invert, false);
  assert.deepEqual(r.tx.map((t) => t.amount), [-186.4, 6200, -50]);
  assert.equal(r.tx[2].desc, 'PIX ENVIADO JOÃO');
});

test('OFX de cartão com compras positivas é marcado para inverter', () => {
  const ofx = `OFXHEADER:100
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CCACCTFROM><ACCTID>5555444433331234</CCACCTFROM><BANKTRANLIST>
<STMTTRN><DTPOSTED>20261101<TRNAMT>89.90<FITID>c1<MEMO>Netflix</STMTTRN>
<STMTTRN><DTPOSTED>20261102<TRNAMT>45.00<FITID>c2<MEMO>Uber</STMTTRN>
<STMTTRN><DTPOSTED>20261110<TRNAMT>-900.00<FITID>c3<MEMO>Pagamento recebido</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
  const r = parseStatement(enc(ofx), 'fatura.ofx');
  assert.equal(r.kind, 'card');
  assert.equal(r.last4, '1234');
  assert.equal(r.invert, true);
});

test('CSV da fatura Nubank (date,title,amount)', () => {
  const r = parseStatement(enc('date,title,amount\n2026-11-01,Mercado Livre,159.20\n2026-11-02,iFood,42.5\n2026-11-08,Pagamento recebido,-900\n'), 'Nubank_2026-11.csv');
  assert.equal(r.kind, 'card');
  assert.equal(r.bank, 'nubank');
  assert.equal(r.invert, true);
  assert.equal(r.tx.length, 3);
});

test('CSV da conta Nubank (Data,Valor,Identificador,Descrição)', () => {
  const csv = '﻿Data,Valor,Identificador,Descrição\n01/11/2026,-25.90,abc,Transferência enviada pelo Pix - Maria\n05/11/2026,6200.00,def,Transferência recebida - Empresa\n';
  const r = parseStatement(enc(csv), 'NU_123.csv');
  assert.equal(r.kind, 'account');
  assert.equal(r.bank, 'nubank');
  assert.equal(r.invert, false);
  assert.deepEqual(r.tx.map((t) => [t.date, t.amount, t.fitid]), [['2026-11-01', -25.9, 'abc'], ['2026-11-05', 6200, 'def']]);
});

test('CSV com ponto e vírgula, colunas de entrada e saída e linha de saldo', () => {
  const csv = 'Extrato conta corrente\nData;Histórico;Entrada;Saída;Saldo\n02/11/2026;SALDO ANTERIOR;;;1.000,00\n03/11/2026;PIX RECEBIDO;150,00;;1.150,00\n04/11/2026;COMPRA CARTAO DEBITO;;1.234,56;-84,56\n';
  const r = parseStatement(enc(csv), 'extrato-bradesco.csv');
  assert.equal(r.bank, 'bradesco');
  assert.deepEqual(r.tx.map((t) => t.amount), [150, -1234.56]);
});

test('arquivo sem colunas reconhecíveis dá erro claro', () => {
  assert.throws(() => parseStatement(enc('foo;bar\n1;2\n'), 'x.csv'), /colunas de data e valor/);
});
