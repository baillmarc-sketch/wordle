(() => {
  "use strict";

  const ROWS = 6;
  const COLS = 5;

  // Per-page configuration (set before this script loads to make a themed
  // variant; defaults preserve the original game)
  const TITLE = typeof GAME_TITLE !== "undefined" ? GAME_TITLE : "My Wordle";
  const PREFIX = typeof GAME_PREFIX !== "undefined" ? GAME_PREFIX : "myWordle";
  const ANSWER_POOL = typeof CUSTOM_ANSWERS !== "undefined" ? CUSTOM_ANSWERS : ANSWER_WORDS;
  ANSWER_POOL.forEach((w) => VALID_WORDS.add(w));

  // ---------- Answer selection ----------

  function todayKey() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function isValidAnswerWord(w) {
    return typeof w === "string" && /^[a-z]{5}$/.test(w.toLowerCase().trim());
  }

  // Deterministic per-day pick from the answer pool (mulberry32 seeded by day number)
  function dailyDatabaseWord(dateKey) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const dayNum = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
    let t = dayNum + 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return ANSWER_POOL[Math.floor(r * ANSWER_POOL.length)];
  }

  // A shared challenge link (?w=BASE64WORD) takes priority, then the
  // owner's DAILY_OVERRIDES entry for today, then the word database.
  function resolveAnswer() {
    const param = new URLSearchParams(location.search).get("w");
    if (param) {
      try {
        const w = atob(param).toLowerCase().trim();
        if (isValidAnswerWord(w)) return { word: w, mode: "challenge", id: "challenge-" + param };
      } catch (e) { /* fall through to daily word */ }
    }
    const key = todayKey();
    const override = DAILY_OVERRIDES[key];
    if (isValidAnswerWord(override)) {
      return { word: override.toLowerCase().trim(), mode: "daily", id: key };
    }
    return { word: dailyDatabaseWord(key), mode: "daily", id: key };
  }

  const { word: ANSWER, mode: MODE, id: GAME_ID } = resolveAnswer();

  // ---------- State ----------

  const STATE_KEY = PREFIX + ".state";
  const STATS_KEY = PREFIX + ".stats";

  let guesses = [];          // submitted guesses (strings)
  let current = "";          // letters typed in the active row
  let status = "playing";    // playing | won | lost
  let animating = false;

  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY));
      if (s && s.id === GAME_ID && Array.isArray(s.guesses)) {
        guesses = s.guesses.filter(isValidAnswerWord).slice(0, ROWS);
        status = s.status === "won" || s.status === "lost" ? s.status : "playing";
        if (status === "playing" && guesses.includes(ANSWER)) status = "won";
        if (status === "playing" && guesses.length >= ROWS) status = "lost";
      }
    } catch (e) { /* corrupted state — start fresh */ }
  }

  function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify({ id: GAME_ID, guesses, status }));
  }

  function loadStats() {
    try {
      const s = JSON.parse(localStorage.getItem(STATS_KEY));
      if (s && typeof s === "object") {
        return Object.assign(defaultStats(), s, { dist: Object.assign(defaultStats().dist, s.dist) });
      }
    } catch (e) { /* corrupted stats — start fresh */ }
    return defaultStats();
  }

  function defaultStats() {
    return { played: 0, won: 0, streak: 0, maxStreak: 0, lastWonId: null, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } };
  }

  function recordResult(won, numGuesses) {
    if (MODE !== "daily") return; // challenge links don't affect daily stats
    const stats = loadStats();
    stats.played++;
    if (won) {
      stats.won++;
      stats.dist[numGuesses] = (stats.dist[numGuesses] || 0) + 1;
      const yesterday = (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      })();
      stats.streak = stats.lastWonId === yesterday ? stats.streak + 1 : 1;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
      stats.lastWonId = GAME_ID;
    } else {
      stats.streak = 0;
    }
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  // ---------- Guess evaluation (handles duplicate letters) ----------

  function evaluate(guess) {
    const result = new Array(COLS).fill("absent");
    const remaining = {};
    for (let i = 0; i < COLS; i++) {
      if (guess[i] === ANSWER[i]) {
        result[i] = "correct";
      } else {
        remaining[ANSWER[i]] = (remaining[ANSWER[i]] || 0) + 1;
      }
    }
    for (let i = 0; i < COLS; i++) {
      if (result[i] !== "correct" && remaining[guess[i]] > 0) {
        result[i] = "present";
        remaining[guess[i]]--;
      }
    }
    return result;
  }

  // ---------- DOM: board ----------

  const board = document.getElementById("board");
  const tiles = [];

  function buildBoard() {
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement("div");
      row.className = "row";
      const rowTiles = [];
      for (let c = 0; c < COLS; c++) {
        const t = document.createElement("div");
        t.className = "tile";
        row.appendChild(t);
        rowTiles.push(t);
      }
      board.appendChild(row);
      tiles.push(rowTiles);
    }
  }

  function paintRow(r, guess, results, animate) {
    return new Promise((done) => {
      results.forEach((res, c) => {
        const tile = tiles[r][c];
        const apply = () => {
          tile.textContent = guess[c];
          tile.classList.add(res);
        };
        if (animate) {
          setTimeout(() => {
            tile.classList.add("flip");
            setTimeout(apply, 250);
            if (c === COLS - 1) setTimeout(done, 600);
          }, c * 300);
        } else {
          apply();
          if (c === COLS - 1) done();
        }
      });
    });
  }

  function paintCurrent() {
    const r = guesses.length;
    if (r >= ROWS) return;
    for (let c = 0; c < COLS; c++) {
      const tile = tiles[r][c];
      tile.textContent = current[c] || "";
      tile.classList.toggle("filled", Boolean(current[c]));
    }
  }

  // ---------- DOM: keyboard ----------

  const KEY_RANK = { absent: 0, present: 1, correct: 2 };
  const keyEls = {};

  function buildKeyboard() {
    const layout = [
      "qwertyuiop".split(""),
      "asdfghjkl".split(""),
      ["enter", ..."zxcvbnm".split(""), "back"],
    ];
    const kb = document.getElementById("keyboard");
    layout.forEach((rowKeys) => {
      const row = document.createElement("div");
      row.className = "kb-row";
      rowKeys.forEach((k) => {
        const btn = document.createElement("button");
        btn.className = "key" + (k.length > 1 ? " wide" : "");
        btn.textContent = k === "back" ? "⌫" : k;
        btn.dataset.key = k;
        // pointerdown (not click) so taps register instantly and never count
        // toward the browser's double-tap zoom gesture
        if (window.PointerEvent) {
          btn.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            handleKey(k);
          });
        } else {
          btn.addEventListener("click", () => handleKey(k));
        }
        row.appendChild(btn);
        if (k.length === 1) keyEls[k] = btn;
      });
      kb.appendChild(row);
    });
    // Block double-tap zoom on the keyboard for browsers that ignore
    // touch-action: manipulation (older iOS Safari). Keys act on
    // pointerdown, so suppressing the synthetic click loses nothing.
    let lastTouch = 0;
    kb.addEventListener("touchend", (e) => {
      const now = Date.now();
      if (now - lastTouch <= 350) e.preventDefault();
      lastTouch = now;
    }, { passive: false });
  }

  function colorKeys(guess, results) {
    results.forEach((res, i) => {
      const el = keyEls[guess[i]];
      const prev = ["correct", "present", "absent"].find((s) => el.classList.contains(s));
      if (!prev || KEY_RANK[res] > KEY_RANK[prev]) {
        if (prev) el.classList.remove(prev);
        el.classList.add(res);
      }
    });
  }

  // ---------- Toast ----------

  function toast(msg, sticky) {
    const container = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = "toast" + (sticky ? " sticky" : "");
    el.textContent = msg;
    container.prepend(el);
    if (!sticky) setTimeout(() => el.remove(), 1800);
  }

  // ---------- Input handling ----------

  function handleKey(k) {
    if (animating || status !== "playing") return;
    if (k === "enter") return submitGuess();
    if (k === "back") {
      current = current.slice(0, -1);
      paintCurrent();
      return;
    }
    if (/^[a-z]$/.test(k) && current.length < COLS) {
      current += k;
      paintCurrent();
    }
  }

  async function submitGuess() {
    const r = guesses.length;
    if (current.length < COLS) {
      tiles[r][0].parentElement.classList.add("shake");
      setTimeout(() => tiles[r][0].parentElement.classList.remove("shake"), 500);
      return toast("Not enough letters");
    }
    if (!VALID_WORDS.has(current) && current !== ANSWER) {
      tiles[r][0].parentElement.classList.add("shake");
      setTimeout(() => tiles[r][0].parentElement.classList.remove("shake"), 500);
      return toast("Not in word list");
    }

    const guess = current;
    const results = evaluate(guess);
    guesses.push(guess);
    current = "";
    animating = true;
    await paintRow(r, guess, results, true);
    colorKeys(guess, results);
    animating = false;

    if (guess === ANSWER) {
      status = "won";
      saveState();
      recordResult(true, guesses.length);
      tiles[r][0].parentElement.classList.add("bounce");
      toast(["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!"][r]);
      setTimeout(showStats, 1500);
    } else if (guesses.length >= ROWS) {
      status = "lost";
      saveState();
      recordResult(false, guesses.length);
      toast(ANSWER.toUpperCase(), true);
      setTimeout(showStats, 1500);
    } else {
      saveState();
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!document.getElementById("stats-modal").classList.contains("hidden")) return;
    if (!document.getElementById("help-modal").classList.contains("hidden")) return;
    const k = e.key.toLowerCase();
    if (k === "enter" || k === "backspace") {
      e.preventDefault();
      handleKey(k === "backspace" ? "back" : "enter");
    } else if (/^[a-z]$/.test(k)) {
      handleKey(k);
    }
  });

  // ---------- Stats & share ----------

  function showStats() {
    const stats = loadStats();
    document.getElementById("stat-played").textContent = stats.played;
    document.getElementById("stat-winpct").textContent = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
    document.getElementById("stat-streak").textContent = stats.streak;
    document.getElementById("stat-maxstreak").textContent = stats.maxStreak;

    const dist = document.getElementById("distribution");
    dist.innerHTML = "";
    const max = Math.max(1, ...Object.values(stats.dist));
    for (let i = 1; i <= ROWS; i++) {
      const n = stats.dist[i] || 0;
      const row = document.createElement("div");
      row.className = "dist-row";
      const won = status === "won" && guesses.length === i;
      row.innerHTML = `<span>${i}</span><div class="dist-bar${won ? " highlight" : ""}" style="width:${Math.max(7, (n / max) * 100)}%">${n}</div>`;
      dist.appendChild(row);
    }

    document.getElementById("share-btn").classList.toggle("hidden", status === "playing");
    document.getElementById("stats-modal").classList.remove("hidden");
  }

  function shareText() {
    const header = MODE === "challenge"
      ? `${TITLE} (challenge) ${status === "won" ? guesses.length : "X"}/6`
      : `${TITLE} ${GAME_ID} ${status === "won" ? guesses.length : "X"}/6`;
    const grid = guesses
      .map((g) => evaluate(g).map((r) => (r === "correct" ? "🟩" : r === "present" ? "🟨" : "⬛")).join(""))
      .join("\n");
    return `${header}\n\n${grid}`;
  }

  document.getElementById("share-btn").addEventListener("click", () => {
    const text = shareText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast("Copied to clipboard"),
        () => toast("Couldn't copy")
      );
    } else {
      toast("Clipboard unavailable");
    }
  });

  // ---------- Modals ----------

  document.getElementById("help-btn").addEventListener("click", () =>
    document.getElementById("help-modal").classList.remove("hidden"));
  document.getElementById("stats-btn").addEventListener("click", showStats);
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.hasAttribute("data-close")) overlay.classList.add("hidden");
    });
  });

  // ---------- Init ----------

  buildBoard();
  buildKeyboard();
  loadState();
  guesses.forEach((g, r) => {
    const results = evaluate(g);
    paintRow(r, g, results, false);
    colorKeys(g, results);
  });
  if (status === "lost") toast(ANSWER.toUpperCase(), true);
  if (MODE === "challenge") toast("Custom challenge!", false);
  if (!localStorage.getItem(STATE_KEY) && !guesses.length && MODE === "daily") {
    document.getElementById("help-modal").classList.remove("hidden");
  }
})();
