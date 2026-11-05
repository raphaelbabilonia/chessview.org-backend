const assert = require("node:assert/strict");
const test = require("node:test");
const { mergedEventChanges, mergeProblems, parseArgs } = require("../../src/scripts/mergeDuplicateEvents");
const plan = require("../../src/scripts/data/duplicate-event-merges-2026-11-05.json");
const secondPlan = require("../../src/scripts/data/duplicate-event-merges-2026-11-05b.json");

const keep = () => ({
  _id: "a",
  isPublic: true,
  startDate: new Date("2027-01-16T00:00:00Z"),
  timeControl: "",
  venueName: "Main Hall",
  source: { name: "FIDE Calendar", originalId: "fide-calendar-1", url: "https://calendar.fide.com/calendar.php?id=1" }
});
const remove = () => ({
  _id: "b",
  isPublic: true,
  startDate: new Date("2027-01-16T00:00:00Z"),
  timeControl: "blitz",
  venueName: "Other Hall",
  resultsUrl: "https://ratings.fide.com/tournament_information.phtml?event=2",
  source: { name: "FIDE Rated Tournaments", originalId: "fide-rated-2", url: "https://ratings.fide.com/tournament_information.phtml?event=2" }
});

test("the kept record takes on the removed source, so ingest cannot recreate the duplicate", () => {
  const changes = mergedEventChanges(keep(), remove());
  assert.equal(changes.sourceKeys.length, 2);
  assert.ok(changes.sourceKeys.some((key) => key.includes("fide-rated-2")));
  assert.deepEqual(changes.sourceRefs.map((ref) => ref.originalId), ["fide-calendar-1", "fide-rated-2"]);
});

test("existing source history is kept and not repeated", () => {
  const first = keep();
  first.sourceKeys = ["source:fide calendar:id:fide-calendar-1", "source:other:id:9"];
  first.sourceRefs = [{ sourceKey: "source:other:id:9", name: "Other", originalId: "9", contentHash: "sha256:x" }];
  const second = remove();
  second.sourceRefs = [{ sourceKey: "source:other:id:9", name: "Other", originalId: "9" }];
  second.sourceKeys = ["source:other:id:9"];
  const changes = mergedEventChanges(first, second);
  assert.equal(changes.sourceRefs.length, 1);
  assert.equal(changes.sourceRefs[0].contentHash, "sha256:x");
  assert.ok(changes.sourceKeys.includes("source:fide calendar:id:fide-calendar-1"));
});

test("only blank fields are filled from the removed record", () => {
  const changes = mergedEventChanges(keep(), remove());
  assert.equal(changes.timeControl, "blitz");
  assert.equal(changes.resultsUrl, remove().resultsUrl);
  assert.equal("venueName" in changes, false);
});

test("a valid pair passes", () => {
  assert.deepEqual(mergeProblems(keep(), remove(), { Registration: 0, Section: 0 }), []);
});

test("unsafe pairs are refused", () => {
  assert.match(mergeProblems(keep(), null).join(), /remove does not exist/);
  assert.match(mergeProblems(null, remove()).join(), /keep does not exist/);
  assert.match(mergeProblems(keep(), keep()).join(), /same record/);
  assert.match(mergeProblems({ ...keep(), isPublic: false }, remove()).join(), /not public/);
  assert.match(mergeProblems(keep(), { ...remove(), startDate: new Date("2027-01-17T00:00:00Z") }).join(), /start dates differ/);
  assert.match(mergeProblems(keep(), remove(), { Registration: 2 }).join(), /2 Registration/);
});

test("the tool needs a plan and defaults to a dry run", () => {
  assert.throws(() => parseArgs([]), /--plan/);
  assert.throws(() => parseArgs(["--plan=x.json", "--force"]), /Unknown argument/);
  assert.equal(parseArgs(["--plan=x.json"]).apply, false);
  assert.equal(parseArgs(["--plan=x.json", "--apply"]).apply, true);
});

test("the reviewed plan has nine pairs and no slug appears twice", () => {
  const slugs = plan.merges.flatMap(({ keep: kept, remove: removed }) => [kept, removed]);
  assert.equal(plan.merges.length, 9);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("in the second plan no record is both kept and removed, or removed twice", () => {
  const removed = secondPlan.merges.map((merge) => merge.remove);
  const kept = new Set(secondPlan.merges.map((merge) => merge.keep));
  assert.equal(new Set(removed).size, removed.length);
  assert.equal(removed.some((slug) => kept.has(slug)), false);
  assert.equal(removed.includes("3rd-cheadle-fide-blitz"), false);
});
