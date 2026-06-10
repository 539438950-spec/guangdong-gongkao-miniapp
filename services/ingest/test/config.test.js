const test = require("node:test");
const assert = require("node:assert/strict");

const { getSources } = require("../src/config/sources");
const { createAdapterMap } = require("../src/config/adapters");

test("source registry and adapter map should stay aligned", () => {
  const sources = getSources();
  const adapters = createAdapterMap(sources);

  assert.ok(sources.length >= 2);
  for (const source of sources) {
    assert.ok(adapters[source.id], `missing adapter for ${source.id}`);
  }
});
