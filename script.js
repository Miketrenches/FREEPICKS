/* ============================================================
   FREEPICKS · SCRIPT
   Single IIFE. Sections:
     1. HELPERS
     2. STATE / STORAGE
     3. ROUTING (views)
     4. BOOT FX (particles, ticker)
     5. RENDER: HOME STATS
     6. RENDER: PARLAY GRID
     7. RENDER: PARLAY MODAL
     8. RENDER: MY PICKS
     9. RENDER: BOUNTY INFO
     10. MOD CONSOLE
     11. BOOT
   ============================================================ */
(function () {
  "use strict";

  /* ===== 1. HELPERS ===== */
  var $  = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var DATA = window.FREEPICKS_DATA || window.PARLAY_DATA || {};
  var clamp = function (n, lo, hi) { return Math.max(lo, Math.min(hi, n)); };
  var fmt = function (n) {
    if (typeof n !== "number") return n;
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(2).replace(/\.?0+$/, "");
  };
  var pad2 = function (n) { return n < 10 ? "0" + n : "" + n; };
  var formatKick = function (iso) {
    if (!iso) return "TBD";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "TBD";
    var months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    return months[d.getMonth()] + " " + pad2(d.getDate()) + " · " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  };
  var safe = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  }); };
  var flagUrl = function (code, w) {
    if (!code) return "";
    return "https://flagcdn.com/w" + (w || 80) + "/" + String(code).toLowerCase() + ".png";
  };
  var fmtUsd = function (n) {
    var v = Number(n) || 0;
    if (v >= 1000) return "$" + Math.round(v).toLocaleString();
    return "$" + v;
  };

  /* ===== 2. STATE / STORAGE ===== */
  var STORE_KEY = "freepicks:state:v2";
  var state = {
    parlays: [],
    matches: [],
    entries: {},        // parlay entries  { parlayId: [{handle, token, ts}] }
    matchEntries: {},   // match  entries  { matchId:  [{handle, token, pick, ts}] }
    me: { handle: "" },
    leaderboard: [],
    pool: {},
    voterToken: "",
  };

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          state.parlays      = Array.isArray(parsed.parlays) ? parsed.parlays : [];
          state.matches      = Array.isArray(parsed.matches) ? parsed.matches : [];
          state.entries      = parsed.entries || {};
          state.matchEntries = parsed.matchEntries || {};
          state.me           = parsed.me || { handle: "" };
          state.leaderboard  = Array.isArray(parsed.leaderboard) ? parsed.leaderboard : [];
          state.pool         = parsed.pool || {};
          state.voterToken   = parsed.voterToken || "";
        }
      }
    } catch (e) { /* corrupted storage, ignore */ }

    if (!state.parlays.length)     state.parlays     = JSON.parse(JSON.stringify(DATA.parlays || []));
    if (!state.matches.length)     state.matches     = JSON.parse(JSON.stringify(DATA.matches || []));
    if (!state.leaderboard.length) state.leaderboard = JSON.parse(JSON.stringify(DATA.leaderboard || []));
    if (!Object.keys(state.pool).length) state.pool = Object.assign({}, DATA.pool || {});
    if (!state.voterToken) state.voterToken = "v_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

    state.parlays.forEach(function (p) {
      if (!state.entries[p.id]) state.entries[p.id] = [];
      p.entrants = state.entries[p.id].length;
    });
    state.matches.forEach(function (m) {
      if (!state.matchEntries[m.id]) state.matchEntries[m.id] = [];
    });

    saveState();
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) {
      try {
        var slim = Object.assign({}, state);
        slim.entries = {};
        localStorage.setItem(STORE_KEY, JSON.stringify(slim));
      } catch (e2) { /* give up */ }
    }
  }

  /* ===== 3. ROUTING ===== */
  var VALID_VIEWS = ["home", "play", "picks", "bounty"];
  function go(view) {
    if (VALID_VIEWS.indexOf(view) === -1) view = "home";
    document.body.setAttribute("data-view", view);
    window.scrollTo(0, 0);
  }
  function bootRouting() {
    document.body.addEventListener("click", function (e) {
      var t = e.target.closest("[data-go]");
      if (!t) return;
      e.preventDefault();
      go(t.getAttribute("data-go"));
    });
    // Always start on the splash. Only honor #mod for the hidden admin console.
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    go("home");
    var hash = (location.hash || "").replace("#", "");
    if (hash === "mod") openMod();
  }

  /* ===== 4. BOOT FX (ticker + particles removed) ===== */

  /* ===== 5. SPLASH (home view) ===== */
  function renderSplashLinks() {
    var pump = $("#splashPump");
    var x    = $("#splashX");
    if (pump) pump.href = (DATA.links && (DATA.links.coin || DATA.links.pumpfun)) || "#";
    if (x)    x.href    = (DATA.links && DATA.links.x) || "#";
  }

  function pickFeatured() {
    var open = state.matches.filter(function (m) { return (m.status || "open") === "open"; });
    if (!open.length) open = state.matches.slice();
    if (!open.length) return null;
    var now = Date.now();
    var future = open.filter(function (m) {
      var t = m.kickoff ? new Date(m.kickoff).getTime() : 0;
      return t && t > now;
    });
    var pool = future.length ? future : open;
    pool.sort(function (a, b) {
      var ta = a.kickoff ? new Date(a.kickoff).getTime() : Infinity;
      var tb = b.kickoff ? new Date(b.kickoff).getTime() : Infinity;
      return ta - tb;
    });
    return pool[0];
  }

  function renderFeatured() {
    var m = pickFeatured();
    if (!m) return;

    var grp  = $("#featGroup");      if (grp)  grp.textContent = m.group || "—";
    var pool = $("#featPool");       if (pool) pool.textContent = fmtUsd(m.prizeUsd);

    var hCode = $("#featHomeCode");  if (hCode) hCode.textContent = m.home.code;
    var hName = $("#featHomeName");  if (hName) hName.textContent = m.home.name;
    var aCode = $("#featAwayCode");  if (aCode) aCode.textContent = m.away.code;
    var aName = $("#featAwayName");  if (aName) aName.textContent = m.away.name;

    var hf = $("#featHomeFlag");     if (hf) { hf.src = flagUrl(m.home.flag, 80); hf.alt = m.home.code; }
    var af = $("#featAwayFlag");     if (af) { af.src = flagUrl(m.away.flag, 80); af.alt = m.away.code; }

    $("#splashFeature").setAttribute("data-mid", m.id);
  }

  function bootFeatured() {
    var node = $("#splashFeature");
    if (!node) return;
    node.addEventListener("click", function () {
      var mid = node.getAttribute("data-mid");
      if (mid) openMatch(mid);
    });
  }

  function tickCountdown() {
    var p = pickFeatured();
    var el = $("#featCount");
    if (!p || !el) return;
    var t = p.kickoff ? new Date(p.kickoff).getTime() : 0;
    var diff = t - Date.now();
    if (!t || diff < 0) {
      el.textContent = "LIVE NOW";
      el.style.color = "var(--gold)";
      el.style.textShadow = "0 0 8px var(--gold), 0 0 22px rgba(212,175,55,0.55)";
      return;
    }
    var d = Math.floor(diff / 86400000);
    var h = Math.floor((diff % 86400000) / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    var s = Math.floor((diff % 60000) / 1000);
    el.textContent =
      (d > 0 ? d + "D " : "") +
      pad2(h) + " : " + pad2(m) + " : " + pad2(s);
  }
  function bootCountdown() {
    tickCountdown();
    setInterval(tickCountdown, 1000);
  }

  /* (bottom stat strip + play-toggle removed) */

  /* ===== 6. MATCH GRID (BOOK MATCH page) ===== */
  function renderMatches() {
    var grid = $("#matchGrid");
    var count = $("#matchCount");
    if (!grid) return;
    var tmpl = $("#tmplMatch");
    grid.innerHTML = "";
    var visible = state.matches.filter(function (m) { return m.status !== "hidden"; });
    visible.sort(function (a, b) {
      var ta = a.kickoff ? new Date(a.kickoff).getTime() : Infinity;
      var tb = b.kickoff ? new Date(b.kickoff).getTime() : Infinity;
      return ta - tb;
    });
    visible = visible.slice(0, 8);
    if (count) count.textContent = visible.length;
    visible.forEach(function (m) {
      var node = tmpl.content.firstElementChild.cloneNode(true);
      node.setAttribute("data-id", m.id);
      $(".match__group", node).textContent = m.group || "";
      $(".match__kick", node).textContent  = formatKick(m.kickoff);

      var teams = $$(".match__team", node);
      var hf = $(".match__flag", teams[0]);
      var af = $(".match__flag", teams[1]);
      if (hf) { hf.src = flagUrl(m.home.flag, 80); hf.alt = m.home.code; }
      if (af) { af.src = flagUrl(m.away.flag, 80); af.alt = m.away.code; }
      $(".match__code", teams[0]).textContent = m.home.code;
      $(".match__name", teams[0]).textContent = m.home.name;
      $(".match__code", teams[1]).textContent = m.away.code;
      $(".match__name", teams[1]).textContent = m.away.name;

      $(".match__venue", node).textContent = m.venue || "";
      $(".match__city", node).textContent  = m.city || "";

      $(".match__bounty", node).innerHTML = "<b>" + fmtUsd(m.prizeUsd) + "</b> · 5 PREDS";
      node.addEventListener("click", function () { openMatch(m.id); });
      grid.appendChild(node);
    });
    if (!visible.length) {
      grid.innerHTML = '<div class="mod-empty">NO MATCHES SCHEDULED</div>';
    }
  }

  /* ===== 7. PARLAY MODAL ===== */
  var activeParlayId = null;
  function openParlay(id) {
    var p = state.parlays.find(function (x) { return x.id === id; });
    if (!p) return;
    activeParlayId = id;
    var modal = $("#parlayModal");
    $("#pmTitle").textContent = p.title;
    $("#pmSub").textContent   = p.subtitle || "";
    var diff = $("#pmDiff");
    diff.textContent = p.difficulty || "MEDIUM";
    diff.setAttribute("data-d", p.difficulty || "MEDIUM");
    $("#pmPool").textContent  = fmt(p.bountyPool) + " " + (p.bountyToken || "SOL");
    $("#pmKick").textContent  = formatKick(p.kickoff);
    $("#pmEntries").textContent = String((state.entries[p.id] || []).length);
    $("#pmStatus").textContent = (p.status || "open").toUpperCase();
    var pump = $("#pmPump");
    pump.href = p.pumpfunUrl || (DATA.links && DATA.links.pumpfun) || "#";

    var legs = $("#pmLegs");
    legs.innerHTML = "";
    (p.legsList || []).forEach(function (leg, i) {
      var div = document.createElement("div");
      div.className = "leg";
      div.innerHTML =
        '<div class="leg__num">' + (i + 1) + "</div>" +
        '<div class="leg__txt"><b>' + safe(leg.match) + "</b><span>" + safe(leg.pick) + "</span></div>" +
        '<div class="leg__odds">' + safe(leg.odds || "") + "</div>";
      legs.appendChild(div);
    });

    var form = $("#pmForm");
    var success = $("#pmSuccess");
    form.hidden = false;
    success.hidden = true;
    var input = $("#pmHandle");
    input.value = state.me.handle || "";

    var alreadyIn = (state.entries[p.id] || []).some(function (e) {
      return e.token === state.voterToken;
    });
    var submitBtn = $(".pm__submit", form);
    if (alreadyIn) {
      submitBtn.textContent = "ALREADY LOCKED IN";
      submitBtn.disabled = true;
    } else if (p.status !== "open") {
      submitBtn.textContent = (p.status || "CLOSED").toUpperCase();
      submitBtn.disabled = true;
    } else {
      submitBtn.textContent = "LOCK IN PICK";
      submitBtn.disabled = false;
    }

    modal.hidden = false;
    setTimeout(function () { input.focus(); }, 80);
  }
  function closeParlay() {
    $("#parlayModal").hidden = true;
    activeParlayId = null;
  }
  function bootParlayModal() {
    $("#parlayModal").addEventListener("click", function (e) {
      if (e.target.matches("[data-close]")) closeParlay();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeParlay();
    });
    $("#pmForm").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!activeParlayId) return;
      var p = state.parlays.find(function (x) { return x.id === activeParlayId; });
      if (!p || p.status !== "open") return;
      var raw = $("#pmHandle").value.trim();
      if (!raw) return;
      var handle = raw.charAt(0) === "@" || raw.length > 30 ? raw : "@" + raw;
      state.me.handle = handle;
      if (!state.entries[p.id]) state.entries[p.id] = [];
      var dup = state.entries[p.id].some(function (e2) { return e2.token === state.voterToken; });
      if (!dup) {
        state.entries[p.id].push({ handle: handle, token: state.voterToken, ts: Date.now() });
        p.entrants = state.entries[p.id].length;
      }
      saveState();
      $("#pmEntries").textContent = String(state.entries[p.id].length);

      $("#pmForm").hidden = true;
      var s = $("#pmSuccess");
      s.hidden = false;
      $("#pmSuccessMsg").innerHTML =
        "PICK CONFIRMED FOR <b>" + safe(handle) + "</b>.<br>" +
        "IF EVERY LEG HITS, YOU SHARE THE <b>" + fmt(p.bountyPool) + " " + safe(p.bountyToken || "SOL") +
        "</b> BOUNTY POOL ON PUMP.FUN.<br>" +
        "WATCH @" + (DATA.brand && DATA.brand.name ? DATA.brand.name : "FREEPICKS") + " ON X FOR PAYOUT.";
    });
  }

  /* ===== 7b. MATCH PICK MODAL — 5 PREDICTIONS ===== */
  var activeMatchId = null;
  var activePicks = { winner: null, goals: null, firstGoal: null, btts: null, scorer: null };
  var PRED_KEYS = ["winner", "goals", "firstGoal", "btts", "scorer"];
  var PRED_LABELS = {
    winner:    "WINNER",
    goals:     "TOTAL GOALS",
    firstGoal: "FIRST GOAL",
    btts:      "BOTH TEAMS SCORE",
    scorer:    "ANYTIME SCORER",
  };

  function resetPicks() {
    activePicks = { winner: null, goals: null, firstGoal: null, btts: null, scorer: null };
  }

  function renderQuestionOptions(m) {
    // 1. Winner
    var qw = $("#qWinner");
    qw.innerHTML =
      '<button class="pred__opt" type="button" data-v="home">' + safe(m.home.code) + ' WIN</button>' +
      '<button class="pred__opt" type="button" data-v="draw">DRAW</button>' +
      '<button class="pred__opt" type="button" data-v="away">' + safe(m.away.code) + ' WIN</button>';

    // 3. First Goal
    var qf = $("#qFirstGoal");
    qf.innerHTML =
      '<button class="pred__opt" type="button" data-v="home">' + safe(m.home.code) + '</button>' +
      '<button class="pred__opt" type="button" data-v="away">' + safe(m.away.code) + '</button>' +
      '<button class="pred__opt" type="button" data-v="none">NO GOAL</button>';

    // 5. Scorers
    var qs = $("#qScorer");
    var players = (m.players || []).slice();
    players.push("ANY OTHER");
    qs.innerHTML = players.map(function (p) {
      return '<button class="pred__opt" type="button" data-v="' + safe(p) + '">' + safe(p) + '</button>';
    }).join("");

    bindPredButtons();
  }

  function bindPredButtons() {
    $$(".pred").forEach(function (block) {
      var q = block.getAttribute("data-q");
      block.classList.remove("is-done");
      $$(".pred__opt", block).forEach(function (btn) {
        // re-bind: clone to drop old handlers, strip stale selected state, and blur focus
        var fresh = btn.cloneNode(true);
        fresh.classList.remove("is-selected");
        btn.parentNode.replaceChild(fresh, btn);
        fresh.addEventListener("click", function () {
          if (!activeMatchId) return;
          var m = state.matches.find(function (x) { return x.id === activeMatchId; });
          if (!m || m.status !== "open") return;
          var v = fresh.getAttribute("data-v");
          activePicks[q] = v;
          $$(".pred__opt", block).forEach(function (b) { b.classList.remove("is-selected"); });
          fresh.classList.add("is-selected");
          block.classList.add("is-done");
          fresh.blur();
          updateProgress();
        });
      });
    });
  }

  function buildBountyMessage(m, handle) {
    var labels = {
      winner: activePicks.winner === "home" ? m.home.code + " WIN"
            : activePicks.winner === "away" ? m.away.code + " WIN"
            : "DRAW",
      goals:  activePicks.goals,
      firstGoal: activePicks.firstGoal === "home" ? m.home.code
               : activePicks.firstGoal === "away" ? m.away.code
               : "NO GOAL",
      btts: (activePicks.btts || "").toUpperCase(),
      scorer: activePicks.scorer,
    };
    return [
      "FREEPICKS BOUNTY ENTRY",
      m.home.name + " vs " + m.away.name + "  (" + (m.group || "") + ")",
      "X: " + handle,
      "",
      "1. WINNER:        " + labels.winner,
      "2. TOTAL GOALS:   " + labels.goals,
      "3. FIRST GOAL:    " + labels.firstGoal,
      "4. BTTS:          " + labels.btts,
      "5. SCORER:        " + labels.scorer,
      "",
      "All 5 must hit. Final stats posted on X @FREEPICKS.",
    ].join("\n");
  }

  function showPicksForm() {
    $("#mmForm").hidden = false;
    var rev = $("#mmReview"); if (rev) rev.hidden = true;
  }
  function showReview() {
    var rev = $("#mmReview"); if (rev) rev.hidden = false;
  }
  function closeReview() {
    var rev = $("#mmReview"); if (rev) rev.hidden = true;
  }

  function updateProgress() {
    var done = PRED_KEYS.filter(function (k) { return activePicks[k] !== null; }).length;
    var prog = $("#mmProgress");
    if (prog) prog.textContent = String(done);
    var sub = $(".mm__submit");
    if (!sub) return;
    if (done < 5) {
      sub.disabled = true;
      sub.textContent = "LOCK ALL 5 TO BOOK · " + done + "/5";
    } else {
      sub.disabled = false;
      sub.textContent = "BOOK BOUNTY · LOCK 5/5";
    }
  }

  function openMatch(id) {
    var m = state.matches.find(function (x) { return x.id === id; });
    if (!m) return;
    activeMatchId = id;
    resetPicks();

    $("#mmGroup").textContent = m.group || "";
    $("#mmKick").textContent  = formatKick(m.kickoff);
    $("#mmHome").textContent     = m.home.code;
    $("#mmHomeName").textContent = m.home.name;
    $("#mmAway").textContent     = m.away.code;
    $("#mmAwayName").textContent = m.away.name;
    var hf = $("#mmHomeFlag"); if (hf) { hf.src = flagUrl(m.home.flag, 160); hf.alt = m.home.code; }
    var af = $("#mmAwayFlag"); if (af) { af.src = flagUrl(m.away.flag, 160); af.alt = m.away.code; }
    $("#mmVenue").textContent    = (m.venue || "") + (m.city ? " · " + m.city : "");
    $("#mmPool").textContent     = fmtUsd(m.prizeUsd);

    renderQuestionOptions(m);
    $$(".pred").forEach(function (b) { b.classList.remove("is-done"); });
    updateProgress();

    $("#mmHandle").value = state.me.handle || "";
    showPicksForm();

    var sub = $(".mm__submit");
    if (m.status !== "open") {
      sub.textContent = (m.status || "CLOSED").toUpperCase();
      sub.disabled = true;
    }

    $("#matchModal").hidden = false;
  }
  function closeMatch() {
    $("#matchModal").hidden = true;
    closeReview();
    activeMatchId = null;
    resetPicks();
  }
  function bootMatchModal() {
    $("#matchModal").addEventListener("click", function (e) {
      if (e.target.matches("[data-mclose]")) closeMatch();
    });
    var revModal = $("#mmReview");
    if (revModal) {
      revModal.addEventListener("click", function (e) {
        if (e.target.matches("[data-revclose]")) closeReview();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      // close review popup first if open, otherwise close the match modal
      if (revModal && !revModal.hidden) { closeReview(); return; }
      closeMatch();
    });

    // Pre-bind static blocks (goals + btts). Dynamic blocks (winner/firstGoal/scorer)
    // are bound from renderQuestionOptions when the modal opens.
    bindPredButtons();

    $("#mmForm").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!activeMatchId) return;
      var m = state.matches.find(function (x) { return x.id === activeMatchId; });
      if (!m || m.status !== "open") return;
      var done = PRED_KEYS.every(function (k) { return activePicks[k] !== null; });
      if (!done) return;
      var raw = $("#mmHandle").value.trim();
      if (!raw) return;
      var handle = raw.charAt(0) === "@" || raw.length > 30 ? raw : "@" + raw;
      state.me.handle = handle;

      if (!state.matchEntries[m.id]) state.matchEntries[m.id] = [];
      // replace any prior entry from this same voter for this match (latest wins)
      state.matchEntries[m.id] = state.matchEntries[m.id].filter(function (e2) {
        return e2.token !== state.voterToken;
      });
      state.matchEntries[m.id].push({
        handle: handle,
        token: state.voterToken,
        picks: Object.assign({}, activePicks),
        ts: Date.now(),
        prizeUsd: m.prizeUsd || 0,
      });
      saveState();
      renderMyPicks();

      var msg = buildBountyMessage(m, handle);
      var ta = $("#mmReviewText");
      if (ta) ta.value = msg;

      // reset copy button label every time we enter review
      var cp = $("#mmCopyBtn");
      if (cp) { cp.textContent = "COPY MESSAGE"; cp.classList.remove("is-copied"); }

      showReview();

      // auto-select for instant manual copy as a fallback
      setTimeout(function () { try { ta.focus(); ta.select(); } catch (err) {} }, 30);
    });

    var copyBtn = $("#mmCopyBtn");
    if (copyBtn) copyBtn.addEventListener("click", function () {
      var ta = $("#mmReviewText");
      if (!ta) return;
      var text = ta.value;
      var done = function () {
        copyBtn.textContent = "COPIED ✓";
        copyBtn.classList.add("is-copied");
        setTimeout(function () {
          copyBtn.textContent = "COPY MESSAGE";
          copyBtn.classList.remove("is-copied");
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          ta.focus(); ta.select();
          try { document.execCommand("copy"); done(); } catch (err) {}
        });
      } else {
        ta.focus(); ta.select();
        try { document.execCommand("copy"); done(); } catch (err) {}
      }
    });

    var lockBtn = $("#mmLockInBtn");
    if (lockBtn) lockBtn.addEventListener("click", function () {
      try { window.open("https://pump.fun/go", "_blank", "noopener"); } catch (err) {}
    });

    var backBtn = $("#mmBackBtn");
    if (backBtn) backBtn.addEventListener("click", function () { closeReview(); });
  }

  /* ===== 8. MY PICKS ===== */
  function getMyEntries() {
    var rows = [];
    state.matches.forEach(function (m) {
      var arr = state.matchEntries[m.id] || [];
      arr.forEach(function (e) {
        if (e.token === state.voterToken) rows.push({ match: m, entry: e });
      });
    });
    rows.sort(function (a, b) { return (b.entry.ts || 0) - (a.entry.ts || 0); });
    return rows;
  }

  function picksLabels(m, picks) {
    return {
      winner: picks.winner === "home" ? m.home.code + " WIN"
            : picks.winner === "away" ? m.away.code + " WIN"
            : "DRAW",
      goals:  picks.goals,
      firstGoal: picks.firstGoal === "home" ? m.home.code
               : picks.firstGoal === "away" ? m.away.code
               : "NO GOAL",
      btts:   (picks.btts || "").toUpperCase(),
      scorer: picks.scorer || "—",
    };
  }

  function buildBountyMessageFor(m, entry) {
    var L = picksLabels(m, entry.picks || {});
    return [
      "FREEPICKS BOUNTY ENTRY",
      m.home.name + " vs " + m.away.name + "  (" + (m.group || "") + ")",
      "X: " + entry.handle,
      "",
      "1. WINNER:        " + L.winner,
      "2. TOTAL GOALS:   " + L.goals,
      "3. FIRST GOAL:    " + L.firstGoal,
      "4. BTTS:          " + L.btts,
      "5. SCORER:        " + L.scorer,
      "",
      "All 5 must hit. Final stats posted on X @FREEPICKS.",
    ].join("\n");
  }

  function renderMyPicks() {
    var box   = $("#picksBody");
    var empty = $("#picksEmpty");
    var count = $("#picksCount");
    if (!box || !empty) return;

    var rows = getMyEntries();
    if (count) count.textContent = rows.length;

    if (!rows.length) {
      box.innerHTML = "";
      box.hidden = true;
      empty.hidden = false;
      return;
    }
    box.hidden = false;
    empty.hidden = true;

    box.innerHTML = rows.map(function (r) {
      var m = r.match;
      var e = r.entry;
      var L = picksLabels(m, e.picks || {});
      var booked = new Date(e.ts || Date.now());
      var bookedStr = (booked.getMonth() + 1) + "/" + pad2(booked.getDate()) + " · " + pad2(booked.getHours()) + ":" + pad2(booked.getMinutes());
      return (
        '<div class="pick-card" data-mid="' + safe(m.id) + '">' +
          '<div class="pick-card__head">' +
            '<span class="pick-card__group">' + safe(m.group || "") + '</span>' +
            '<span class="pick-card__prize">' + fmtUsd(e.prizeUsd || m.prizeUsd) + ' BOUNTY</span>' +
          '</div>' +
          '<div class="pick-card__teams">' +
            '<div class="pick-card__team">' +
              '<img class="pick-card__flag" src="' + flagUrl(m.home.flag, 80) + '" alt="' + safe(m.home.code) + '"/>' +
              '<span class="pick-card__code">' + safe(m.home.code) + '</span>' +
            '</div>' +
            '<span class="pick-card__vs">VS</span>' +
            '<div class="pick-card__team">' +
              '<img class="pick-card__flag" src="' + flagUrl(m.away.flag, 80) + '" alt="' + safe(m.away.code) + '"/>' +
              '<span class="pick-card__code">' + safe(m.away.code) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="pick-card__rows">' +
            '<div class="pick-card__row"><span class="pick-card__row-lbl">WINNER</span><span class="pick-card__row-val">' + safe(L.winner) + '</span></div>' +
            '<div class="pick-card__row"><span class="pick-card__row-lbl">TOTAL GOALS</span><span class="pick-card__row-val">' + safe(L.goals) + '</span></div>' +
            '<div class="pick-card__row"><span class="pick-card__row-lbl">FIRST GOAL</span><span class="pick-card__row-val">' + safe(L.firstGoal) + '</span></div>' +
            '<div class="pick-card__row"><span class="pick-card__row-lbl">BTTS</span><span class="pick-card__row-val">' + safe(L.btts) + '</span></div>' +
            '<div class="pick-card__row pick-card__row--full"><span class="pick-card__row-lbl">ANYTIME SCORER</span><span class="pick-card__row-val">' + safe(L.scorer) + '</span></div>' +
          '</div>' +
          '<div class="pick-card__foot">' +
            '<span class="pick-card__handle">' + safe(e.handle) + ' · ' + safe(bookedStr) + '</span>' +
            '<span class="pick-card__actions">' +
              '<button class="pick-card__btn" data-act="copy">COPY</button>' +
              '<button class="pick-card__btn pick-card__btn--danger" data-act="delete">DELETE</button>' +
            '</span>' +
          '</div>' +
        '</div>'
      );
    }).join("");
  }

  function bootMyPicksActions() {
    var box = $("#picksBody");
    if (!box) return;
    box.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-act]");
      if (!btn) return;
      var card = btn.closest(".pick-card");
      if (!card) return;
      var mid = card.getAttribute("data-mid");
      var match = state.matches.find(function (x) { return x.id === mid; });
      if (!match) return;
      var entry = (state.matchEntries[mid] || []).find(function (en) { return en.token === state.voterToken; });
      if (!entry) return;
      var act = btn.getAttribute("data-act");
      if (act === "copy") {
        var text = buildBountyMessageFor(match, entry);
        var done = function () {
          btn.textContent = "COPIED ✓";
          btn.classList.add("is-copied");
          setTimeout(function () { btn.textContent = "COPY"; btn.classList.remove("is-copied"); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () {
            try {
              var ta = document.createElement("textarea");
              ta.value = text; document.body.appendChild(ta); ta.select();
              document.execCommand("copy"); document.body.removeChild(ta); done();
            } catch (err) {}
          });
        } else {
          try {
            var ta2 = document.createElement("textarea");
            ta2.value = text; document.body.appendChild(ta2); ta2.select();
            document.execCommand("copy"); document.body.removeChild(ta2); done();
          } catch (err) {}
        }
      } else if (act === "delete") {
        state.matchEntries[mid] = (state.matchEntries[mid] || []).filter(function (en) {
          return en.token !== state.voterToken;
        });
        saveState();
        renderMyPicks();
      }
    });
  }

  /* ===== 9. BOUNTY INFO ===== */
  function renderBounty() {
    var intro = $("#bountyIntro");
    var steps = $("#bountySteps");
    if (!intro || !steps) return;
    var b = DATA.bounty || {};
    intro.innerHTML =
      "<h3>" + safe(b.headline || "HOW THE BOUNTY WORKS") + "</h3>" +
      (b.body || []).map(function (line) { return "<p>" + line + "</p>"; }).join("");
    steps.innerHTML = (b.steps || []).map(function (s) {
      return (
        '<div class="step">' +
          '<div class="step__n">' + safe(s.n) + "</div>" +
          '<div class="step__t">' + safe(s.t) + "</div>" +
          '<div class="step__d">' + safe(s.d) + "</div>" +
        "</div>"
      );
    }).join("");
    var pump = $("#ctaPump");
    if (pump) pump.href = (DATA.links && DATA.links.coin) || (DATA.links && DATA.links.pumpfun) || "#";
  }

  /* ===== 10. MOD CONSOLE ===== */
  var modTab = "bounties";
  function openMod() {
    $("#modView").hidden = false;
    renderMod();
  }
  function closeMod() {
    $("#modView").hidden = true;
    if ((location.hash || "") === "#mod") {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    }
  }
  function renderMod() {
    $$(".mod__tab").forEach(function (t) {
      t.classList.toggle("is-active", t.getAttribute("data-tab") === modTab);
    });
    var body = $("#modBody");
    if (!body) return;
    if (modTab === "bounties")  body.innerHTML = renderModBounties();
    else if (modTab === "entries") body.innerHTML = renderModEntries();
    else if (modTab === "reset")   body.innerHTML = renderModReset();
    bindModActions(body);
  }
  function renderModBounties() {
    if (!state.parlays.length) return '<div class="mod-empty">NO PARLAYS</div>';
    return state.parlays.map(function (p) {
      var entries = (state.entries[p.id] || []).length;
      return (
        '<div class="mod-item">' +
          '<div>' +
            '<div class="mod-item__t">' + safe(p.title) + " · " + fmt(p.bountyPool) + " " + safe(p.bountyToken || "SOL") + "</div>" +
            '<div class="mod-item__d">' + safe(p.id) + " · " + entries + " ENTRIES · " + (p.status || "open").toUpperCase() + "</div>" +
          "</div>" +
          '<div class="mod-actions">' +
            '<button class="mod-btn ' + (p.status === "open" ? "is-on" : "") + '" data-act="status" data-s="open"   data-id="' + p.id + '">OPEN</button>' +
            '<button class="mod-btn ' + (p.status === "locked" ? "is-on" : "") + '" data-act="status" data-s="locked" data-id="' + p.id + '">LOCK</button>' +
            '<button class="mod-btn ' + (p.status === "won" ? "is-on" : "") + '" data-act="status" data-s="won"    data-id="' + p.id + '">WON</button>' +
            '<button class="mod-btn ' + (p.status === "lost" ? "is-on" : "") + '" data-act="status" data-s="lost"   data-id="' + p.id + '">LOST</button>' +
            '<button class="mod-btn is-bad" data-act="delete" data-id="' + p.id + '">DEL</button>' +
          "</div>" +
        "</div>"
      );
    }).join("");
  }
  function renderModEntries() {
    var rows = [];
    state.parlays.forEach(function (p) {
      (state.entries[p.id] || []).forEach(function (e) {
        rows.push({ pid: p.id, title: p.title, handle: e.handle, ts: e.ts });
      });
    });
    if (!rows.length) return '<div class="mod-empty">NO ENTRIES YET</div>';
    rows.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    return rows.map(function (r) {
      var d = new Date(r.ts || 0);
      var when = pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + " · " + pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1);
      return (
        '<div class="mod-item">' +
          '<div>' +
            '<div class="mod-item__t">' + safe(r.handle) + "</div>" +
            '<div class="mod-item__d">' + safe(r.title) + " · " + when + "</div>" +
          "</div>" +
          '<div class="mod-actions">' +
            '<button class="mod-btn is-bad" data-act="rm-entry" data-pid="' + r.pid + '" data-handle="' + safe(r.handle) + '">REMOVE</button>' +
          "</div>" +
        "</div>"
      );
    }).join("");
  }
  function renderModReset() {
    return (
      '<div class="mod-danger">' +
        "<p>WIPE LOCAL STATE AND RELOAD SEED DATA.<br>THIS CLEARS ALL ENTRIES IN THIS BROWSER ONLY.</p>" +
        '<button class="mod-btn is-bad" data-act="wipe">WIPE LOCAL STATE</button>' +
      "</div>"
    );
  }
  function bindModActions(root) {
    $$("button[data-act]", root).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-act");
        if (act === "status") {
          var id = btn.getAttribute("data-id");
          var s  = btn.getAttribute("data-s");
          var p = state.parlays.find(function (x) { return x.id === id; });
          if (p) { p.status = s; saveState(); renderMod(); renderFeatured(); }
        }
        if (act === "delete") {
          var id2 = btn.getAttribute("data-id");
          if (!confirm("Delete parlay " + id2 + "?")) return;
          state.parlays = state.parlays.filter(function (x) { return x.id !== id2; });
          delete state.entries[id2];
          saveState(); renderMod(); renderFeatured();
        }
        if (act === "rm-entry") {
          var pid = btn.getAttribute("data-pid");
          var hd  = btn.getAttribute("data-handle");
          state.entries[pid] = (state.entries[pid] || []).filter(function (e) { return e.handle !== hd; });
          var p2 = state.parlays.find(function (x) { return x.id === pid; });
          if (p2) p2.entrants = state.entries[pid].length;
          saveState(); renderMod();
        }
        if (act === "wipe") {
          if (!confirm("Wipe ALL local state? Cannot undo.")) return;
          try { localStorage.removeItem(STORE_KEY); } catch (e) {}
          location.reload();
        }
      });
    });
  }
  function bootMod() {
    $$(".mod__tab").forEach(function (t) {
      t.addEventListener("click", function () { modTab = t.getAttribute("data-tab"); renderMod(); });
    });
    $("#modView").addEventListener("click", function (e) {
      if (e.target.matches("[data-close-mod]")) closeMod();
    });
    document.addEventListener("keydown", function (e) {
      if ((e.key === "M" || e.key === "m") && e.shiftKey) {
        var v = $("#modView");
        if (v.hidden) openMod(); else closeMod();
      }
    });
  }

  /* ===== 11. BOOT ===== */
  function bootClickFx() {
    var fx = document.getElementById("clickFx");
    if (!fx) return;
    fx.volume = 0.55;
    document.addEventListener("click", function () {
      try {
        // Only kick the song off when it isn't already playing.
        // Subsequent clicks (e.g. nav, BACK) keep the existing playback intact.
        if (fx.paused || fx.ended) {
          if (fx.ended) fx.currentTime = 0;
          var p = fx.play();
          if (p && typeof p.catch === "function") p.catch(function () {});
        }
      } catch (e) {}
    });
  }

  function boot() {
    loadState();
    bootRouting();
    bootParlayModal();
    bootMatchModal();
    bootMod();
    bootFeatured();
    bootMyPicksActions();
    bootClickFx();
    renderSplashLinks();
    renderFeatured();
    bootCountdown();
    renderMatches();
    renderMyPicks();
    renderBounty();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
