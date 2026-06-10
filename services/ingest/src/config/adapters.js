const { RsksGwyAdapter } = require("../adapters/rsks-gwy");
const { GgfwHrssGwyAdapter } = require("../adapters/ggfw-hrss-gwy");
const { DemoNationalAdapter } = require("../adapters/demo-national");

function createAdapterMap(sources) {
  const sourceById = Object.fromEntries(sources.map((source) => [source.id, source]));

  return {
    "rsks-gd": new RsksGwyAdapter(sourceById["rsks-gd"]),
    "ggfw-hrss-gd": new GgfwHrssGwyAdapter(sourceById["ggfw-hrss-gd"]),
    "national-bm": new DemoNationalAdapter(sourceById["national-bm"])
  };
}

module.exports = {
  createAdapterMap
};
