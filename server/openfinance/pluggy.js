'use strict';
/**
 * Cliente mínimo da API Pluggy (Open Finance Brasil) — https://docs.pluggy.ai
 * - POST /auth {clientId, clientSecret} -> {apiKey} (válida por 2h), enviada em X-API-KEY
 * - POST /connect_token {options:{clientUserId, webhookUrl, avoidDuplicates}} -> {accessToken} (30 min)
 * - GET /items/{id}, DELETE /items/{id}
 * - GET /accounts?itemId=
 * - GET /v2/transactions?accountId=&dateFrom= (cursor: resposta.next, null na última página)
 * - POST/GET /webhooks
 */
const BASE = 'https://api.pluggy.ai';

function createPluggy({ clientId, clientSecret, baseUrl = BASE }) {
  let apiKey = null, apiKeyAt = 0;

  async function auth(force) {
    if (!force && apiKey && Date.now() - apiKeyAt < 100 * 60 * 1000) return apiKey; // renova antes das 2h
    const r = await fetch(`${baseUrl}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, clientSecret }) });
    if (!r.ok) throw new Error(`Pluggy /auth falhou (${r.status})`);
    apiKey = (await r.json()).apiKey;
    apiKeyAt = Date.now();
    return apiKey;
  }

  async function req(method, path, body, retried) {
    const key = await auth();
    const r = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'X-API-KEY': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (r.status === 401 && !retried) { await auth(true); return req(method, path, body, true); }
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) {
      const err = new Error(`Pluggy ${method} ${path.split('?')[0]} -> ${r.status}: ${(data && data.message) || text.slice(0, 200)}`);
      err.status = r.status;
      throw err;
    }
    return data;
  }

  return {
    connectToken: (clientUserId, webhookUrl) => req('POST', '/connect_token', { options: { clientUserId, avoidDuplicates: true, ...(webhookUrl ? { webhookUrl } : {}) } }).then((d) => d.accessToken),
    item: (id) => req('GET', `/items/${encodeURIComponent(id)}`),
    deleteItem: (id) => req('DELETE', `/items/${encodeURIComponent(id)}`),
    accounts: async (itemId) => (await req('GET', `/accounts?itemId=${encodeURIComponent(itemId)}`)).results || [],
    async transactions(accountId, dateFrom) {
      const out = [];
      let path = `/v2/transactions?accountId=${encodeURIComponent(accountId)}&dateFrom=${dateFrom}`;
      for (let guard = 0; path && guard < 200; guard++) {
        const page = await req('GET', path);
        out.push(...(page.results || []));
        path = page.next ? `/v2/transactions${page.next}` : null;
      }
      return out;
    },
    /** Garante um webhook "all" apontando para a nossa URL, com cabeçalho secreto (Pluggy não assina webhooks). */
    async ensureWebhook(url, secret) {
      const list = (await req('GET', '/webhooks')) || {};
      const found = (list.results || []).find((w) => w.url === url && !w.disabledAt);
      if (found) return found;
      return req('POST', '/webhooks', { url, event: 'all', headers: { 'X-Finaxis-Secret': secret } });
    },
  };
}

module.exports = { createPluggy };
