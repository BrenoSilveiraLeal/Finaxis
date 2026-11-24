'use strict';
const handle = require('../server/index');

module.exports = (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = url.searchParams.get('__path') || url.pathname.replace(/^\/api\/?/, '');
  url.searchParams.delete('__path');
  req.url = `/api/${route}${url.search ? url.search : ''}`;
  return handle(req, res);
};
