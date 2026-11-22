/* Kioku — Kana & Kanji SRS. Single-page app, no dependencies.
 * Storage: localStorage["kioku.v1"] (see defaultStore()).
 * Android bridge (optional): window.KiokuNative.speak(text), .saveFile(name, text)
 */
(function () {
  "use strict";

  // ------------------------------------------------------------------ utils
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.add("hidden"); }, 2200);
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 100000 + 1;
  }
  function dayKey(t) {
    var d = new Date(SRS.startOfDay(t || Date.now()));
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function graphemes(s) {
    if (window.Intl && Intl.Segmenter) return Array.from(new Intl.Segmenter().segment(s || "")).length;
    return Array.from(s || "").length;
  }
  function splitList(s) {
    return String(s || "").split(/[,、，;]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  // ------------------------------------------------------------------ kana helpers
  var ROMA = {};
  (window.KANA_DATA || []).forEach(function (c) { if (c.deck === "hiragana") ROMA[c.ch] = c.romaji; });
  Object.assign(ROMA, { "ゃ": "ya", "ゅ": "yu", "ょ": "yo", "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o", "ゎ": "wa" });
  function toHira(s) {
    return String(s || "").replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  }
  function toKata(s) {
    return String(s || "").replace(/[ぁ-ゖ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
  }
  function romaji(kana) {
    var s = toHira(kana), out = "", sokuon = false;
    for (var i = 0; i < s.length;) {
      var two = s.substr(i, 2), r;
      if (s[i] === "っ") { sokuon = true; i++; continue; }
      if (s[i] === "ー") { out += out.slice(-1); i++; continue; }
      if (ROMA[two]) { r = ROMA[two]; i += 2; }
      else if (ROMA[s[i]]) { r = ROMA[s[i]]; i++; }
      else { r = s[i] === "." || s[i] === "-" ? "" : s[i]; i++; }
      if (sokuon && r) { r = (r.indexOf("ch") === 0 ? "t" : r[0]) + r; sokuon = false; }
      out += r;
    }
    return out;
  }
  function kunParts(k) {
    var prefix = /-$/.test(k), suffix = /^-/.test(k);
    var core = k.replace(/^-|-$/g, "");
    var p = core.split(".");
    return { stem: p[0], oku: p[1] || "", prefix: prefix, suffix: suffix, kana: p[0] + (p[1] || "") };
  }
  function kunHTML(ch, k) {
    var p = kunParts(k);
    return (p.suffix ? "〜" : "") + "<ruby>" + esc(ch) + "<rt>" + esc(p.stem) + "</rt></ruby>" + esc(p.oku) + (p.prefix ? "〜" : "");
  }

  // ------------------------------------------------------------------ speech
  function speak(text) {
    if (!text) return;
    try {
      if (window.KiokuNative && window.KiokuNative.speak) { window.KiokuNative.speak(text); return; }
      if (window.speechSynthesis) {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = "ja-JP";
        u.rate = 0.85;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
        return;
      }
    } catch (e) { /* fall through */ }
    toast("Speech is not available on this device");
  }
  function speakCard(c) {
    if (!c) return;
    if (c.type === "kanji") {
      var parts = [];
      if (c.on && c.on[0]) parts.push(toHira(c.on[0]));
      if (c.kun && c.kun[0]) parts.push(kunParts(c.kun[0]).kana);
      speak(parts.join("、") || c.ch);
    } else if (c.type === "word") {
      speak(c.reading || c.ch);
    } else {
      speak(c.ch);
    }
  }

  // ------------------------------------------------------------------ library
  var DECKS = [
    { id: "hiragana", name: "Hiragana", jp: "ひらがな", glyph: "あ" },
    { id: "katakana", name: "Katakana", jp: "カタカナ", glyph: "カ" },
    { id: "n5", name: "Kanji N5", jp: "漢字", glyph: "日" },
    { id: "n4", name: "Kanji N4", jp: "漢字", glyph: "会" },
    { id: "n3", name: "Kanji N3", jp: "漢字", glyph: "論" },
    { id: "n2", name: "Kanji N2", jp: "漢字", glyph: "憲" },
    { id: "n1", name: "Kanji N1", jp: "漢字", glyph: "鬱" }
  ];
  var LIB = {}, DECK_IDS = {};
  (window.KANA_DATA || []).forEach(function (c) {
    c.type = "kana";
    LIB[c.id] = c;
    (DECK_IDS[c.deck] = DECK_IDS[c.deck] || []).push(c.id);
  });
  (window.KANJI_DATA || []).forEach(function (c) {
    c.type = "kanji";
    LIB[c.id] = c;
    (DECK_IDS[c.deck] = DECK_IDS[c.deck] || []).push(c.id);
  });
  var BY_CHAR = {};
  Object.keys(LIB).forEach(function (id) { if (!BY_CHAR[LIB[id].ch]) BY_CHAR[LIB[id].ch] = id; });

  // ------------------------------------------------------------------ store
  var KEY = "kioku.v1";
  function defaultStore() {
    return {
      v: 1,
      states: {},            // cardId or cardId|r (recall direction) -> SRS state
      overrides: {},         // libraryId -> { mnem, pic, img }
      custom: { cards: {}, decks: [] },
      settings: {
        newPerDay: 10, dir: "recog", autoplay: false, theme: "auto", romajiHint: false,
        learnSteps: [1, 10], active: { hiragana: true }
      },
      log: {}                // "YYYY-MM-DD" -> { n: new cards introduced, r: reviews }
    };
  }
  var S;
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      S = raw ? JSON.parse(raw) : defaultStore();
    } catch (e) { S = defaultStore(); }
    var d = defaultStore();
    for (var k in d) if (S[k] === undefined) S[k] = d[k];
    for (var s in d.settings) if (S.settings[s] === undefined) S.settings[s] = d.settings[s];
    if (!S.custom.cards) S.custom.cards = {};
    if (!S.custom.decks) S.custom.decks = [];
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast("Storage is full. Remove some photos from your cards."); }
  }

  function getCard(id) {
    var base = LIB[id] || S.custom.cards[id];
    if (!base) return null;
    var o = S.overrides[id];
    if (!o) return base;
    var c = Object.assign({}, base);
    if (o.mnem) c.mnem = o.mnem;
    if (o.pic) c.pic = o.pic;
    if (o.img !== undefined) c.img = o.img;
    return c;
  }
  function allDecks() {
    return DECKS.map(function (d) { return Object.assign({ builtin: true }, d); })
      .concat(S.custom.decks.map(function (d) { return Object.assign({ glyph: "✎", jp: "" }, d); }));
  }
  function deckCardIds(deckId) {
    if (DECK_IDS[deckId]) return DECK_IDS[deckId];
    var d = S.custom.decks.find(function (x) { return x.id === deckId; });
    return d ? d.ids.filter(function (id) { return LIB[id] || S.custom.cards[id]; }) : [];
  }
  function dirs() {
    return S.settings.dir === "both" ? ["", "|r"] : S.settings.dir === "recall" ? ["|r"] : [""];
  }
  function studyIds() {
    var seen = {}, out = [];
    allDecks().forEach(function (d) {
      if (!S.settings.active[d.id]) return;
      deckCardIds(d.id).forEach(function (id) {
        dirs().forEach(function (suffix) {
          var k = id + suffix;
          if (!seen[k]) { seen[k] = 1; out.push(k); }
        });
      });
    });
    return out;
  }
  function todayLog() {
    var k = dayKey();
    return S.log[k] || (S.log[k] = { n: 0, r: 0 });
  }
  function srsCfg() { return { learnSteps: S.settings.learnSteps }; }
  function statusOf(id) {
    var s = S.states[id] || S.states[id + "|r"];
    if (!s || s.state === "new") return "new";
    if (s.state === "review") return s.ivl >= 21 ? "mature" : "review";
    return "learn";
  }
  function streak() {
    var n = 0, t = Date.now();
    var e0 = S.log[dayKey(t)];
    if (!e0 || !(e0.n + e0.r)) t -= SRS.DAY;
    for (;;) {
      var e = S.log[dayKey(t)];
      if (e && e.n + e.r > 0) { n++; t -= SRS.DAY; } else break;
    }
    return n;
  }

  // ------------------------------------------------------------------ theme
  function applyTheme() {
    var t = S.settings.theme;
    if (t === "auto") t = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", t === "dark" ? "#171513" : "#f6f1e7");
    if (window.KiokuNative && window.KiokuNative.setDark) window.KiokuNative.setDark(t === "dark");
  }

  // ------------------------------------------------------------------ card rendering
  function picHTML(c) {
    var inner;
    if (c.img) inner = '<img alt="" src="' + esc(c.img) + '">';
    else {
      var multi = graphemes(c.pic || "") > 1;
      inner = '<span class="emo' + (multi ? " multi" : "") + '">' + esc(c.pic || "📜") + "</span>";
    }
    var sats = "";
    if (c.comps && !c.img) {
      c.comps.filter(function (x) { return x[2] && x[2] !== c.pic; }).slice(0, 3).forEach(function (x, i) {
        sats += '<span class="sat s' + i + '" title="' + esc(x[0] + " " + x[1]) + '">' + esc(x[2]) + "</span>";
      });
    }
    var ghost = '<span class="ghost-char' + (graphemes(c.ch) > 1 ? " long" : "") + '" lang="ja">' + esc(c.ch) + "</span>";
    return '<div class="pic">' + inner + sats + ghost + "</div>";
  }

  function headerChar(c) {
    var longCls = graphemes(c.ch) > 2 ? " long" : "";
    if (c.type === "kanji") {
      var reading = c.kun && c.kun[0] ? kunParts(c.kun[0]).stem : (c.on && c.on[0] ? toHira(c.on[0]) : "");
      if (reading && graphemes(c.ch) === 1) return '<ruby lang="ja">' + esc(c.ch) + "<rt>" + esc(reading) + "</rt></ruby>";
    }
    if (c.type === "word" && c.reading) return '<ruby lang="ja">' + esc(c.ch) + "<rt>" + esc(c.reading) + "</rt></ruby>";
    return '<span class="plain' + longCls + '" lang="ja">' + esc(c.ch) + "</span>";
  }

  function cardBackHTML(c) {
    var h = '<div class="cb-top"><div class="cb-char">' + headerChar(c) + "</div>" + picHTML(c) + "</div>";
    if (c.type === "kana") {
      h += '<div class="romaji">' + esc(c.romaji) + "</div>";
      h += '<div class="sect"><div class="sect-t">How it sounds in English</div>' +
        '<div class="pron"><button class="say" data-say="' + esc(c.ch) + '" aria-label="Play sound">▶</button>' +
        "<div>" + esc(c.pron) + "</div></div></div>";
    } else {
      h += '<div class="kw">' + esc(c.kw || "") + "</div>";
      var others = (c.meanings || []).filter(function (m) { return m !== c.kw; });
      if (others.length) h += '<div class="means">' + esc(others.join(" · ")) + "</div>";
      if (c.type === "word" && c.reading) {
        h += '<div class="sect"><div class="sect-t">Reading</div><div class="pron"><button class="say" data-say="' +
          esc(c.reading) + '" aria-label="Play sound">▶</button><div><span class="jp" lang="ja">' + esc(c.reading) + "</span> · " +
          esc(romaji(c.reading)) + "</div></div></div>";
      }
      if (c.type === "kanji" && ((c.on && c.on.length) || (c.kun && c.kun.length))) {
        var on = (c.on || []).map(function (r) {
          return '<button class="rchip" data-say="' + esc(toHira(r)) + '"><span class="jp" lang="ja">' + esc(r) +
            "</span><small>" + esc(romaji(r)) + "</small></button>";
        }).join("");
        var kun = (c.kun || []).map(function (r) {
          var p = kunParts(r);
          return '<button class="rchip" data-say="' + esc(p.kana) + '"><span class="jp" lang="ja">' + (p.suffix ? "〜" : "") + esc(p.stem) +
            (p.oku ? '<span class="oku">' + esc(p.oku) + "</span>" : "") + (p.prefix ? "〜" : "") +
            "</span><small>" + esc(romaji(p.kana)) + "</small></button>";
        }).join("");
        h += '<div class="sect readings">' +
          '<div class="rbox"><h4><b lang="ja">音</b> ON\'YOMI</h4><div class="rlist">' + (on || '<span class="muted small">none</span>') + "</div></div>" +
          '<div class="rbox"><h4><b lang="ja">訓</b> KUN\'YOMI</h4><div class="rlist">' + (kun || '<span class="muted small">none</span>') + "</div></div></div>";
        var furi = [];
        (c.on || []).slice(0, 2).forEach(function (r) {
          furi.push('<button data-say="' + esc(toHira(r)) + '"><span class="w" lang="ja"><ruby>' + esc(c.ch) + "<rt>" +
            esc(toHira(r)) + "</rt></ruby></span><small>on</small></button>");
        });
        (c.kun || []).slice(0, 4).forEach(function (r) {
          furi.push('<button data-say="' + esc(kunParts(r).kana) + '"><span class="w" lang="ja">' + kunHTML(c.ch, r) +
            "</span><small>kun</small></button>");
        });
        h += '<div class="sect"><div class="sect-t">Furigana</div><div class="furi">' + furi.join("") + "</div></div>";
      }
      if (c.comps && c.comps.length) {
        h += '<div class="sect"><div class="sect-t">Parts</div><div class="comps">' + c.comps.map(function (x) {
          return '<span class="comp"><span class="c" lang="ja">' + esc(x[0]) + "</span>" + esc(x[1]) + (x[2] ? " " + esc(x[2]) : "") + "</span>";
        }).join("") + "</div></div>";
      }
    }
    if (c.mnem) h += '<div class="sect"><div class="sect-t">Mnemonic</div><div class="mnem"><p>' + esc(c.mnem) + "</p></div>" +
      (c.hook ? '<div class="hook">' + esc(c.hook) + "</div>" : "") + "</div>";
    var meta = [];
    if (c.type === "kanji" && /^n\d$/.test(c.deck || "")) meta.push("JLPT " + c.deck.toUpperCase());
    if (c.strokes) meta.push(c.strokes + " strokes");
    if (c.grade) meta.push(c.grade <= 6 ? "School grade " + c.grade : "Secondary school");
    if (c.freq) meta.push("Frequency #" + c.freq);
    if (c.group && c.group !== "basic") meta.push({ dakuten: "Dakuten ゛", handakuten: "Handakuten ゜", yoon: "Combination (yōon)" }[c.group]);
    if (c.id && c.id.indexOf("c-") === 0) meta.push("Your card");
    if (meta.length) h += '<div class="metaline">' + meta.map(function (m) { return '<span class="chip">' + esc(m) + "</span>"; }).join("") + "</div>";
    return h;
  }

  function frontHTML(c, reverse) {
    if (!reverse) {
      var cls = graphemes(c.ch) > 2 ? " long" : "";
      var prompt = c.type === "kana" ? "How is it read?" : c.type === "kanji" ? "Meaning and readings?" : "Reading and meaning?";
      var hint = S.settings.romajiHint && c.type === "kanji" && c.on && c.on[0] ? '<div class="prompt">' + esc(romaji(c.on[0])) + "</div>" : "";
      return '<div class="front"><div class="bigchar' + cls + '" lang="ja">' + esc(c.ch) + '</div><div class="prompt">' + prompt + "</div>" + hint + "</div>";
    }
    if (c.type === "kana") {
      var sub = c.deck === "katakana" ? "Write it in katakana" : c.deck === "hiragana" ? "Write it in hiragana" : "Which character?";
      return '<div class="front"><div class="recall-kw">' + esc(c.romaji) + '</div><div class="recall-sub">' + esc(sub) + "</div></div>";
    }
    var rd = c.type === "kanji" ? (c.kun && c.kun[0] ? kunParts(c.kun[0]).kana : (c.on && c.on[0]) || "") : (c.reading || "");
    return '<div class="front"><div class="recall-kw">' + esc(c.kw || c.romaji || "?") + '</div><div class="recall-sub">' +
      (rd ? '<span lang="ja">' + esc(rd) + "</span> · " : "") + (c.type === "kanji" ? "Which kanji?" : "Write it in Japanese") + "</div></div>";
  }

  function bindSay(root) {
    $$("[data-say]", root).forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); speak(b.getAttribute("data-say")); });
    });
  }

  // ------------------------------------------------------------------ navigation
  var view = $("#view");
  var current = "home";
  function go(tab) {
    current = tab;
    document.body.classList.remove("studying");
    $$("#tabbar button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === tab); });
    window.scrollTo(0, 0);
    ({ home: renderHome, browse: renderBrowse, create: renderCreate, settings: renderSettings })[tab]();
    updateStreak();
  }
  function updateStreak() {
    var n = streak();
    $("#streak").textContent = n ? "🔥 " + n + " day" + (n === 1 ? "" : "s") : "";
  }

  // ------------------------------------------------------------------ home
  function deckStats(deckId) {
    var ids = deckCardIds(deckId), now = Date.now();
    var st = { total: ids.length, seen: 0, learn: 0, review: 0, mature: 0, due: 0, fresh: 0 };
    ids.forEach(function (id) {
      dirs().forEach(function (suf) {
        var s = S.states[id + suf];
        if (!s || s.state === "new") st.fresh++;
        else if (s.due <= now) st.due++;
      });
      var stt = statusOf(id);
      if (stt !== "new") { st.seen++; st[stt]++; }
    });
    return st;
  }

  function renderHome() {
    var ids = studyIds(), now = Date.now();
    var newLeft = Math.max(0, S.settings.newPerDay - todayLog().n);
    var q = SRS.buildQueue(ids, S.states, now, newLeft);
    var dueN = q.review.length, learnN = q.learn.length, newN = q.fresh.length;
    var total = dueN + learnN + newN;
    var h = '<div class="hero">' +
      '<div class="stat new"><b>' + newN + "</b><span>New</span></div>" +
      '<div class="stat learn"><b>' + learnN + "</b><span>Learning</span></div>" +
      '<div class="stat due"><b>' + dueN + "</b><span>Reviews</span></div></div>";
    h += '<div class="study-cta"><button class="btn shu block" id="startBtn"' + (total ? "" : " disabled") + ">" +
      (total ? "Study now · " + total + " card" + (total === 1 ? "" : "s") : "All caught up for now") + "</button></div>";
    if (!allDecks().some(function (d) { return S.settings.active[d.id]; })) {
      h += '<p class="muted small" style="text-align:center">Switch on a deck below to start studying.</p>';
    }
    var days = [], max = 1;
    for (var i = 6; i >= 0; i--) {
      var t = now - i * SRS.DAY, e = S.log[dayKey(t)] || { n: 0, r: 0 }, v = e.n + e.r;
      max = Math.max(max, v);
      days.push({ v: v, label: "SMTWTFS"[new Date(SRS.startOfDay(t)).getDay()], today: i === 0 });
    }
    h += '<h2>This week</h2><div class="panel"><div class="week">' + days.map(function (d) {
      return '<div class="' + (d.today ? "today" : "") + '"><small>' + (d.v || "") + '</small><i style="height:' +
        Math.max(4, Math.round(d.v / max * 46)) + 'px"></i><small>' + d.label + "</small></div>";
    }).join("") + "</div></div>";
    h += "<h2>Decks</h2>";
    allDecks().forEach(function (d) {
      var st = deckStats(d.id), on = !!S.settings.active[d.id], t = st.total || 1;
      h += '<div class="deck' + (on ? " active" : "") + '">' +
        '<div class="glyph" lang="ja">' + esc(d.glyph) + "</div>" +
        '<div class="grow"><h3>' + esc(d.name) + ' <span class="muted small" lang="ja">' + esc(d.jp || "") + "</span></h3>" +
        '<div class="meta">' + st.seen + " / " + st.total + " started</div>" +
        '<div class="bar"><i class="m" style="width:' + (st.mature / t * 100) + '%"></i><i class="r" style="width:' +
        (st.review / t * 100) + '%"></i><i class="l" style="width:' + (st.learn / t * 100) + '%"></i></div>' +
        (on ? '<div class="counts"><span class="d">' + st.due + ' due</span><span class="n">' + st.fresh + " unseen</span></div>" : "") +
        "</div>" +
        '<label class="switch" aria-label="Study ' + esc(d.name) + '"><input type="checkbox" data-deck="' + esc(d.id) + '"' + (on ? " checked" : "") + "><span></span></label></div>";
    });
    h += '<button class="btn ghost block" id="newDeckBtn">＋ Build your own deck</button>';
    view.innerHTML = h;
    $("#startBtn").addEventListener("click", startStudy);
    $("#newDeckBtn").addEventListener("click", function () { createTab = "deck"; deckDraft = null; go("create"); });
    $$("input[data-deck]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        S.settings.active[cb.getAttribute("data-deck")] = cb.checked;
        save();
        renderHome();
      });
    });
  }

  // ------------------------------------------------------------------ study session
  var session = null;
  function startStudy() {
    session = { counter: 0, done: 0, undo: null, current: null, revealed: false };
    document.body.classList.add("studying");
    nextInSession();
  }
  function rebuildQueue() {
    var newLeft = Math.max(0, S.settings.newPerDay - todayLog().n);
    session.q = SRS.buildQueue(studyIds(), S.states, Date.now(), newLeft);
  }
  function nextInSession() {
    rebuildQueue();
    session.current = SRS.nextCard(session.q, S.states, Date.now(), session.counter);
    session.revealed = false;
    renderStudy();
  }
  function baseId(fullId) { return fullId.replace(/\|r$/, ""); }

  function studyHeader() {
    var q = session.q, kind = session.current ? session.current.kind : "";
    return '<div class="study-head"><button class="iconbtn" id="quitBtn" aria-label="Close">✕</button>' +
      '<div class="qcounts grow"><span class="n' + (kind === "new" ? " cur" : "") + '">' + q.fresh.length + "</span>" +
      '<span class="l' + (kind === "learn" ? " cur" : "") + '">' + q.learn.length + "</span>" +
      '<span class="r' + (kind === "review" ? " cur" : "") + '">' + q.review.length + "</span></div>" +
      '<button class="iconbtn" id="undoBtn" aria-label="Undo"' + (session.undo ? "" : ' disabled style="opacity:.35"') + ">↶</button>" +
      '<button class="iconbtn" id="sayBtn" aria-label="Play sound">🔊</button></div>';
  }

  function renderStudy() {
    var cur = session.current;
    if (!cur) {
      var nextDue = Infinity;
      studyIds().forEach(function (id) { var s = S.states[id]; if (s && s.state !== "new" && s.due < nextDue) nextDue = s.due; });
      view.innerHTML = '<div class="done"><div class="big">🎉</div><h1 lang="ja">お疲れ様!</h1><p>Well done: ' + session.done +
        " card" + (session.done === 1 ? "" : "s") + " this session.</p>" +
        (nextDue < Infinity ? '<p class="muted">Next card due in ' + SRS.humanDelay(Math.max(0, nextDue - Date.now())) + ".</p>" : "") +
        '<button class="btn shu" id="homeBtn">Back to decks</button></div>';
      $("#homeBtn").addEventListener("click", function () { session = null; go("home"); });
      return;
    }
    var id = cur.id, c = getCard(baseId(id)), reverse = /\|r$/.test(id);
    if (!c) { delete S.states[id]; save(); return nextInSession(); }
    var deck = allDecks().find(function (d) { return d.id === c.deck; });
    var tag = '<div class="fc-tag"><span class="k">' + esc(cur.kind) + "</span> · " + esc(deck ? deck.name : "Your card") + (reverse ? " · recall" : "") + "</div>";
    var h = studyHeader() + '<div class="fc" id="fc">' + tag;
    if (!session.revealed) {
      h += frontHTML(c, reverse) + "</div>";
      h += '<div class="answerbar"><button class="btn block" id="showBtn">Show answer</button></div>';
    } else {
      h += cardBackHTML(c) + "</div>";
      var labels = SRS.preview(S.states[id], Date.now(), srsCfg());
      h += '<div class="gradebar"><div>' + ["Again", "Hard", "Good", "Easy"].map(function (n, i) {
        return '<button class="grade g' + (i + 1) + '" data-g="' + (i + 1) + '">' + n + "<small>" + labels[i] + "</small></button>";
      }).join("") + "</div></div>";
    }
    view.innerHTML = h;
    window.scrollTo(0, 0);
    bindSay(view);
    $("#quitBtn").addEventListener("click", function () { session = null; go("home"); });
    $("#sayBtn").addEventListener("click", function () { speakCard(c); });
    $("#undoBtn").addEventListener("click", undo);
    if (!session.revealed) {
      $("#showBtn").addEventListener("click", reveal);
      $("#fc").addEventListener("click", reveal);
    } else {
      $$(".grade").forEach(function (b) { b.addEventListener("click", function () { grade(+b.getAttribute("data-g")); }); });
      if (S.settings.autoplay) speakCard(c);
    }
  }
  function reveal() { if (session && !session.revealed) { session.revealed = true; renderStudy(); } }
  function grade(g) {
    if (!session || !session.current || !session.revealed) return;
    var id = session.current.id, prev = S.states[id], log = todayLog();
    var wasNew = !prev || prev.state === "new";
    session.undo = { id: id, prev: prev ? JSON.parse(JSON.stringify(prev)) : null, wasNew: wasNew, day: dayKey(), kind: session.current.kind };
    S.states[id] = SRS.answer(prev, g, Date.now(), srsCfg(), hash(id) + (prev ? prev.reps : 0));
    if (wasNew) log.n++; else log.r++;
    save();
    session.counter++;
    session.done++;
    updateStreak();
    nextInSession();
  }
  function undo() {
    if (!session || !session.undo) return;
    var u = session.undo, log = S.log[u.day];
    if (u.prev) S.states[u.id] = u.prev; else delete S.states[u.id];
    if (log) { if (u.wasNew) log.n = Math.max(0, log.n - 1); else log.r = Math.max(0, log.r - 1); }
    save();
    session.undo = null;
    session.done = Math.max(0, session.done - 1);
    rebuildQueue();
    session.current = { id: u.id, kind: u.kind };
    session.revealed = true;
    renderStudy();
    toast("Undone");
  }
  document.addEventListener("keydown", function (e) {
    if (!session || !document.body.classList.contains("studying")) return;
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (!session.revealed && (e.key === " " || e.key === "Enter")) { e.preventDefault(); reveal(); }
    else if (session.revealed && /^[1-4]$/.test(e.key)) grade(+e.key);
  });

  // ------------------------------------------------------------------ browse
  var browseDeck = "hiragana", browseQuery = "", browseLimit = 240;
  function matches(c, q) {
    if (!q) return true;
    var ql = q.toLowerCase(), qh = toHira(q);
    if (c.ch.indexOf(q) >= 0) return true;
    if (c.romaji && c.romaji === ql) return true;
    if (c.kw && c.kw.toLowerCase().indexOf(ql) >= 0) return true;
    if (c.meanings && c.meanings.some(function (m) { return m.toLowerCase().indexOf(ql) >= 0; })) return true;
    var reads = (c.on || []).map(toHira).concat((c.kun || []).map(function (k) { return kunParts(k).kana; }));
    if (c.reading) reads.push(c.reading);
    return reads.some(function (r) { return r === qh || romaji(r) === ql; });
  }
  function searchLib(q, deckId) {
    var ids = q ? Object.keys(LIB).concat(Object.keys(S.custom.cards)) : deckCardIds(deckId);
    return ids.filter(function (id) { var c = getCard(id); return c && matches(c, q); });
  }
  function tileHTML(id, selected) {
    var c = getCard(id);
    var label = c.type === "kana" ? c.romaji : (c.kw || c.reading || "");
    return '<button class="tile ' + statusOf(id) + (selected ? " sel" : "") + '" data-id="' + esc(id) + '"><span class="c" lang="ja">' +
      esc(c.ch) + "</span><small>" + esc(label) + "</small></button>";
  }
  function renderBrowse() {
    var chips = allDecks().map(function (d) {
      return '<button class="chip' + (d.id === browseDeck && !browseQuery ? " on" : "") + '" data-bd="' + esc(d.id) + '">' + esc(d.name) + "</button>";
    }).join("");
    view.innerHTML = '<input class="search" id="q" type="search" placeholder="Search: 水, water, みず, mizu, ka…" value="' + esc(browseQuery) + '">' +
      '<div class="chips">' + chips + "</div>" +
      '<div class="legend"><span><i></i>new</span><span><i style="background:var(--kincha)"></i>learning</span>' +
      '<span><i style="background:var(--matcha)"></i>review</span><span><i style="background:var(--ai)"></i>mature (21d+)</span></div>' +
      '<div class="grid" id="grid"></div><div class="more" id="more"></div>';
    var drawGrid = function () {
      var ids = searchLib(browseQuery, browseDeck);
      $("#grid").innerHTML = ids.slice(0, browseLimit).map(function (id) { return tileHTML(id); }).join("") ||
        '<p class="muted">No cards match.</p>';
      $("#more").innerHTML = ids.length > browseLimit ? '<button class="btn ghost block" id="moreBtn">Show more (' + (ids.length - browseLimit) + ")</button>" : "";
      if ($("#moreBtn")) $("#moreBtn").addEventListener("click", function () { browseLimit += 480; drawGrid(); });
      $$("#grid .tile").forEach(function (t) { t.addEventListener("click", function () { openDetail(t.getAttribute("data-id")); }); });
    };
    drawGrid();
    var timer;
    $("#q").addEventListener("input", function (e) {
      clearTimeout(timer);
      timer = setTimeout(function () {
        browseQuery = e.target.value.trim();
        browseLimit = 240;
        $$("[data-bd]").forEach(function (b) { b.classList.toggle("on", !browseQuery && b.getAttribute("data-bd") === browseDeck); });
        drawGrid();
      }, 200);
    });
    $$("[data-bd]").forEach(function (b) {
      b.addEventListener("click", function () {
        browseDeck = b.getAttribute("data-bd");
        browseQuery = "";
        browseLimit = 240;
        renderBrowse();
      });
    });
  }

  // ------------------------------------------------------------------ sheet / detail
  function openSheet(html, onBind) {
    $("#sheetInner").innerHTML = '<div class="grab"></div>' + html;
    $("#sheet").classList.remove("hidden");
    $("#sheetInner").scrollTop = 0;
    bindSay($("#sheetInner"));
    if (onBind) onBind($("#sheetInner"));
  }
  function closeSheet() { $("#sheet").classList.add("hidden"); $("#sheetInner").innerHTML = ""; }
  $("#sheet").addEventListener("click", function (e) { if (e.target.id === "sheet") closeSheet(); });

  function stateLine(id) {
    var s = S.states[id];
    if (!s || s.state === "new") return "Not studied yet";
    var due = s.due - Date.now();
    return (s.state === "review" ? "Review" : "Learning") + " · " + (due <= 0 ? "due now" : "due in " + SRS.humanDelay(due)) +
      (s.ivl ? " · interval " + s.ivl + "d" : "") + (s.lapses ? " · forgotten " + s.lapses + "×" : "");
  }
  function openDetail(id) {
    var c = getCard(id);
    if (!c) return;
    var decks = S.custom.decks;
    var h = cardBackHTML(c) +
      '<p class="muted small" style="margin-top:14px">' + esc(stateLine(id)) + (S.states[id + "|r"] ? "<br>Recall: " + esc(stateLine(id + "|r")) : "") + "</p>" +
      '<div class="sheet-actions">' +
      '<button class="btn soft" id="dEdit">✎ Edit card</button>' +
      '<button class="btn soft" id="dSay">🔊 Listen</button>' +
      (decks.length ? '<select class="btn ghost" id="dAdd"><option value="">＋ Add to deck…</option>' + decks.map(function (d) {
        return '<option value="' + esc(d.id) + '">' + esc(d.name) + (d.ids.indexOf(id) >= 0 ? " ✓" : "") + "</option>";
      }).join("") + "</select>" : '<button class="btn ghost" id="dNewDeck">＋ New deck with this</button>') +
      '<button class="btn ghost" id="dReset">Reset progress</button>' +
      (id.indexOf("c-") === 0 ? '<button class="btn ghost" id="dDelete" style="color:var(--shu)">Delete card</button>' : "") +
      '<button class="btn" id="dClose">Close</button></div>';
    openSheet(h, function (root) {
      $("#dClose", root).addEventListener("click", closeSheet);
      $("#dSay", root).addEventListener("click", function () { speakCard(c); });
      $("#dEdit", root).addEventListener("click", function () { openEditor(id); });
      $("#dReset", root).addEventListener("click", function () {
        if (!confirm("Reset progress for " + c.ch + "?")) return;
        delete S.states[id]; delete S.states[id + "|r"]; save(); closeSheet(); toast("Progress reset"); refresh();
      });
      if ($("#dAdd", root)) $("#dAdd", root).addEventListener("change", function (e) {
        var d = S.custom.decks.find(function (x) { return x.id === e.target.value; });
        if (!d) return;
        if (d.ids.indexOf(id) < 0) { d.ids.push(id); save(); toast("Added to " + d.name); } else toast("Already in " + d.name);
        e.target.value = "";
      });
      if ($("#dNewDeck", root)) $("#dNewDeck", root).addEventListener("click", function () {
        var name = prompt("Name for the new deck", "My deck");
        if (!name) return;
        var did = "d-" + Date.now();
        S.custom.decks.push({ id: did, name: name, ids: [id] });
        S.settings.active[did] = true;
        save(); closeSheet(); toast("Deck created and switched on");
      });
      if ($("#dDelete", root)) $("#dDelete", root).addEventListener("click", function () {
        if (!confirm("Delete this card?")) return;
        delete S.custom.cards[id]; delete S.states[id]; delete S.states[id + "|r"];
        S.custom.decks.forEach(function (d) { d.ids = d.ids.filter(function (x) { return x !== id; }); });
        save(); closeSheet(); toast("Card deleted"); refresh();
      });
    });
  }
  function refresh() { if (!document.body.classList.contains("studying")) go(current); }

  // ------------------------------------------------------------------ pictures
  function suggestEmoji(text) {
    var idx = window.EMOJI_INDEX || {}, out = [];
    var phrase = String(text || "").toLowerCase().trim();
    var words = phrase.split(/[^a-z]+/).filter(function (w) { return w.length > 2; });
    var add = function (e) { if (e && out.indexOf(e) < 0) out.push(e); };
    add(idx[phrase]);
    words.forEach(function (w) { add(idx[w]); if (w.slice(-1) === "s") add(idx[w.slice(0, -1)]); });
    if (out.length < 8 && words.length) {
      Object.keys(idx).some(function (k) {
        if (words.some(function (w) { return k.indexOf(w) === 0; })) add(idx[k]);
        return out.length >= 8;
      });
    }
    return out.slice(0, 8);
  }
  function readImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var size = 320, cv = document.createElement("canvas");
        cv.width = size; cv.height = size;
        var s = Math.min(img.width, img.height);
        cv.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        cb(cv.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = function () { toast("Could not read that image"); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  function pictureFieldHTML(pic, img) {
    return '<div class="field"><label>Picture</label><div class="row">' +
      '<input type="text" id="fPic" maxlength="16" value="' + esc(pic || "") + '" placeholder="Type or paste an emoji" style="font-size:24px">' +
      '<label class="btn soft" style="white-space:nowrap">📷 Photo<input type="file" id="fImg" accept="image/*" hidden></label></div>' +
      '<div class="emoji-sugg" id="fSugg"></div>' +
      '<div class="hint" id="fImgHint">' + (img ? 'Photo attached. <a href="#" id="fImgDel">Remove photo</a>' : "Tap a suggestion (based on the meaning), or add your own drawing or photo.") + "</div></div>";
  }
  // state: { pic, img, meaningText }. Returns a function that redraws suggestions for new text.
  function bindPictureField(root, state, onChange) {
    var bindDel = function () {
      var a = $("#fImgDel", root);
      if (a) a.addEventListener("click", function (ev) { ev.preventDefault(); state.img = ""; $("#fImgHint", root).textContent = "Photo removed."; onChange(); });
    };
    var drawSugg = function (text) {
      $("#fSugg", root).innerHTML = suggestEmoji(text).map(function (e) { return '<button type="button" data-e="' + esc(e) + '">' + esc(e) + "</button>"; }).join("");
      $$("#fSugg button", root).forEach(function (b) {
        b.addEventListener("click", function () { $("#fPic", root).value = b.getAttribute("data-e"); state.pic = b.getAttribute("data-e"); onChange(); });
      });
    };
    drawSugg(state.meaningText || "");
    $("#fPic", root).addEventListener("input", function (e) { state.pic = e.target.value.trim(); onChange(); });
    $("#fImg", root).addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      readImage(f, function (data) {
        state.img = data;
        $("#fImgHint", root).innerHTML = 'Photo attached. <a href="#" id="fImgDel">Remove photo</a>';
        bindDel();
        onChange();
      });
    });
    bindDel();
    return drawSugg;
  }

  // Edit a built-in card's mnemonic / picture (saved as an override, original kept).
  function openEditor(id) {
    if (id.indexOf("c-") === 0) { closeSheet(); editCustom = id; createTab = "card"; go("create"); return; }
    var c = getCard(id);
    var st = { pic: c.pic, img: c.img || "", meaningText: c.kw || c.romaji || "" };
    var h = '<h3 style="margin:4px 0 12px">Edit <span lang="ja">' + esc(c.ch) + "</span></h3>" +
      '<div class="field"><label>Mnemonic</label><textarea id="fMnem">' + esc(c.mnem || "") + "</textarea></div>" +
      pictureFieldHTML(c.pic, c.img) +
      '<div class="panel preview-wrap" id="ePrev"></div>' +
      '<div class="sheet-actions"><button class="btn ghost" id="eRevert">Restore original</button><button class="btn shu" id="eSave">Save</button></div>';
    openSheet(h, function (root) {
      var prev = function () {
        var tmp = Object.assign({}, c, { mnem: $("#fMnem", root).value, pic: st.pic || c.pic, img: st.img });
        $("#ePrev", root).innerHTML = cardBackHTML(tmp);
      };
      bindPictureField(root, st, prev);
      $("#fMnem", root).addEventListener("input", prev);
      prev();
      $("#eSave", root).addEventListener("click", function () {
        S.overrides[id] = { mnem: $("#fMnem", root).value.trim(), pic: st.pic, img: st.img };
        save(); toast("Saved"); openDetail(id);
      });
      $("#eRevert", root).addEventListener("click", function () {
        delete S.overrides[id]; save(); toast("Original restored"); openDetail(id);
      });
    });
  }

  // ------------------------------------------------------------------ create
  var createTab = "card", editCustom = null, deckDraft = null;
  function renderCreate() {
    view.innerHTML = '<div class="seg" id="cSeg" style="margin-top:6px">' +
      '<button data-ct="card" class="' + (createTab === "card" ? "on" : "") + '">New card</button>' +
      '<button data-ct="deck" class="' + (createTab === "deck" ? "on" : "") + '">Build a deck</button>' +
      '<button data-ct="mine" class="' + (createTab === "mine" ? "on" : "") + '">My decks</button></div><div id="cBody"></div>';
    $$("#cSeg button").forEach(function (b) {
      b.addEventListener("click", function () { createTab = b.getAttribute("data-ct"); if (createTab !== "card") editCustom = null; renderCreate(); });
    });
    ({ card: renderCardForm, deck: renderDeckBuilder, mine: renderMyDecks })[createTab]();
  }

  function renderCardForm() {
    var editing = editCustom ? S.custom.cards[editCustom] : null;
    var f = editing ? JSON.parse(JSON.stringify(editing)) :
      { type: "kanji", ch: "", romaji: "", pron: "", kw: "", meanings: [], on: [], kun: [], reading: "", mnem: "", pic: "", img: "" };
    var decks = S.custom.decks;
    var curDeck = editing ? (decks.find(function (d) { return d.ids.indexOf(editCustom) >= 0; }) || {}).id : (decks[0] || {}).id;
    var body = $("#cBody");
    body.innerHTML = '<div class="panel">' +
      (editing ? '<p class="small muted" style="margin-top:0">Editing your card <b lang="ja">' + esc(f.ch) + "</b></p>" : "") +
      '<div class="seg" id="tSeg"><button data-t="kana">Kana</button><button data-t="kanji">Kanji</button><button data-t="word">Word</button></div>' +
      '<div class="field"><label>Front (the character or word)</label><input type="text" class="big" id="fCh" value="' + esc(f.ch) + '" lang="ja" autocomplete="off"></div>' +
      '<div id="fFill"></div><div id="fType"></div>' +
      '<div class="field"><label>Mnemonic</label><textarea id="fMnem" placeholder="A little story that links the shape to the sound or meaning">' + esc(f.mnem) + "</textarea></div>" +
      pictureFieldHTML(f.pic, f.img) +
      '<div class="field"><label>Deck</label><select id="fDeck">' + decks.map(function (d) {
        return '<option value="' + esc(d.id) + '"' + (d.id === curDeck ? " selected" : "") + ">" + esc(d.name) + "</option>";
      }).join("") + '<option value="__new">＋ New deck…</option></select>' +
      '<input type="text" id="fDeckName" class="hidden" placeholder="New deck name" style="margin-top:8px"></div>' +
      '<button class="btn shu block" id="fSave">' + (editing ? "Save changes" : "Add card") + "</button>" +
      (editing ? '<button class="btn ghost block" id="fCancel" style="margin-top:8px">Cancel</button>' : "") + "</div>" +
      '<h2>Preview</h2><div class="fc" id="fPrev"></div>';
    var st = { pic: f.pic, img: f.img, meaningText: f.kw || f.romaji };
    if (!decks.length) { $("#fDeck").value = "__new"; $("#fDeckName").classList.remove("hidden"); $("#fDeckName").value = "My cards"; }

    var drawSugg;
    var read = function () {
      f.ch = $("#fCh").value.trim();
      f.mnem = $("#fMnem").value.trim();
      if ($("#fRomaji")) f.romaji = $("#fRomaji").value.trim().toLowerCase();
      if ($("#fPron")) f.pron = $("#fPron").value.trim();
      if ($("#fKw")) f.kw = $("#fKw").value.trim();
      if ($("#fMeans")) f.meanings = [f.kw].concat(splitList($("#fMeans").value)).filter(Boolean);
      else if ($("#fKw")) f.meanings = f.kw ? [f.kw] : [];
      if ($("#fOn")) f.on = splitList($("#fOn").value).map(toKata);
      if ($("#fKun")) f.kun = splitList($("#fKun").value).map(toHira);
      if ($("#fReading")) f.reading = toHira($("#fReading").value.trim());
      if (f.type === "kana" && !f.romaji && f.ch) f.romaji = romaji(f.ch);
      f.pic = st.pic; f.img = st.img;
      var mt = f.kw || f.romaji || "";
      if (drawSugg && mt !== st.meaningText) { st.meaningText = mt; drawSugg(mt); }
    };
    var typeFields = function () {
      var t = f.type, h;
      if (t === "kana") {
        h = '<div class="two"><div class="field"><label>Romaji</label><input type="text" id="fRomaji" value="' + esc(f.romaji) + '" placeholder="ka"></div>' +
          '<div class="field"><label>Sounds like (English)</label><input type="text" id="fPron" value="' + esc(f.pron) + '" placeholder="kah, as in car"></div></div>';
      } else if (t === "kanji") {
        h = '<div class="field"><label>English meaning (keyword)</label><input type="text" id="fKw" value="' + esc(f.kw) + '" placeholder="water"></div>' +
          '<div class="field"><label>Other meanings</label><input type="text" id="fMeans" value="' + esc((f.meanings || []).filter(function (m) { return m !== f.kw; }).join(", ")) + '" placeholder="liquid, fluid"></div>' +
          '<div class="two"><div class="field"><label>On\'yomi</label><input type="text" id="fOn" lang="ja" value="' + esc((f.on || []).join(", ")) + '" placeholder="スイ"></div>' +
          '<div class="field"><label>Kun\'yomi</label><input type="text" id="fKun" lang="ja" value="' + esc((f.kun || []).join(", ")) + '" placeholder="みず"></div></div>' +
          '<p class="hint" style="margin-top:-8px">Separate readings with commas. Put a dot before okurigana (つめ.たい) so the furigana sits only over the kanji.</p>';
      } else {
        h = '<div class="field"><label>Reading in hiragana (shown as furigana)</label><input type="text" id="fReading" lang="ja" value="' + esc(f.reading) + '" placeholder="にほんご"></div>' +
          '<div class="field"><label>English meaning</label><input type="text" id="fKw" value="' + esc(f.kw) + '" placeholder="Japanese language"></div>';
      }
      $("#fType").innerHTML = h;
      $$("#tSeg button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-t") === t); });
      $$("#fType input").forEach(function (i) { i.addEventListener("input", function () { read(); draw(); }); });
    };
    var draw = function () {
      var c = Object.assign({}, f, { id: editCustom || "c-preview" });
      var libId = BY_CHAR[c.ch];
      $("#fFill").innerHTML = libId && !editing ? '<button class="btn soft block" id="fFillBtn" style="margin:-4px 0 14px">Fill in from the built-in ' +
        esc(LIB[libId].deck === "hiragana" || LIB[libId].deck === "katakana" ? LIB[libId].deck : LIB[libId].deck.toUpperCase() + " kanji") + " card</button>" : "";
      if ($("#fFillBtn")) $("#fFillBtn").addEventListener("click", function () {
        var L = getCard(libId);
        f.type = L.type;
        ["romaji", "pron", "kw", "mnem", "pic"].forEach(function (k) { if (L[k]) f[k] = L[k]; });
        f.meanings = (L.meanings || []).slice(); f.on = (L.on || []).slice(); f.kun = (L.kun || []).slice();
        st.pic = L.pic; $("#fPic").value = L.pic || ""; $("#fMnem").value = L.mnem || "";
        typeFields(); read(); draw();
      });
      if (!c.ch) { $("#fPrev").innerHTML = '<p class="muted">Type a character to see the card.</p>'; return; }
      if (c.type === "kana" && !c.pron && c.romaji) c.pron = c.romaji;
      $("#fPrev").innerHTML = '<div class="fc-tag"><span class="k">preview</span></div>' + cardBackHTML(c);
      bindSay($("#fPrev"));
    };
    drawSugg = bindPictureField(body, st, function () { read(); draw(); });
    typeFields();
    $$("#tSeg button").forEach(function (b) { b.addEventListener("click", function () { read(); f.type = b.getAttribute("data-t"); typeFields(); draw(); }); });
    $("#fCh").addEventListener("input", function () { read(); draw(); });
    $("#fMnem").addEventListener("input", function () { read(); draw(); });
    $("#fDeck").addEventListener("change", function (e) { $("#fDeckName").classList.toggle("hidden", e.target.value !== "__new"); });
    if ($("#fCancel")) $("#fCancel").addEventListener("click", function () { editCustom = null; renderCreate(); });
    $("#fSave").addEventListener("click", function () {
      read();
      if (!f.ch) { toast("Add the character first"); return; }
      if (f.type === "kana" && !f.romaji) { toast("Add the romaji"); return; }
      if (f.type !== "kana" && !f.kw) { toast("Add the English meaning"); return; }
      var deckId = $("#fDeck").value;
      if (deckId === "__new") {
        var name = $("#fDeckName").value.trim() || "My cards";
        deckId = "d-" + Date.now();
        S.custom.decks.push({ id: deckId, name: name, ids: [] });
        S.settings.active[deckId] = true;
      }
      var id = editCustom || "c-" + Date.now().toString(36);
      S.custom.cards[id] = {
        id: id, type: f.type, deck: deckId, ch: f.ch, romaji: f.romaji, pron: f.pron || f.romaji || "",
        kw: f.kw, meanings: f.meanings, on: f.on, kun: f.kun, reading: f.reading, mnem: f.mnem, pic: f.pic || "📝", img: f.img || ""
      };
      S.custom.decks.forEach(function (d) { d.ids = d.ids.filter(function (x) { return x !== id; }); });
      S.custom.decks.find(function (d) { return d.id === deckId; }).ids.push(id);
      save();
      toast(editCustom ? "Card saved" : "Card added");
      editCustom = null;
      renderCreate();
    });
    read();
    draw();
  }

  function renderDeckBuilder() {
    if (!deckDraft) deckDraft = { id: null, name: "", ids: [], q: "", src: "n5" };
    var d = deckDraft;
    var body = $("#cBody");
    body.innerHTML = '<div class="panel"><div class="field"><label>Deck name</label><input type="text" id="dbName" value="' + esc(d.name) + '" placeholder="e.g. Food kanji, Station signs"></div>' +
      '<div class="row"><b id="dbCount" class="grow">' + d.ids.length + " selected</b>" +
      '<button class="btn ghost" id="dbClear">Clear</button><button class="btn shu" id="dbSave">Save deck</button></div></div>' +
      "<h2>Pick cards</h2>" +
      '<input class="search" id="dbQ" type="search" placeholder="Search the library: food, 食, たべる…" value="' + esc(d.q) + '">' +
      '<div class="chips">' + DECKS.map(function (x) { return '<button class="chip' + (x.id === d.src && !d.q ? " on" : "") + '" data-src="' + x.id + '">' + esc(x.name) + "</button>"; }).join("") +
      '<button class="chip' + (d.src === "__sel" && !d.q ? " on" : "") + '" data-src="__sel">Selected</button></div>' +
      '<div class="row" style="margin-bottom:10px"><button class="btn soft" id="dbAll">Select all shown</button><span class="muted small">Tap cards to add or remove.</span></div>' +
      '<div class="grid" id="dbGrid"></div>';
    var shown = [];
    var draw = function () {
      shown = d.q ? searchLib(d.q) : d.src === "__sel" ? d.ids.slice() : deckCardIds(d.src);
      $("#dbGrid").innerHTML = shown.slice(0, 600).map(function (id) { return tileHTML(id, d.ids.indexOf(id) >= 0); }).join("") || '<p class="muted">Nothing here yet.</p>';
      $("#dbCount").textContent = d.ids.length + " selected";
      $$("#dbGrid .tile").forEach(function (t) {
        t.addEventListener("click", function () {
          var id = t.getAttribute("data-id"), i = d.ids.indexOf(id);
          if (i >= 0) d.ids.splice(i, 1); else d.ids.push(id);
          t.classList.toggle("sel", i < 0);
          $("#dbCount").textContent = d.ids.length + " selected";
        });
      });
    };
    draw();
    var timer;
    $("#dbName").addEventListener("input", function (e) { d.name = e.target.value; });
    $("#dbQ").addEventListener("input", function (e) {
      clearTimeout(timer);
      timer = setTimeout(function () {
        d.q = e.target.value.trim();
        $$("[data-src]").forEach(function (b) { b.classList.toggle("on", !d.q && b.getAttribute("data-src") === d.src); });
        draw();
      }, 200);
    });
    $$("[data-src]").forEach(function (b) { b.addEventListener("click", function () { d.src = b.getAttribute("data-src"); d.q = ""; renderDeckBuilder(); }); });
    $("#dbAll").addEventListener("click", function () { shown.slice(0, 600).forEach(function (id) { if (d.ids.indexOf(id) < 0) d.ids.push(id); }); draw(); });
    $("#dbClear").addEventListener("click", function () { d.ids = []; draw(); });
    $("#dbSave").addEventListener("click", function () {
      if (!d.name.trim()) { toast("Give the deck a name"); $("#dbName").focus(); return; }
      if (!d.ids.length) { toast("Pick at least one card"); return; }
      if (d.id) {
        var ex = S.custom.decks.find(function (x) { return x.id === d.id; });
        ex.name = d.name.trim(); ex.ids = d.ids.slice();
      } else {
        var id = "d-" + Date.now();
        S.custom.decks.push({ id: id, name: d.name.trim(), ids: d.ids.slice() });
        S.settings.active[id] = true;
      }
      save();
      toast("Deck saved and switched on in Study");
      deckDraft = null;
      createTab = "mine";
      renderCreate();
    });
  }

  function renderMyDecks() {
    var body = $("#cBody");
    if (!S.custom.decks.length) {
      body.innerHTML = '<div class="panel"><p style="margin-top:0">You have no decks of your own yet.</p>' +
        '<p class="muted small">Build one from the library, or add your own cards: words from a textbook, signs you saw on a trip, anything.</p>' +
        '<button class="btn shu block" id="mdBuild">Build a deck</button></div>';
      $("#mdBuild").addEventListener("click", function () { createTab = "deck"; renderCreate(); });
      return;
    }
    body.innerHTML = S.custom.decks.map(function (d) {
      var own = d.ids.filter(function (id) { return id.indexOf("c-") === 0; }).length;
      var first = d.ids.length ? getCard(d.ids[0]) : null;
      return '<div class="deck"><div class="glyph" lang="ja">' + esc(first ? first.ch : "✎") + "</div>" +
        '<div class="grow"><h3>' + esc(d.name) + '</h3><div class="meta">' + d.ids.length + " cards" + (own ? " · " + own + " of your own" : "") + "</div></div>" +
        '<button class="iconbtn" data-edit="' + esc(d.id) + '" aria-label="Edit deck">✎</button>' +
        '<button class="iconbtn" data-del="' + esc(d.id) + '" aria-label="Delete deck">🗑</button></div>';
    }).join("") + '<button class="btn ghost block" id="mdBuild">＋ Build another deck</button>';
    $("#mdBuild").addEventListener("click", function () { deckDraft = null; createTab = "deck"; renderCreate(); });
    $$("[data-edit]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = S.custom.decks.find(function (x) { return x.id === b.getAttribute("data-edit"); });
        deckDraft = { id: d.id, name: d.name, ids: d.ids.slice(), q: "", src: "__sel" };
        createTab = "deck"; renderCreate();
      });
    });
    $$("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.getAttribute("data-del"), d = S.custom.decks.find(function (x) { return x.id === id; });
        if (!confirm('Delete the deck "' + d.name + '"? Your own cards in it are deleted too. Built-in cards keep their progress.')) return;
        d.ids.forEach(function (cid) {
          if (cid.indexOf("c-") === 0) { delete S.custom.cards[cid]; delete S.states[cid]; delete S.states[cid + "|r"]; }
        });
        S.custom.decks = S.custom.decks.filter(function (x) { return x.id !== id; });
        delete S.settings.active[id];
        save(); renderCreate();
      });
    });
  }

  // ------------------------------------------------------------------ settings
  function renderSettings() {
    var s = S.settings;
    var seg = function (key, opts) {
      return '<div class="seg" data-set="' + key + '" style="margin:8px 0 0">' + opts.map(function (o) {
        return '<button data-v="' + o[0] + '" class="' + (String(s[key]) === String(o[0]) ? "on" : "") + '">' + o[1] + "</button>";
      }).join("") + "</div>";
    };
    var total = Object.keys(S.states).length;
    view.innerHTML = '<h2>Study</h2><div class="panel">' +
      '<div class="set-row"><div class="grow"><b>New cards per day</b><span>Across all switched-on decks</span></div>' +
      '<div class="stepper"><button id="npdM" aria-label="Fewer">−</button><b id="npd">' + s.newPerDay + '</b><button id="npdP" aria-label="More">＋</button></div></div>' +
      '<div class="set-row" style="display:block"><div class="grow"><b>Card direction</b><span>Recognition shows the character. Recall shows the meaning or romaji, and you produce the character.</span></div>' +
      seg("dir", [["recog", "Recognition"], ["recall", "Recall"], ["both", "Both"]]) + "</div>" +
      '<div class="set-row" style="display:block"><div class="grow"><b>Learning steps</b><span>Repeats on the first day, before a new card moves on to days</span></div>' +
      seg("learnSteps", [["1,10", "1m · 10m"], ["1,10,60", "1m · 10m · 1h"], ["10", "10m"]]) + "</div>" +
      '<div class="set-row"><div class="grow"><b>Play sound on answer</b><span>Reads the kana or the kanji readings aloud</span></div><label class="switch"><input type="checkbox" id="auto"' + (s.autoplay ? " checked" : "") + "><span></span></label></div>" +
      '<div class="set-row"><div class="grow"><b>Romaji hint on kanji</b><span>Shows the on\'yomi in romaji under the kanji on the front</span></div><label class="switch"><input type="checkbox" id="rh"' + (s.romajiHint ? " checked" : "") + "><span></span></label></div>" +
      '</div><h2>Look</h2><div class="panel">' +
      '<div class="set-row" style="display:block"><div class="grow"><b>Theme</b></div>' + seg("theme", [["auto", "System"], ["light", "Light"], ["dark", "Dark"]]) + "</div></div>" +
      '<h2>Your data</h2><div class="panel">' +
      '<p class="small muted" style="margin-top:0">Progress is stored only on this phone (' + total + " card states). Export a backup now and then: uninstalling the app deletes it.</p>" +
      '<div class="two"><button class="btn soft" id="exp">Export backup</button><label class="btn soft">Import backup<input type="file" id="imp" accept="application/json,.json,text/plain" hidden></label></div>' +
      '<button class="btn ghost block" id="wipe" style="margin-top:10px;color:var(--shu)">Reset all progress</button></div>' +
      '<h2>About</h2><div class="panel credits">' +
      '<p style="margin-top:0"><b>Kioku</b> (<span lang="ja">記憶</span>, “memory”): hiragana, katakana and 2,211 JLPT N5–N1 kanji with spaced repetition. Works offline. No ads, no tracking.</p>' +
      "<p>Kanji meanings and readings: KANJIDIC2 by the Electronic Dictionary Research and Development Group (CC BY-SA 4.0), with JLPT levels from the kanji-data project (MIT). " +
      "Kanji parts: KanjiVG by Ulrich Apel (CC BY-SA 3.0). Emoji keywords: emojilib (MIT).</p>" +
      "<p>Kana mnemonics and the classic beginner kanji were written by hand. The other kanji stories are generated from each character's real parts, so treat them as a starting point and edit any that don't click.</p></div>";
    $("#npdM").addEventListener("click", function () { s.newPerDay = Math.max(0, s.newPerDay - 5); save(); $("#npd").textContent = s.newPerDay; });
    $("#npdP").addEventListener("click", function () { s.newPerDay = Math.min(200, s.newPerDay + 5); save(); $("#npd").textContent = s.newPerDay; });
    $$("[data-set]").forEach(function (g) {
      var key = g.getAttribute("data-set");
      $$("button", g).forEach(function (b) {
        b.addEventListener("click", function () {
          var v = b.getAttribute("data-v");
          s[key] = key === "learnSteps" ? v.split(",").map(Number) : v;
          save();
          if (key === "theme") applyTheme();
          $$("button", g).forEach(function (x) { x.classList.toggle("on", x === b); });
        });
      });
    });
    $("#auto").addEventListener("change", function (e) { s.autoplay = e.target.checked; save(); });
    $("#rh").addEventListener("change", function (e) { s.romajiHint = e.target.checked; save(); });
    $("#exp").addEventListener("click", exportBackup);
    $("#imp").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var data;
        try { data = JSON.parse(r.result); } catch (err) { data = null; }
        if (!data || !data.states || !data.settings) { toast("That file is not a Kioku backup"); return; }
        if (!confirm("Replace everything on this phone with this backup?")) return;
        localStorage.setItem(KEY, JSON.stringify(data));
        load(); applyTheme(); toast("Backup restored"); go("home");
      };
      r.readAsText(f);
    });
    $("#wipe").addEventListener("click", function () {
      if (!confirm("Erase ALL progress, your cards and your decks? This cannot be undone.")) return;
      if (!confirm("Really erase everything?")) return;
      S = defaultStore(); save(); applyTheme(); toast("Everything reset"); go("home");
    });
  }
  function exportBackup() {
    var json = JSON.stringify(S);
    var name = "kioku-backup-" + dayKey() + ".json";
    if (window.KiokuNative && window.KiokuNative.saveFile) { window.KiokuNative.saveFile(name, json); return; }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // Hooks for the Android shell.
  window.kiokuToast = toast;
  window.kiokuBack = function () {
    if (!$("#sheet").classList.contains("hidden")) { closeSheet(); return true; }
    if (document.body.classList.contains("studying")) { session = null; go("home"); return true; }
    if (current !== "home") { go("home"); return true; }
    return false;
  };

  // ------------------------------------------------------------------ boot
  load();
  applyTheme();
  if (window.matchMedia) {
    var mq = matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", applyTheme);
  }
  $$("#tabbar button").forEach(function (b) { b.addEventListener("click", function () { go(b.getAttribute("data-tab")); }); });
  go("home");
  window.Kioku = { store: function () { return S; }, romaji: romaji, getCard: getCard };
})();
