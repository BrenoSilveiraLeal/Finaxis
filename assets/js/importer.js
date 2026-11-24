/* ==========================================================================
   FINAXIS — leitura de extratos e faturas (OFX e CSV) no navegador.
   Nada é enviado a terceiros: o arquivo é lido aqui e vira transações.
   ========================================================================== */
(function (root) {
  'use strict';

  // Código COMPE do banco -> chave usada no app
  const BANK_CODES = {
    260: 'nubank', 341: 'itau', 237: 'bradesco', 77: 'inter', 1: 'bb', 33: 'santander',
    336: 'c6', 104: 'caixa', 380: 'picpay', 323: 'mercadopago',
  };
  const BANK_NAMES = [
    [/nu ?bank|nu pagamentos/i, 'nubank'], [/ita[uú]/i, 'itau'], [/bradesco/i, 'bradesco'], [/\binter\b/i, 'inter'],
    [/banco do brasil|\bbb\b/i, 'bb'], [/santander/i, 'santander'], [/\bc6\b/i, 'c6'], [/caixa/i, 'caixa'],
    [/picpay/i, 'picpay'], [/mercado ?pago|mercado ?livre/i, 'mercadopago'],
  ];
  const bankFromText = (s) => { for (const [re, k] of BANK_NAMES) if (re.test(s || '')) return k; return null; };

  /** Lê bytes como texto: UTF-8 e, se aparecerem caracteres inválidos, Windows-1252 (comum em OFX de banco). */
  function decode(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const utf = new TextDecoder('utf-8').decode(bytes);
    if (!utf.includes('�')) return utf.replace(/^﻿/, '');
    return new TextDecoder('windows-1252').decode(bytes);
  }

  /** "R$ -1.234,56", "1,234.56", "-12.5", "(45,00)" -> número */
  function parseAmount(raw) {
    let s = String(raw == null ? '' : raw).trim();
    if (!s) return NaN;
    let neg = /^\(.*\)$/.test(s) || /-/.test(s.replace(/\d[-]\d/g, ''));
    s = s.replace(/[^\d.,]/g, '');
    if (!s) return NaN;
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      const dec = lastDot > lastComma ? '.' : ',';
      s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
    } else if (lastComma >= 0) {
      s = s.split('.').join('').replace(/,(?=[^,]*$)/, '.').replace(/,/g, '');
    } else if ((s.match(/\./g) || []).length > 1) {
      s = s.replace(/\./g, '');
    }
    const v = Number(s);
    return Number.isFinite(v) ? Math.round((neg ? -v : v) * 100) / 100 : NaN;
  }

  /** dd/mm/aaaa, dd/mm/aa, aaaa-mm-dd, dd-mm-aaaa, aaaammdd -> aaaa-mm-dd */
  function parseDate(raw) {
    const s = String(raw || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    let y, mo, d;
    if (m) [, y, mo, d] = m;
    else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) { [, d, mo, y] = m; if (y.length === 2) y = '20' + y; }
    else if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/))) [, y, mo, d] = m;
    else return null;
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const t = new Date(iso + 'T12:00:00Z');
    return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? null : iso;
  }

  /* ------------------------------------------------------------------ OFX */
  function parseOFX(text) {
    const tag = (block, name) => { const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i')); return m ? m[1].trim() : ''; };
    const isCard = /<CCSTMTRS>/i.test(text);
    const code = Number(tag(text, 'BANKID'));
    const bank = BANK_CODES[code] || bankFromText(tag(text, 'ORG')) || bankFromText(tag(text, 'FID')) || null;
    const acct = tag(text, 'ACCTID');
    const ledger = text.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/i);
    const tx = [];
    const re = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi;
    let m;
    while ((m = re.exec(text))) {
      const b = m[1];
      const date = parseDate(tag(b, 'DTPOSTED'));
      const amount = parseAmount(tag(b, 'TRNAMT'));
      if (!date || !Number.isFinite(amount) || amount === 0) continue;
      const desc = (tag(b, 'MEMO') || tag(b, 'NAME') || tag(b, 'TRNTYPE') || 'Lançamento').replace(/\s+/g, ' ');
      tx.push({ date, amount, desc, fitid: tag(b, 'FITID') });
    }
    return {
      format: 'OFX', kind: isCard ? 'card' : 'account', bank, last4: acct.replace(/\D/g, '').slice(-4),
      balance: ledger ? parseAmount(ledger[1]) : null,
      // OFX segue o padrão: negativo = saída. Alguns bancos invertem no cartão; a maioria de positivos sinaliza isso.
      invert: isCard && tx.filter((t) => t.amount > 0).length > tx.filter((t) => t.amount < 0).length,
      tx,
    };
  }

  /* ------------------------------------------------------------------ CSV */
  function splitCSV(text) {
    const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
    const count = (c) => (first.match(new RegExp(c === '\t' ? '\t' : '\\' + c, 'g')) || []).length;
    const sep = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
  }

  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  function parseCSV(text, filename) {
    const rows = splitCSV(text);
    let h = -1, cols = null;
    for (let i = 0; i < Math.min(rows.length, 30) && h < 0; i++) {
      const r = rows[i].map(norm);
      const find = (re, not) => r.findIndex((c) => re.test(c) && !(not && not.test(c)));
      const date = find(/^(data|date|dt)\b|data (da )?(compra|lancamento|transacao|movimento)/);
      const amount = find(/^(valor|amount|value|quantia)|valor \(?r\$|valor da transacao/, /saldo|dolar|us\$|usd/);
      const inCol = find(/^(entrada|credito)s?\b|valor credito/);
      const outCol = find(/^(saida|debito)s?\b|valor debito/);
      const desc = find(/descri|^title$|titulo|historico|lancamento$|^memo$|estabelecimento|detalhe|^nome$/);
      if (date >= 0 && (amount >= 0 || inCol >= 0 || outCol >= 0)) {
        h = i;
        cols = { date, amount, inCol, outCol, desc, id: find(/^(identificador|id|fitid)$/), header: r };
      }
    }
    if (h < 0) throw new Error('Não encontrei as colunas de data e valor neste CSV. Exporte o extrato em OFX ou em CSV com cabeçalho.');
    const tx = [];
    for (const r of rows.slice(h + 1)) {
      const date = parseDate(r[cols.date]);
      let amount = cols.amount >= 0 ? parseAmount(r[cols.amount]) : NaN;
      if (!Number.isFinite(amount)) {
        const a = cols.inCol >= 0 ? parseAmount(r[cols.inCol]) : NaN, b = cols.outCol >= 0 ? parseAmount(r[cols.outCol]) : NaN;
        amount = (Number.isFinite(a) ? Math.abs(a) : 0) - (Number.isFinite(b) ? Math.abs(b) : 0);
      }
      const desc = (cols.desc >= 0 ? r[cols.desc] : '') || 'Lançamento';
      if (!date || !Number.isFinite(amount) || amount === 0 || /^saldo\b|saldo (anterior|do dia|final)/i.test(desc)) continue;
      tx.push({ date, amount, desc: desc.replace(/\s+/g, ' '), fitid: cols.id >= 0 ? r[cols.id] : '' });
    }
    // Fatura em CSV (ex.: Nubank "date,title,amount"): compras vêm positivas
    const header = cols.header.join(' ');
    const looksCard = /\btitle\b/.test(header) && cols.id < 0 || /fatura|cartao|credit/i.test(filename || '');
    const kind = looksCard ? 'card' : 'account';
    return {
      format: 'CSV', kind, bank: bankFromText(filename) || (/\btitle\b/.test(header) || /identificador/.test(header) ? 'nubank' : null),
      last4: '', balance: null,
      invert: kind === 'card' && tx.filter((t) => t.amount > 0).length >= tx.filter((t) => t.amount < 0).length,
      tx,
    };
  }

  /** Ponto de entrada: bytes do arquivo + nome -> extrato normalizado. */
  function parseStatement(buffer, filename) {
    const text = decode(buffer);
    const isOFX = /<OFX>|OFXHEADER/i.test(text.slice(0, 2000));
    const out = isOFX ? parseOFX(text) : parseCSV(text, filename);
    if (!out.tx.length) throw new Error('Nenhum lançamento encontrado neste arquivo.');
    out.tx.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }

  /** Hash curto e estável (FNV-1a) para gerar IDs que não duplicam quando o mesmo arquivo é importado de novo. */
  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }

  const api = { parseStatement, parseAmount, parseDate, hash };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FinaxisImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
