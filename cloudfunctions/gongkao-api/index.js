try {
  exports.main = require('./runtime/services/api/src/cloud-function').main;
} catch (error) {
  throw new Error("cloud runtime not prepared, run `npm run cloud:sync` first: " + error.message);
}
