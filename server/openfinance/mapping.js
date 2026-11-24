'use strict';
/** Converte contas/cartões/transações do agregador para o formato usado pelo app. */

const BANK_KEYS = [
  [/nubank|nu pagamentos/i, 'nubank'], [/ita[uú]/i, 'itau'], [/bradesco/i, 'bradesco'], [/\binter\b/i, 'inter'],
  [/banco do brasil|^bb\b/i, 'bb'], [/santander/i, 'santander'], [/\bc6\b/i, 'c6'], [/caixa/i, 'caixa'],
  [/picpay/i, 'picpay'], [/mercado ?pago/i, 'mercadopago'],
];
const bankKey = (name) => { for (const [re, k] of BANK_KEYS) if (re.test(name || '')) return k; return 'other'; };

const PAYMENT_RE = /pagamento.*(fatura|cart)|pgto.*(fatura|cart)|pag(to)? fatura|fatura.*pag|credit card payment|bill payment/i;
const REFUND_RE = /estorno|reembolso|refund|cancelamento/i;

const brandName = (b) => (b ? String(b).charAt(0) + String(b).slice(1).toLowerCase() : '');
const dayOf = (iso, dflt) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.getUTCDate() : dflt; };

function mapAccounts(conn, accounts) {
  const bank = { bank: conn.bank_key || 'other', bankName: conn.bank_name, bankColor: conn.bank_color };
  const base = { connected: true, provider: conn.provider, connectionId: conn.id, lastSync: Date.now() };
  const bankAccs = accounts.filter((a) => a.type !== 'CREDIT');
  const firstBankId = bankAccs[0] ? 'of_' + bankAccs[0].id : null;
  const accs = bankAccs.map((a) => ({
    id: 'of_' + a.id, ...bank, ...base,
    name: a.marketingName || a.name || `Conta ${conn.bank_name || ''}`.trim(),
    kind: a.subtype === 'SAVINGS_ACCOUNT' ? 'poupanca' : 'corrente',
    balance: Number(a.balance) || 0,
  }));
  const cards = accounts.filter((a) => a.type === 'CREDIT').map((a) => {
    const cd = a.creditData || {};
    const limit = Number(cd.creditLimit) || 0;
    const available = cd.availableCreditLimit != null ? Number(cd.availableCreditLimit) : null;
    return {
      id: 'of_' + a.id, ...bank, ...base,
      name: a.marketingName || a.name || `${conn.bank_name || ''} Crédito`.trim(),
      brand: brandName(cd.brand), last4: String(a.number || '').replace(/\D/g, '').slice(-4),
      limit, available, statementBalance: Math.abs(Number(a.balance) || 0),
      dueDay: dayOf(cd.balanceDueDate, 10), dueDate: cd.balanceDueDate ? String(cd.balanceDueDate).slice(0, 10) : null,
      accountId: firstBankId,
    };
  });
  return { accs, cards };
}

function mapInvestments(conn, investments) {
  return investments.filter((x) => x.status !== 'TOTAL_WITHDRAWAL').map((x) => ({
    id: 'of_' + x.id,
    name: String(x.name || x.subtype || 'Investimento').slice(0, 160),
    issuer: x.issuer || conn.bank_name,
    type: x.type || 'OTHER',
    subtype: x.subtype || null,
    currencyCode: x.currencyCode || null,
    balance: Number(x.balance ?? x.amountWithdrawal ?? x.amount) || 0,
    originalAmount: Number(x.amountOriginal) || 0,
    availableToWithdraw: x.amountWithdrawal == null ? null : Number(x.amountWithdrawal),
    rate: x.rate == null ? null : Number(x.rate),
    rateType: x.rateType || null,
    date: x.date ? String(x.date).slice(0, 10) : null,
    dueDate: x.dueDate ? String(x.dueDate).slice(0, 10) : null,
    status: x.status || 'ACTIVE',
    bank: conn.bank_key || 'other',
    bankName: conn.bank_name,
    bankColor: conn.bank_color,
    connectionId: conn.id,
    provider: 'pluggy',
  }));
}

function methodFor(t, isCard) {
  if (isCard) return 'credito';
  const pm = String((t.paymentData && t.paymentData.paymentMethod) || '').toUpperCase();
  const d = `${t.description || ''} ${t.descriptionRaw || ''}`;
  if (pm === 'PIX' || /\bpix\b/i.test(d)) return 'pix';
  if (pm === 'BOLETO' || /boleto/i.test(d)) return 'boleto';
  if (/^(TED|DOC|TEF)$/.test(pm) || /\b(ted|doc|transf)/i.test(d)) return 'ted';
  return 'debito';
}

/**
 * Sinal no app: negativo = saída. Conta bancária: Pluggy usa negativo para saída (DEBIT).
 * Cartão: a doc da Pluggy é ambígua (exemplos com sinais diferentes), então decidimos pela
 * descrição: pagamento de fatura/estorno = positivo; o resto é compra = negativo.
 */
function mapTx(t, account, conn) {
  const isCard = account.type === 'CREDIT';
  const desc = String(t.description || t.descriptionRaw || 'Transação').slice(0, 200);
  const abs = Math.abs(Number(t.amount) || 0);
  const operation = String(t.operationType || '').toUpperCase();
  let amount, cat = null;
  if (isCard) {
    const cardPayment = PAYMENT_RE.test(desc) || /credit card payment/i.test(t.category || '') || ['PAGAMENTO', 'PAGAMENTO_FATURA'].includes(operation);
    const credit = t.type === 'CREDIT' || cardPayment || REFUND_RE.test(desc) || operation === 'ESTORNO' || operation === 'CASHBACK';
    amount = credit ? abs : -abs;
    if (cardPayment) cat = 'fatura';
  } else {
    amount = t.type === 'CREDIT' ? abs : t.type === 'DEBIT' ? -abs : Number(t.amount) || 0;
    if (amount < 0 && (PAYMENT_RE.test(desc) || /credit card payment/i.test(t.category || ''))) cat = 'fatura';
  }
  const cc = t.creditCardMetadata || {};
  const inst = cc.totalInstallments > 1 && cc.installmentNumber ? ` (${cc.installmentNumber}/${cc.totalInstallments})` : '';
  return {
    id: 'of_' + t.id,
    date: String(t.date || '').slice(0, 10),
    desc: desc + (inst && !desc.includes(inst.trim()) ? inst : ''),
    amount: Math.round(amount * 100) / 100,
    cat,
    bankCategory: t.category || null,
    method: methodFor(t, isCard),
    source: 'bank',
    pending: t.status === 'PENDING' || undefined,
    ...(isCard ? { cardId: 'of_' + account.id } : { accountId: 'of_' + account.id }),
    connectionId: conn.id,
  };
}

module.exports = { bankKey, mapAccounts, mapInvestments, mapTx };
