/**
 * Express 4 does not notice when an `async` route handler throws: the request just
 * hangs until it times out and Node reports an unhandled rejection. This makes every
 * route and middleware behave as if it were wrapped in try/catch: a rejected promise
 * is passed to next(), so the global error handler answers with a safe 500.
 *
 * Loaded once, at the top of server.js, before any router is created.
 */
const Layer = require("express/lib/router/layer");

Layer.prototype.handle_request = function handleRequest(req, res, next) {
  const handler = this.handle;
  // Error-handling middleware (four arguments) is not a request handler
  if (handler.length > 3) return next();
  try {
    const result = handler(req, res, next);
    if (result && typeof result.catch === "function") result.catch(next);
  } catch (err) {
    next(err);
  }
};
