'use strict';
/** Server-Sent Events: avisa as abas abertas do usuário quando os dados mudam no servidor. */
function createEvents() {
  const clients = new Map(); // userId -> Set<{ res, clientId }>
  const listeners = [];

  function subscribe(req, res, userId, clientId) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    const c = { res, clientId };
    if (!clients.has(userId)) clients.set(userId, new Set());
    clients.get(userId).add(c);
    const hb = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(hb);
      const set = clients.get(userId);
      if (set) { set.delete(c); if (!set.size) clients.delete(userId); }
    });
    listeners.forEach((fn) => fn(userId));
  }

  /** Envia um evento a todas as abas do usuário (exceto a que originou a mudança). */
  function emit(userId, payload, exceptClientId) {
    const set = clients.get(userId);
    if (!set) return;
    const msg = `event: change\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const c of set) if (!exceptClientId || c.clientId !== exceptClientId) c.res.write(msg);
  }

  return { subscribe, emit, onlineUsers: () => [...clients.keys()], onSubscribe: (fn) => listeners.push(fn) };
}

module.exports = { createEvents };
