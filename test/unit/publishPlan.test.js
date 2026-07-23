const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createPublishPlan, inputHashFor } = require("../../src/utils/publishPlan");

describe("publishPlan", () => {
  const items = [{ file: "approved/one.json", data: { title: "One", originalId: "1" } }];
  const result = { created: [{ title: "One", action: "would_create" }], updated: [], merged: [], skipped: [], rejected: [], errors: [] };

  it("is stable across outcome ordering and object key ordering", () => {
    const first = createPublishPlan({ manifestPath: "run/publish-manifest.json", items, result });
    const second = createPublishPlan({
      manifestPath: "run\\publish-manifest.json",
      items: [{ data: { originalId: "1", title: "One" }, file: "approved/one.json" }],
      result: { errors: [], rejected: [], skipped: [], merged: [], updated: [], created: [{ action: "would_create", title: "One" }] }
    });
    assert.equal(first.planHash, second.planHash);
    assert.equal(first.inputHash, second.inputHash);
  });

  it("changes when an input fact changes", () => {
    assert.notEqual(inputHashFor(items), inputHashFor([{ ...items[0], data: { ...items[0].data, title: "Two" } }]));
  });
});
