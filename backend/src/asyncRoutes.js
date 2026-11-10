'use strict';

const express = require('express');

/**
 * express.Router() whose route handlers may be async.
 *
 * Express 4 does not catch promise rejections from handlers, and Node exits on
 * an unhandled rejection — so a single malformed request that makes an async
 * handler throw would take the whole server down. This forwards rejections to
 * next(err) so the error middleware answers with a 500 instead.
 */
function asyncRouter() {
  const router = express.Router();
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) => original(path, ...handlers.map(wrap));
  }
  return router;
}

function wrap(handler) {
  if (typeof handler !== 'function' || handler.length > 3) return handler;
  return function wrapped(req, res, next) {
    try {
      const out = handler(req, res, next);
      if (out && typeof out.catch === 'function') out.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { asyncRouter };
