// Shared browser runtime: npm ci in tools/atlas-tests, or NODE_PATH.
let runtime;
try { runtime = require('playwright'); }
catch { runtime = require('./atlas-tests/node_modules/playwright'); }
const chromium = {launch(options = {}) {
  return runtime.chromium.launch({...options, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
}};
module.exports = {...runtime, chromium};
