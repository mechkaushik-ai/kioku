// Run with: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const SRS = require("../app/src/main/assets/www/js/srs.js");

const T0 = new Date(2026, 0, 10, 9, 0, 0).getTime(); // 9 am local
const MIN = SRS.MIN, DAY = SRS.DAY;
const noFuzz = { fuzz: false };

test("new card: Again shows it again in 1 minute", () => {
  const s = SRS.answer(null, 1, T0, noFuzz);
  assert.strictEqual(s.state, "learn");
  assert.strictEqual(s.due - T0, 1 * MIN);
});

test("new card: Good walks the learning steps then graduates to 1 day", () => {
  let s = SRS.answer(null, 3, T0, noFuzz);
  assert.strictEqual(s.state, "learn");
  assert.strictEqual(s.due - T0, 10 * MIN);
  s = SRS.answer(s, 3, s.due, noFuzz);
  assert.strictEqual(s.state, "review");
  assert.strictEqual(s.ivl, 1);
  assert.ok(s.due > T0 && s.due - T0 < 2 * DAY);
});

test("new card: Easy graduates straight to 4 days", () => {
  const s = SRS.answer(null, 4, T0, noFuzz);
  assert.strictEqual(s.state, "review");
  assert.strictEqual(s.ivl, 4);
});

test("Hard on first step waits between the two steps", () => {
  const s = SRS.answer(null, 2, T0, noFuzz);
  assert.strictEqual(s.due - T0, 5.5 * MIN);
});

test("review Good multiplies the interval by ease", () => {
  const card = { state: "review", step: 0, ivl: 10, ease: 2.5, reps: 3, lapses: 0, due: T0 };
  const s = SRS.answer(card, 3, T0, noFuzz);
  assert.strictEqual(s.ivl, 25);
  assert.strictEqual(s.ease, 2.5);
});

test("review Hard grows slowly and lowers ease; Easy grows fast and raises ease", () => {
  const card = { state: "review", step: 0, ivl: 10, ease: 2.5, reps: 3, lapses: 0, due: T0 };
  const h = SRS.answer(card, 2, T0, noFuzz);
  assert.strictEqual(h.ivl, 12);
  assert.ok(Math.abs(h.ease - 2.35) < 1e-9);
  const e = SRS.answer(card, 4, T0, noFuzz);
  assert.ok(e.ivl > 25);
  assert.ok(Math.abs(e.ease - 2.65) < 1e-9);
});

test("lapse sends the card to relearning and counts it", () => {
  const card = { state: "review", step: 0, ivl: 30, ease: 2.5, reps: 5, lapses: 0, due: T0 };
  const s = SRS.answer(card, 1, T0, noFuzz);
  assert.strictEqual(s.state, "relearn");
  assert.strictEqual(s.lapses, 1);
  assert.strictEqual(s.due - T0, 10 * MIN);
  assert.ok(Math.abs(s.ease - 2.3) < 1e-9);
  const back = SRS.answer(s, 3, s.due, noFuzz);
  assert.strictEqual(back.state, "review");
  assert.strictEqual(back.ivl, 1);
});

test("ease never drops below 1.3", () => {
  let card = { state: "review", step: 0, ivl: 5, ease: 1.35, reps: 3, lapses: 0, due: T0 };
  card = SRS.answer(card, 1, T0, noFuzz);
  assert.strictEqual(card.ease, 1.3);
});

test("answer does not mutate the previous state", () => {
  const card = { state: "review", step: 0, ivl: 10, ease: 2.5, reps: 3, lapses: 0, due: T0 };
  SRS.answer(card, 3, T0, noFuzz);
  assert.strictEqual(card.ivl, 10);
});

test("fuzz keeps intervals close to the target and always growing", () => {
  const card = { state: "review", step: 0, ivl: 20, ease: 2.5, reps: 3, lapses: 0, due: T0 };
  for (let seed = 1; seed < 50; seed++) {
    const s = SRS.answer(card, 3, T0, {}, seed);
    assert.ok(s.ivl >= 46 && s.ivl <= 54, "ivl " + s.ivl);
  }
});

test("preview gives four increasing labels for a new card", () => {
  assert.deepStrictEqual(SRS.preview(null, T0, noFuzz), ["1m", "6m", "10m", "4d"]);
});

test("queue: due learning first, reviews, and new cards limited", () => {
  const states = {
    a: { state: "review", due: T0 - DAY, ivl: 3, ease: 2.5 },
    b: { state: "learn", due: T0 - MIN, step: 0 },
    c: { state: "review", due: T0 + 5 * DAY, ivl: 9, ease: 2.5 },
  };
  const q = SRS.buildQueue(["a", "b", "c", "d", "e", "f"], states, T0, 2);
  assert.deepStrictEqual(q.review, ["a"]);
  assert.deepStrictEqual(q.learn, ["b"]);
  assert.deepStrictEqual(q.fresh, ["d", "e"]);
  assert.deepStrictEqual(SRS.nextCard(q, states, T0, 0), { id: "b", kind: "learn" });
});
