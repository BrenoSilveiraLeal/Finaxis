'use strict';
const { HttpError } = require('./util');

const MAX_DOC_BYTES = 2 * 1024 * 1024;
const MAX_TX_PER_PUT = 20000;

/** Validação mínima de uma transação vinda do cliente. */
function validTx(t) {
  return t && typeof t === 'object'
    && typeof t.id === 'string' && t.id.length > 0 && t.id.length <= 80
    && typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
    && Number.isFinite(t.amount) && Math.abs(t.amount) < 1e10
    && typeof t.desc === 'string' && t.desc.length <= 300;
}

function createStore(db) {
  const q = {
    getDoc: db.prepare('SELECT data, version FROM docs WHERE user_id = ?'),
    insDoc: db.prepare('INSERT INTO docs (user_id, data, version, updated_at) VALUES (?, ?, ?, ?)'),
    updDoc: db.prepare('UPDATE docs SET data = ?, version = ?, updated_at = ? WHERE user_id = ?'),
    allTx: db.prepare('SELECT data FROM transactions WHERE user_id = ? ORDER BY date'),
    getTx: db.prepare('SELECT data FROM transactions WHERE user_id = ? AND id = ?'),
    upTx: db.prepare(`INSERT INTO transactions (user_id, id, date, data, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (user_id, id) DO UPDATE SET date = excluded.date, data = excluded.data, updated_at = excluded.updated_at`),
    delTx: db.prepare('DELETE FROM transactions WHERE user_id = ? AND id = ?'),
    tomb: db.prepare('INSERT OR IGNORE INTO tx_tombstones (user_id, id, deleted_at) VALUES (?, ?, ?)'),
    isTomb: db.prepare('SELECT 1 AS x FROM tx_tombstones WHERE user_id = ? AND id = ?'),
  };

  function readDoc(uid) {
    const r = q.getDoc.get(uid);
    return r ? { doc: JSON.parse(r.data), version: r.version } : { doc: null, version: 0 };
  }

  function writeDoc(uid, doc, prevVersion) {
    const data = JSON.stringify(doc);
    if (data.length > MAX_DOC_BYTES) throw new HttpError(413, 'Documento grande demais');
    const now = Date.now();
    if (prevVersion === 0) q.insDoc.run(uid, data, 1, now);
    else q.updDoc.run(data, prevVersion + 1, now, uid);
    return prevVersion + 1;
  }

  /** Alteração feita pelo servidor (sync bancário). Sempre incrementa a versão. */
  function mutateDoc(uid, fn) {
    const { doc, version } = readDoc(uid);
    const d = doc || {};
    fn(d);
    return writeDoc(uid, d, version);
  }

  const listTx = (uid) => q.allTx.all(uid).map((r) => JSON.parse(r.data));
  const getTx = (uid, id) => { const r = q.getTx.get(uid, id); return r ? JSON.parse(r.data) : null; };
  const putTx = (uid, t) => q.upTx.run(uid, t.id, t.date, JSON.stringify(t), Date.now());
  const isTombstoned = (uid, id) => !!q.isTomb.get(uid, id);

  function getState(uid) {
    const { doc, version } = readDoc(uid);
    return { doc, version, tx: listTx(uid) };
  }

  /**
   * Aplica alterações do cliente. Transações (upserts/deletes) são idempotentes e sempre aplicadas;
   * o documento usa controle otimista de versão e pode gerar conflito (409).
   */
  function applyClientChanges(uid, body) {
    const { baseVersion, doc, upserts = [], deletes = [] } = body || {};
    if (!Array.isArray(upserts) || !Array.isArray(deletes)) throw new HttpError(400, 'Formato inválido');
    if (upserts.length > MAX_TX_PER_PUT || deletes.length > MAX_TX_PER_PUT) throw new HttpError(413, 'Lote grande demais');
    let rejected = 0;
    return db.atomic(() => {
      const now = Date.now();
      for (const t of upserts) { if (validTx(t)) putTx(uid, t); else rejected++; }
      for (const id of deletes) {
        if (typeof id !== 'string') continue;
        q.delTx.run(uid, id);
        if (/^(of|dm)_/.test(id)) q.tomb.run(uid, id, now); // transação bancária: não reimportar
      }
      const cur = readDoc(uid);
      if (doc === undefined) return { ok: true, version: cur.version, rejected };
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new HttpError(400, 'Documento inválido');
      if (cur.version !== baseVersion) return { ok: false, conflict: true, version: cur.version, doc: cur.doc, rejected };
      const clean = { ...doc };
      delete clean.tx;
      return { ok: true, version: writeDoc(uid, clean, cur.version), rejected };
    });
  }

  return { readDoc, writeDoc, mutateDoc, listTx, getTx, putTx, isTombstoned, getState, applyClientChanges, delTx: (uid, id) => q.delTx.run(uid, id) };
}

module.exports = { createStore, validTx };
