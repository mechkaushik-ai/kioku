/*
 * Spaced-repetition scheduler (SM-2 family, Anki-style learning steps).
 *
 * Card state fields:
 *   state   'new' | 'learn' | 'review' | 'relearn'
 *   step    index into the current step list (learning / relearning)
 *   due     timestamp (ms) when the card is next shown
 *   ivl     current interval in days (review cards)
 *   ease    ease factor (2.5 = 250%)
 *   reps    total successful reviews
 *   lapses  times forgotten after graduating
 *
 * Grades: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SRS = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MIN = 60 * 1000;
  var DAY = 24 * 60 * MIN;

  var DEFAULTS = {
    learnSteps: [1, 10],      // minutes
    relearnSteps: [10],       // minutes
    graduatingIvl: 1,         // days
    easyIvl: 4,               // days
    startEase: 2.5,
    minEase: 1.3,
    easyBonus: 1.3,
    hardFactor: 1.2,
    lapseIvlFactor: 0,        // interval after a lapse = ivl * factor (minimum 1 day)
    maxIvl: 36500,
    fuzz: true
  };

  function cfgOf(c) {
    var out = {};
    for (var k in DEFAULTS) out[k] = (c && c[k] !== undefined) ? c[k] : DEFAULTS[k];
    return out;
  }

  function newState() {
    return { state: "new", step: 0, due: 0, ivl: 0, ease: 0, reps: 0, lapses: 0 };
  }

  function copy(s) {
    var o = {};
    for (var k in s) o[k] = s[k];
    return o;
  }

  // Deterministic small fuzz so cards learnt together spread out over days.
  function fuzzDays(ivl, seed) {
    if (ivl < 3) return ivl;
    var range = ivl < 7 ? 1 : ivl < 30 ? Math.max(2, Math.round(ivl * 0.15)) : Math.max(4, Math.round(ivl * 0.05));
    var r = Math.abs(Math.sin(seed || 1) * 10000) % 1;
    return Math.max(1, Math.round(ivl - range + r * 2 * range));
  }

  // The study day rolls over at 4 am local time, like Anki.
  function startOfDay(t) {
    var d = new Date(t);
    d.setHours(4, 0, 0, 0);
    if (d.getTime() > t) d.setDate(d.getDate() - 1);
    return d.getTime();
  }

  function reviewDue(now, days) {
    var d = new Date(startOfDay(now));
    d.setDate(d.getDate() + days);
    return d.getTime();
  }

  function clampIvl(ivl, cfg) {
    return Math.min(cfg.maxIvl, Math.max(1, Math.round(ivl)));
  }

  function graduate(s, ivl, now, cfg, seed) {
    s.state = "review";
    s.step = 0;
    s.ivl = clampIvl(cfg.fuzz ? fuzzDays(ivl, seed) : ivl, cfg);
    s.due = reviewDue(now, s.ivl);
    return s;
  }

  /** Returns a NEW state object after answering with `grade` (1-4). */
  function answer(prev, grade, now, config, seed) {
    var cfg = cfgOf(config);
    var s = copy(prev || newState());
    now = now || Date.now();
    s.last = now;
    if (!s.ease) s.ease = cfg.startEase;

    if (s.state === "new") { s.state = "learn"; s.step = 0; }

    if (s.state === "learn" || s.state === "relearn") {
      var steps = s.state === "learn" ? cfg.learnSteps : cfg.relearnSteps;
      if (grade === 1) {
        s.step = 0;
        s.due = now + steps[0] * MIN;
      } else if (grade === 2) {
        var cur = steps[Math.min(s.step, steps.length - 1)];
        var nxt = steps[s.step + 1];
        var delay = s.step === 0 && nxt ? (cur + nxt) / 2 : cur;
        s.due = now + delay * MIN;
      } else if (grade === 3) {
        if (s.step + 1 < steps.length) {
          s.step += 1;
          s.due = now + steps[s.step] * MIN;
        } else {
          s.reps += 1;
          graduate(s, s.state === "learn" ? cfg.graduatingIvl : s.ivl, now, cfg, seed);
        }
      } else {
        s.reps += 1;
        graduate(s, s.state === "learn" ? cfg.easyIvl : Math.max(s.ivl + 1, cfg.graduatingIvl), now, cfg, seed);
      }
      return s;
    }

    // Review card.
    var daysLate = Math.max(0, Math.round((startOfDay(now) - startOfDay(s.due)) / DAY));
    if (grade === 1) {
      s.lapses += 1;
      s.ease = Math.max(cfg.minEase, s.ease - 0.2);
      s.ivl = Math.max(1, Math.round(s.ivl * cfg.lapseIvlFactor));
      if (cfg.relearnSteps.length) {
        s.state = "relearn";
        s.step = 0;
        s.due = now + cfg.relearnSteps[0] * MIN;
      } else {
        s.due = reviewDue(now, s.ivl);
      }
      return s;
    }
    var newIvl;
    if (grade === 2) {
      s.ease = Math.max(cfg.minEase, s.ease - 0.15);
      newIvl = Math.max(s.ivl + 1, s.ivl * cfg.hardFactor);
    } else if (grade === 3) {
      newIvl = Math.max(s.ivl + 1, (s.ivl + daysLate / 2) * s.ease);
    } else {
      s.ease = s.ease + 0.15;
      newIvl = Math.max(s.ivl + 2, (s.ivl + daysLate) * s.ease * cfg.easyBonus);
    }
    s.reps += 1;
    s.ivl = clampIvl(cfg.fuzz && grade > 2 ? Math.max(s.ivl + 1, fuzzDays(newIvl, seed)) : newIvl, cfg);
    s.due = reviewDue(now, s.ivl);
    return s;
  }

  function humanDelay(ms) {
    var m = Math.round(ms / MIN);
    if (m < 60) return Math.max(1, m) + "m";
    var h = Math.round(m / 60);
    if (h < 24) return h + "h";
    var d = Math.round(ms / DAY);
    if (d < 31) return d + "d";
    if (d < 365) return (Math.round(d / 30 * 10) / 10) + "mo";
    return (Math.round(d / 365 * 10) / 10) + "y";
  }

  /** Labels for the four answer buttons, e.g. ["1m", "6m", "10m", "4d"]. */
  function preview(prev, now, config) {
    now = now || Date.now();
    var out = [];
    for (var g = 1; g <= 4; g++) {
      var s = answer(prev, g, now, config, 0);
      out.push(humanDelay(s.due - now));
    }
    return out;
  }

  /**
   * Builds today's queue.
   *   ids      ordered card ids from the decks being studied
   *   states   map id -> state (missing means new)
   *   newLeft  how many new cards may still be introduced today
   * Returns { learn: [], review: [], fresh: [] } as id lists.
   */
  function buildQueue(ids, states, now, newLeft) {
    var learn = [], review = [], fresh = [];
    for (var i = 0; i < ids.length; i++) {
      var s = states[ids[i]];
      if (!s || s.state === "new") {
        if (fresh.length < newLeft) fresh.push(ids[i]);
      } else if (s.state === "review") {
        if (s.due <= now) review.push(ids[i]);
      } else if (s.due <= now + 20 * MIN) {
        learn.push(ids[i]);
      }
    }
    var byDue = function (a, b) { return states[a].due - states[b].due; };
    learn.sort(byDue);
    review.sort(byDue);
    return { learn: learn, review: review, fresh: fresh };
  }

  /** Next card: due learning cards first, then reviews with a new card every third turn. */
  function nextCard(q, states, now, counter) {
    for (var i = 0; i < q.learn.length; i++) {
      if (states[q.learn[i]].due <= now) return { id: q.learn[i], kind: "learn" };
    }
    if (q.fresh.length && (!q.review.length || counter % 3 === 2)) return { id: q.fresh[0], kind: "new" };
    if (q.review.length) return { id: q.review[0], kind: "review" };
    if (q.learn.length) return { id: q.learn[0], kind: "learn", early: true };
    return null;
  }

  return {
    DEFAULTS: DEFAULTS, MIN: MIN, DAY: DAY,
    newState: newState, answer: answer, preview: preview, humanDelay: humanDelay,
    buildQueue: buildQueue, nextCard: nextCard, startOfDay: startOfDay
  };
});
