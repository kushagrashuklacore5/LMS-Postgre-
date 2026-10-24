/**
 * Lists every route registered on the Express app, including nested routers
 * and routes generated in loops, by walking the app's own router stack.
 * Used by the security tests so no endpoint can be added without being covered.
 */

// Express stores each mount path only as a regular expression; turn it back into text.
function mountPath(layer) {
  if (layer.path) return layer.path;
  const source = layer.regexp && layer.regexp.source;
  if (!source || source === "^\\/?$" || source === "^\\/?(?=\\/|$)") return "";
  return source
    .replace("^\\/", "/")
    .replace("\\/?(?=\\/|$)", "")
    .replace("(?=\\/|$)", "")
    .replace(/\\\//g, "/")
    .replace(/\$$/, "");
}

function collect(stack, prefix, routes) {
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const routePath of paths) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({ method: method.toUpperCase(), path: `${prefix}${routePath}`.replace(/\/+$/, "") || "/" });
        }
      }
    } else if (layer.name === "router" && layer.handle && layer.handle.stack) {
      collect(layer.handle.stack, prefix + mountPath(layer), routes);
    }
  }
  return routes;
}

function listRoutes(app) {
  return collect(app._router.stack, "", []);
}

module.exports = { listRoutes };
