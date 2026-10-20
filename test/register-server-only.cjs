// CLI Eval only: Next's bundler-only marker has no runtime behavior on Node.
// Mirrors test/server-only.ts; never imported by the application or deployed routes.
const Module = require('node:module');
const load = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'server-only') return {};
  return load.call(this, request, parent, isMain);
};
