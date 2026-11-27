/**
 * YRD WEEKEND PULSE｜江浙沪周末活动雷达
 * Awwwards SOTD Interactive Editorial Engine
 */

(function () {
  "use strict";

  const PASSPORT_STORAGE_KEY = "yrd_weekend_passport_v2";
  const THEME_STORAGE_KEY = "yrd_editorial_theme_v2";

  const state = {
    snapshot: null,
    selectedCity: "ALL",
    selectedModule: "ALL",
    selectedStatus: "ALL",
    searchQuery: "",
    viewMode: "grid",
    passportIds: new Set(),
    soundEnabled: false,
    audioCtx: null,
  };

  /* ========================================================================
     1. TACTILE WEB AUDIO MICRO-SOUNDS (OPTIONAL AWWWARDS INTERACTION)
     ======================================================================== */
  function playMicroClick(freq = 540, duration = 0.025) {
    if (!state.soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!state.audioCtx) state.audioCtx = new AudioContext();
      const ctx = state.audioCtx;
      if (ctx.state === "suspended") ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (_) {
      // Ignore audio errors
    }
  }

  /* ========================================================================
     2. INITIALIZATION & DATA LOADING
     ======================================================================== */
  function getBeijingWeekendMeta() {
    // Compute current Beijing (UTC+8) date and active/upcoming Friday–Sunday window in browser
    const nowUtcMs = Date.now() + new Date().getTimezoneOffset() * 60000;
    const cst = new Date(nowUtcMs + 8 * 3600 * 1000);
    const today = new Date(Date.UTC(cst.getFullYear(), cst.getMonth(), cst.getDate()));
    const jsDay = today.getUTCDay(); // 0=Sun, 1=Mon ... 5=Fri, 6=Sat
    const pyWeekday = (jsDay + 6) % 7; // 0=Mon ... 4=Fri, 5=Sat, 6=Sun
    const daysToFri = 4 - pyWeekday;

    const fri = new Date(today.getTime() + daysToFri * 86400000);
    const sun = new Date(fri.getTime() + 2 * 86400000);

    const fmtIso = (d) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate()
      ).padStart(2, "0")}`;
    const fmtDot = (d) =>
      `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(
        d.getUTCDate()
      ).padStart(2, "0")}`;
    const fmtShort = (d) =>
      `${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;

    // ISO week number of Sunday
    const tmp = new Date(Date.UTC(sun.getUTCFullYear(), sun.getUTCMonth(), sun.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);

    const windowLabel =
      fri.getUTCMonth() === sun.getUTCMonth()
        ? `${fmtDot(fri)} (周五) — ${fmtShort(sun)} (周日) 及近期跨周档期`
        : `${fmtDot(fri)} (周五) — ${fmtDot(sun)} (周日) 及跨月档期`;

    return {
      todayIso: fmtIso(today),
      friIso: fmtIso(fri),
      sunIso: fmtIso(sun),
      yearMonthLabel: `${fri.getUTCFullYear()}年${fri.getUTCMonth() + 1}月`,
      monthShort: `${fri.getUTCMonth() + 1}月`,
      edition: `ISSUE ${tmp.getUTCFullYear()}.${String(weekNo).padStart(
        2,
        "0"
      )} · SUZHOU 1.5H HSR ISOCHRONE`,
      windowLabel,
    };
  }

  function applyClientLiveDateGuard(snap) {
    if (!snap || !Array.isArray(snap.events)) return snap;
    const wmeta = getBeijingWeekendMeta();
    snap.edition = wmeta.edition;
    snap.window_label = wmeta.windowLabel;

    const liveEvents = [];
    const cityCounts = {};
    const modCounts = {};
    let activeWeekendCount = 0;
    let freeCount = 0;

    for (const ev of snap.events) {
      const sIso = String(ev.start_date || "").trim().slice(0, 10);
      const eIso = String(ev.end_date || sIso).trim().slice(0, 10);
      // Automatically drop any event that ended before today (Beijing time)
      if (eIso.length === 10 && eIso < wmeta.todayIso) {
        continue;
      }
      if (sIso.length === 10 && eIso.length === 10) {
        ev.weekend_status =
          sIso <= wmeta.sunIso && eIso >= wmeta.todayIso ? "本周末进行中" : "即将开场";
      }
      liveEvents.push(ev);
      cityCounts[ev.city] = (cityCounts[ev.city] || 0) + 1;
      modCounts[ev.module_code] = (modCounts[ev.module_code] || 0) + 1;
      if (String(ev.weekend_status || "").includes("本周末")) activeWeekendCount++;
      if (String(ev.is_free || "").includes("免费") || String(ev.price || "").includes("免费")) {
        freeCount++;
      }
    }

    liveEvents.sort((a, b) => {
      const aWk = String(a.weekend_status || "").includes("本周末") ? 0 : 1;
      const bWk = String(b.weekend_status || "").includes("本周末") ? 0 : 1;
      if (aWk !== bWk) return aWk - bWk;
      return (b.heat_score || 0) - (a.heat_score || 0);
    });

    snap.events = liveEvents;
    if (Array.isArray(snap.cities)) {
      snap.cities.forEach((c) => {
        c.count = cityCounts[c.city] || 0;
      });
    }
    if (Array.isArray(snap.modules)) {
      snap.modules.forEach((m) => {
        m.count = modCounts[m.code] || 0;
      });
    }
    snap.stats = Object.assign({}, snap.stats || {}, {
      total_events: liveEvents.length,
      active_weekend_events: activeWeekendCount,
      free_events: freeCount,
    });
    return snap;
  }

  async function loadSnapshotData() {
    if (window.__YRD_PRELOADED_SNAPSHOT__) {
      return applyClientLiveDateGuard(window.__YRD_PRELOADED_SNAPSHOT__);
    }
    const cacheBust = Math.floor(Date.now() / 60000);
    const candidates = [
      `./data/dashboard_snapshot.json?v=${cacheBust}`,
      `../data/dashboard_snapshot.json?v=${cacheBust}`,
      `data/dashboard_snapshot.json?v=${cacheBust}`,
    ];
    for (const url of candidates) {
      try {
        const resp = await fetch(url, { cache: "no-store" });
        if (resp.ok) {
          const raw = await resp.json();
          return applyClientLiveDateGuard(raw);
        }
      } catch (_) {
        // try next
      }
    }
    throw new Error("Unable to load dashboard_snapshot.json");
  }

  function loadPersistedState() {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === "light" || savedTheme === "dark") {
        document.documentElement.setAttribute("data-theme", savedTheme);
        updateThemeLabel(savedTheme);
      }
      const savedPassport = JSON.parse(localStorage.getItem(PASSPORT_STORAGE_KEY) || "[]");
      if (Array.isArray(savedPassport)) {
        state.passportIds = new Set(savedPassport);
      }
    } catch (_) {}
  }

  function savePassportState() {
    try {
      localStorage.setItem(PASSPORT_STORAGE_KEY, JSON.stringify(Array.from(state.passportIds)));
    } catch (_) {}
    updatePassportBadge();
  }

  function updateThemeLabel(theme) {
    const el = document.getElementById("themeStateLabel");
    if (el) {
      el.textContent = theme === "light" ? "[宣纸白]" : "[曜石黑]";
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ========================================================================
     3. HERO & TELEMETRY RENDERING
     ======================================================================== */
  function renderHeroAndTelemetry() {
    const snap = state.snapshot;
    if (!snap) return;
    const stats = snap.stats || {};

    const editionEl = document.getElementById("telemetryEditionTag");
    if (editionEl && snap.edition) {
      editionEl.textContent = `[${snap.edition}]`;
    }
    const syncText = document.getElementById("telemetrySyncText");
    if (syncText) {
      syncText.textContent = `SYNCED ${snap.updated_at || ""} · 6H ACTIONS CRON`;
    }
    const winLabel = document.getElementById("heroWindowLabel");
    if (winLabel && snap.window_label) {
      winLabel.textContent = snap.window_label;
    }
    const totalMeta = document.getElementById("heroBtnTotalMeta");
    if (totalMeta) {
      totalMeta.textContent = `${stats.total_events || 0} EVENTS`;
    }

    const setNum = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    setNum("statTotalEvents", stats.total_events || 0);
    setNum("statWeekendActive", stats.active_weekend_events || 0);
    setNum("statFreeEvents", stats.free_events || 0);
    setNum("statTotalVenues", stats.total_venues || 20);

    const footerUpdated = document.getElementById("footerUpdatedAt");
    if (footerUpdated) {
      footerUpdated.textContent = snap.updated_at || "";
    }
  }

  /* ========================================================================
     4. [01 / 05] INTERACTIVE 6-CITY 1.5H HSR ISOCHRONE STAR MAP
     ======================================================================== */
  function renderIsochroneStarMap() {
    const svg = document.getElementById("hsrStarMapSvg");
    const panel = document.getElementById("cityDossierPanel");
    if (!svg || !panel || !state.snapshot) return;

    const cities = state.snapshot.cities || [];
    const hub = cities.find((c) => c.city === "苏州") || {
      city: "苏州",
      svg_x: 420,
      svg_y: 230,
    };

    const rings = [
      { r: 95, label: "30 MIN HSR ISOCHRONE" },
      { r: 195, label: "45 MIN HSR ISOCHRONE" },
      { r: 295, label: "90 MIN HSR ISOCHRONE" },
    ];

    let svgMarkup = `
      <defs>
        <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#e63946" stop-opacity="0.32" />
          <stop offset="100%" stop-color="#e63946" stop-opacity="0" />
        </radialGradient>
      </defs>
      <!-- Isochrone Grid Crosshairs -->
      <line x1="0" y1="${hub.svg_y}" x2="720" y2="${hub.svg_y}" stroke="currentColor" stroke-opacity="0.08" stroke-dasharray="3 3" />
      <line x1="${hub.svg_x}" y1="0" x2="${hub.svg_x}" y2="450" stroke="currentColor" stroke-opacity="0.08" stroke-dasharray="3 3" />
      <circle cx="${hub.svg_x}" cy="${hub.svg_y}" r="145" fill="url(#hubGlow)" />
    `;

    // Concentric Isochrone Rings
    rings.forEach((ring) => {
      svgMarkup += `
        <circle
          cx="${hub.svg_x}"
          cy="${hub.svg_y}"
          r="${ring.r}"
          fill="none"
          stroke="currentColor"
          stroke-opacity="0.16"
          stroke-dasharray="4 4"
        />
        <text
          x="${hub.svg_x + 6}"
          y="${hub.svg_y - ring.r + 14}"
          fill="currentColor"
          fill-opacity="0.42"
          font-family="JetBrains Mono, monospace"
          font-size="9"
          letter-spacing="1"
        >${ring.label}</text>
      `;
    });

    // HSR Connection Vectors from Suzhou Hub
    cities.forEach((c) => {
      if (c.city === "苏州") return;
      const isSelected = state.selectedCity === c.city;
      const strokeColor = isSelected ? "#e63946" : "currentColor";
      const strokeOpacity = isSelected ? "0.9" : "0.26";
      const strokeWidth = isSelected ? "2.4" : "1.2";
      const midX = (hub.svg_x + c.svg_x) / 2;
      const midY = (hub.svg_y + c.svg_y) / 2 - 8;

      svgMarkup += `
        <line
          x1="${hub.svg_x}"
          y1="${hub.svg_y}"
          x2="${c.svg_x}"
          y2="${c.svg_y}"
          stroke="${strokeColor}"
          stroke-opacity="${strokeOpacity}"
          stroke-width="${strokeWidth}"
        />
        <text
          x="${midX}"
          y="${midY}"
          fill="${isSelected ? "#e63946" : "#d4a373"}"
          font-family="JetBrains Mono, monospace"
          font-size="10"
          text-anchor="middle"
        >🚄 ${c.hsr_minutes}m</text>
      `;
    });

    // City Nodes
    cities.forEach((c) => {
      const isActive =
        state.selectedCity === c.city || (state.selectedCity === "ALL" && c.city === "苏州");
      const dotColor =
        c.city === "苏州"
          ? "#e63946"
          : c.ring === 1
          ? "#2a9d8f"
          : c.ring === 2
          ? "#d4a373"
          : "#a8a49c";

      svgMarkup += `
        <g class="city-node-group" data-city="${escapeHtml(c.city)}">
          <circle
            class="city-outer-ring"
            cx="${c.svg_x}"
            cy="${c.svg_y}"
            r="${isActive ? 25 : 19}"
            fill="none"
            stroke="${isActive ? "#e63946" : dotColor}"
            stroke-width="${isActive ? 2 : 1.2}"
            stroke-opacity="${isActive ? 0.95 : 0.45}"
          />
          <circle
            cx="${c.svg_x}"
            cy="${c.svg_y}"
            r="${c.city === "苏州" ? 9 : 7}"
            fill="${dotColor}"
          />
          <text
            x="${c.svg_x}"
            y="${c.svg_y - 28}"
            text-anchor="middle"
            fill="currentColor"
            font-family="Noto Serif SC, serif"
            font-weight="700"
            font-size="14"
          >${escapeHtml(c.city)} (${c.count})</text>
          <text
            x="${c.svg_x}"
            y="${c.svg_y + 35}"
            text-anchor="middle"
            fill="currentColor"
            fill-opacity="0.65"
            font-family="JetBrains Mono, monospace"
            font-size="10"
          >${escapeHtml(c.code)} · ${c.hsr_minutes === 0 ? "BASE" : c.hsr_minutes + " MIN"}</text>
        </g>
      `;
    });

    svg.innerHTML = svgMarkup;

    // Bind Click Events on SVG City Nodes
    svg.querySelectorAll(".city-node-group").forEach((node) => {
      node.addEventListener("click", () => {
        const city = node.getAttribute("data-city");
        playMicroClick(620);
        setSelectedCity(city === state.selectedCity ? "ALL" : city);
      });
    });

    // Render Right-side City Dossier Panel
    const focusedCityObj =
      cities.find((c) => c.city === state.selectedCity) ||
      cities.find((c) => c.city === "苏州") ||
      cities[0];

    const isAll = state.selectedCity === "ALL";
    panel.innerHTML = `
      <div>
        <div class="city-dossier-top">
          <div>
            <div class="city-dossier-en">${
              isAll
                ? "ALL 6 CITIES · YRD 1.5H HSR ISOCHRONE"
                : `${escapeHtml(focusedCityObj.en)} // ${escapeHtml(focusedCityObj.code)}`
            }</div>
            <h3 class="city-dossier-title">${
              isAll ? "长三角 6 城全局视图（以苏州为圆心）" : `${escapeHtml(focusedCityObj.city)} · 城市活动雷达`
            }</h3>
          </div>
          <div class="city-dossier-count">
            <div class="big-num">${isAll ? state.snapshot.stats.total_events : focusedCityObj.count}</div>
            <div class="mono-label">VERIFIED EVENTS</div>
          </div>
        </div>

        <div class="city-meta-grid" style="margin-top: 16px;">
          <div class="city-meta-item">
            <div class="item-label">SUZHOU HSR COMMUTE // 苏州出发高铁通勤</div>
            <div class="item-val">${escapeHtml(focusedCityObj.transit_summary)}</div>
          </div>
          <div class="city-meta-item">
            <div class="item-label">CORE CULTURAL &amp; COMMERCIAL HUBS // 核心商圈与文化地标</div>
            <div class="item-val">${escapeHtml(focusedCityObj.landmarks)}</div>
          </div>
        </div>
      </div>

      <div>
        <div class="mono-label" style="margin-bottom: 8px;">QUICK CITY SWITCHER // 点击切换城市期刊</div>
        <div class="city-mini-cards">
          ${cities
            .map(
              (c) => `
            <button
              type="button"
              class="city-mini-btn ${state.selectedCity === c.city ? "active" : ""}"
              data-city-btn="${escapeHtml(c.city)}"
            >
              <div class="c-name">
                <span>${escapeHtml(c.city)}</span>
                <span class="accent-cinnabar">${c.count}</span>
              </div>
              <div class="c-time">${c.hsr_minutes === 0 ? "大本营直达" : `🚄 高铁 ${c.hsr_minutes}m`}</div>
            </button>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    panel.querySelectorAll("[data-city-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const city = btn.getAttribute("data-city-btn");
        playMicroClick(620);
        setSelectedCity(city === state.selectedCity ? "ALL" : city);
      });
    });
  }

  /* ========================================================================
     5. [02 / 05] CURATOR'S AWWWARDS SPOTLIGHT
     ======================================================================== */
  function normalizeTitleKey(t) {
    return String(t || "")
      .replace(/【[^】]*】|\[[^\]]*\]/g, "")
      .replace(/[·\s\-—_《》【】()（）:：,，×x]/g, "")
      .toLowerCase();
  }

  function renderSpotlight() {
    const container = document.getElementById("spotlightGrid");
    if (!container || !state.snapshot) return;

    let pool = state.snapshot.events || [];
    if (state.selectedCity !== "ALL") {
      pool = pool.filter((e) => e.city === state.selectedCity);
    }

    // Prioritize events active THIS weekend first, then sort by heat_score DESC
    const sorted = [...pool].sort((a, b) => {
      const aWk = String(a.weekend_status || "").includes("本周末") ? 0 : 1;
      const bWk = String(b.weekend_status || "").includes("本周末") ? 0 : 1;
      if (aWk !== bWk) return aWk - bWk;
      return (b.heat_score || 0) - (a.heat_score || 0);
    });
    const seenTitles = new Set();
    const topEvents = [];

    // First pass: pick highest heat with unique normalized titles, diverse cities (max 2) AND diverse modules (max 2)
    const cityQuota = {};
    const modQuota = {};
    for (const ev of sorted) {
      const tKey = normalizeTitleKey(ev.title);
      if (!tKey || seenTitles.has(tKey)) continue;
      if (state.selectedCity === "ALL" && (cityQuota[ev.city] || 0) >= 2 && sorted.length > 12) {
        continue;
      }
      if ((modQuota[ev.module_code] || 0) >= 2 && sorted.length > 12) {
        continue;
      }
      seenTitles.add(tKey);
      cityQuota[ev.city] = (cityQuota[ev.city] || 0) + 1;
      modQuota[ev.module_code] = (modQuota[ev.module_code] || 0) + 1;
      topEvents.push(ev);
      if (topEvents.length >= 6) break;
    }

    // Fallback pass if < 6
    if (topEvents.length < 6) {
      for (const ev of sorted) {
        const tKey = normalizeTitleKey(ev.title);
        if (!tKey || seenTitles.has(tKey)) continue;
        seenTitles.add(tKey);
        topEvents.push(ev);
        if (topEvents.length >= 6) break;
      }
    }

    container.innerHTML = topEvents
      .map(
        (ev, idx) => `
      <article class="spotlight-card" data-open-event="${escapeHtml(ev.event_id)}">
        <div>
          <div class="spotlight-top-row">
            <span class="spotlight-rank">[SPOTLIGHT 0${idx + 1} // ${escapeHtml(ev.city)} · MODULE ${escapeHtml(ev.module_code)}]</span>
            <span class="heat-pill">${escapeHtml(ev.heat_label)}</span>
          </div>
          <h3 class="spotlight-title" style="margin: 12px 0 10px;">${escapeHtml(ev.title)}</h3>
          <p class="spotlight-desc">${escapeHtml(ev.highlights)}</p>
        </div>

        <div class="spotlight-footer">
          <span>📍 ${escapeHtml(ev.district || ev.city)} · ${escapeHtml((ev.venue || "").slice(0, 18))}</span>
          <span class="accent-gold">${escapeHtml(ev.price || "详见票务")}</span>
        </div>
      </article>
    `
      )
      .join("");

    container.querySelectorAll("[data-open-event]").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.getAttribute("data-open-event");
        playMicroClick(580);
        openEventDossierModal(id);
      });
    });
  }

  /* ========================================================================
     6. [03 / 05] FILTER MATRIX & DIRECTORY RENDERING
     ======================================================================== */
  function renderFilterPills() {
    const cityGroup = document.getElementById("cityFilterGroup");
    const modGroup = document.getElementById("moduleFilterGroup");
    if (!cityGroup || !modGroup || !state.snapshot) return;

    const total = state.snapshot.stats.total_events || 198;
    const cities = state.snapshot.cities || [];
    const modules = state.snapshot.modules || [];

    cityGroup.innerHTML =
      `<button type="button" class="filter-pill ${
        state.selectedCity === "ALL" ? "active" : ""
      }" data-filter-city="ALL">全部 6 城 <span class="pill-count">(${total})</span></button>` +
      cities
        .map(
          (c) => `
        <button type="button" class="filter-pill ${
          state.selectedCity === c.city ? "active" : ""
        }" data-filter-city="${escapeHtml(c.city)}">
          ${escapeHtml(c.city)}
          <span class="pill-count">(${c.count})</span>
        </button>
      `
        )
        .join("");

    cityGroup.querySelectorAll("[data-filter-city]").forEach((btn) => {
      btn.addEventListener("click", () => {
        playMicroClick(560);
        setSelectedCity(btn.getAttribute("data-filter-city"));
      });
    });

    modGroup.innerHTML =
      `<button type="button" class="filter-pill ${
        state.selectedModule === "ALL" ? "active" : ""
      }" data-filter-mod="ALL">ALL 全部十大模块 <span class="pill-count">(${total})</span></button>` +
      modules
        .map(
          (m) => `
        <button type="button" class="filter-pill ${
          state.selectedModule === m.code ? "active" : ""
        }" data-filter-mod="${escapeHtml(m.code)}">
          ${escapeHtml(m.code)} · ${escapeHtml(m.name)}
          <span class="pill-count">(${m.count})</span>
        </button>
      `
        )
        .join("");

    modGroup.querySelectorAll("[data-filter-mod]").forEach((btn) => {
      btn.addEventListener("click", () => {
        playMicroClick(560);
        state.selectedModule = btn.getAttribute("data-filter-mod");
        renderFilterPills();
        renderModuleStrategyBanner();
        renderEventsDirectory();
      });
    });
  }

  function renderModuleStrategyBanner() {
    const banner = document.getElementById("moduleStrategyBanner");
    if (!banner || !state.snapshot) return;

    if (state.selectedModule === "ALL") {
      banner.innerHTML = `
        <div>
          <span class="mono-label">CURATION STRATEGY // </span>
          <span>当前展示 <strong>Modules A–J 全场景活动库</strong>。点击上方任意模块可查看该分类的「最佳检索时间窗口」与「跨平台万能检索公式」。</span>
        </div>
        <span class="mono-badge">14-TAB CLOUD GSHEETS SYNCED</span>
      `;
      return;
    }

    const mod = (state.snapshot.modules || []).find((m) => m.code === state.selectedModule);
    if (!mod) return;

    banner.innerHTML = `
      <div>
        <strong class="accent-gold">[MODULE ${escapeHtml(mod.code)} · ${escapeHtml(mod.name)}]</strong>
        <span style="margin-left: 8px; color: var(--text-secondary);">${escapeHtml(mod.desc)}</span>
        <div style="margin-top: 4px; font-size: 0.78rem; color: var(--text-muted);">
          ⏱ <strong>最佳检索时机：</strong>${escapeHtml(mod.best_window)} ｜ 🔍 <strong>万能公式：</strong><code>${escapeHtml(mod.formula)}</code>
        </div>
      </div>
      <a href="#section-synthesizer" class="card-action-btn" data-jump-synth="${escapeHtml(mod.code)}">在检索合成器中打开 ↗</a>
    `;

    const jumpBtn = banner.querySelector("[data-jump-synth]");
    if (jumpBtn) {
      jumpBtn.addEventListener("click", () => {
        const sel = document.getElementById("synthModuleSelect");
        if (sel) {
          sel.value = mod.code;
          updateSynthesizerOutput();
        }
      });
    }
  }

  function getFilteredEvents() {
    if (!state.snapshot) return [];
    const q = state.searchQuery.trim().toLowerCase();

    return (state.snapshot.events || []).filter((ev) => {
      if (state.selectedCity !== "ALL" && ev.city !== state.selectedCity) return false;
      if (state.selectedModule !== "ALL" && ev.module_code !== state.selectedModule) return false;

      if (state.selectedStatus === "WEEKEND") {
        if (!String(ev.weekend_status || "").includes("本周末")) return false;
      } else if (state.selectedStatus === "FREE") {
        const freeFlag =
          String(ev.is_free || "").includes("免费") || String(ev.price || "").includes("免费");
        if (!freeFlag) return false;
      } else if (state.selectedStatus === "HOT95") {
        if ((ev.heat_score || 0) < 95) return false;
      }

      if (q) {
        const haystack = [
          ev.title,
          ev.city,
          ev.category_name,
          ev.district,
          ev.venue,
          ev.highlights,
          ev.price,
          (ev.tags || []).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  function renderEventsDirectory() {
    const gridEl = document.getElementById("eventsGridContainer");
    const tableWrapEl = document.getElementById("eventsTableContainer");
    const tableBodyEl = document.getElementById("eventsTableBody");
    const counterEl = document.getElementById("filterResultCounter");
    if (!gridEl || !tableWrapEl || !tableBodyEl || !state.snapshot) return;

    const filtered = getFilteredEvents();
    const total = (state.snapshot.events || []).length;
    if (counterEl) {
      counterEl.textContent = `SHOWING ${filtered.length} / ${total}`;
    }

    if (state.viewMode === "grid") {
      gridEl.classList.remove("hidden");
      tableWrapEl.classList.add("hidden");

      if (filtered.length === 0) {
        gridEl.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 48px; text-align: center; color: var(--text-secondary);">
            <p style="font-size: 1.05rem; margin-bottom: 12px;">当前筛选条件下暂无匹配活动</p>
            <button type="button" class="btn-editorial btn-secondary" id="emptyResetFiltersBtn">重置全部筛选条件</button>
          </div>
        `;
        const resetBtn = document.getElementById("emptyResetFiltersBtn");
        if (resetBtn) resetBtn.addEventListener("click", resetAllFilters);
        return;
      }

      gridEl.innerHTML = filtered
        .map((ev) => {
          const inPassport = state.passportIds.has(ev.event_id);
          const isFree =
            String(ev.is_free || "").includes("免费") || String(ev.price || "").includes("免费");

          return `
            <article class="event-card">
              <div>
                <div class="event-card-header">
                  <div class="event-badges-left">
                    <span class="badge-city">${escapeHtml(ev.city)}</span>
                    <span class="badge-module">${escapeHtml(ev.module_code)} · ${escapeHtml(ev.category_name)}</span>
                    ${isFree ? `<span class="badge-free">FREE / 免票</span>` : ""}
                  </div>
                  <span class="heat-pill">${escapeHtml(ev.heat_label)}</span>
                </div>

                <h3 class="event-card-title" style="margin: 12px 0 8px;" data-event-open="${escapeHtml(ev.event_id)}">
                  ${escapeHtml(ev.title)}
                </h3>

                <p class="event-card-highlights">${escapeHtml(ev.highlights)}</p>
              </div>

              <div>
                <div class="event-meta-list">
                  <div class="event-meta-row">
                    <span class="event-meta-key">TIME //</span>
                    <span>${escapeHtml(ev.time_display)}</span>
                  </div>
                  <div class="event-meta-row">
                    <span class="event-meta-key">VENUE //</span>
                    <span>${escapeHtml(ev.district)} · ${escapeHtml(ev.venue)}</span>
                  </div>
                  <div class="event-meta-row">
                    <span class="event-meta-key">PRICE //</span>
                    <strong class="accent-gold">${escapeHtml(ev.price)}</strong>
                  </div>
                  <div class="event-meta-row">
                    <span class="event-meta-key">HSR //</span>
                    <span>${escapeHtml(ev.suzhou_transit)}</span>
                  </div>
                </div>

                <div class="event-card-actions" style="margin-top: 12px;">
                  <div style="display: flex; gap: 6px;">
                    <button type="button" class="card-action-btn" data-event-open="${escapeHtml(ev.event_id)}">
                      详情档案
                    </button>
                    <button
                      type="button"
                      class="card-action-btn ${inPassport ? "in-passport" : ""}"
                      data-passport-toggle="${escapeHtml(ev.event_id)}"
                    >
                      ${inPassport ? "✓ 已在行程单" : "+ 加入行程单"}
                    </button>
                  </div>
                  ${
                    ev.url
                      ? `<a href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer" class="card-action-btn">官方直达 ↗</a>`
                      : ""
                  }
                </div>
              </div>
            </article>
          `;
        })
        .join("");
    } else {
      gridEl.classList.add("hidden");
      tableWrapEl.classList.remove("hidden");

      tableBodyEl.innerHTML = filtered
        .map((ev, idx) => {
          const inPassport = state.passportIds.has(ev.event_id);
          return `
            <tr>
              <td class="mono-label">${idx + 1}</td>
              <td><span class="badge-city">${escapeHtml(ev.city)}</span></td>
              <td><span class="badge-module">${escapeHtml(ev.module_code)} · ${escapeHtml(ev.category_name)}</span></td>
              <td>
                <strong style="cursor:pointer; color:var(--text-primary);" data-event-open="${escapeHtml(ev.event_id)}">
                  ${escapeHtml(ev.title)}
                </strong>
                <div style="font-size:0.76rem; color:var(--text-secondary); margin-top:4px;">
                  ${escapeHtml(ev.highlights)}
                </div>
              </td>
              <td>
                <span class="heat-pill">${escapeHtml(ev.heat_label)}</span>
                <div style="font-size:0.73rem; color:var(--accent-celadon); margin-top:4px;">${escapeHtml(ev.weekend_status)}</div>
              </td>
              <td>${escapeHtml(ev.time_display)}</td>
              <td><strong>${escapeHtml(ev.district)}</strong><br/>${escapeHtml(ev.venue)}</td>
              <td class="accent-gold">${escapeHtml(ev.price)}</td>
              <td style="font-size:0.76rem; color:var(--text-secondary);">${escapeHtml(ev.suzhou_transit)}</td>
              <td>
                <div style="display:flex; flex-direction:column; gap:5px;">
                  <button
                    type="button"
                    class="card-action-btn ${inPassport ? "in-passport" : ""}"
                    data-passport-toggle="${escapeHtml(ev.event_id)}"
                  >
                    ${inPassport ? "✓ 已收藏" : "+ 行程单"}
                  </button>
                  ${
                    ev.url
                      ? `<a href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer" class="card-action-btn">直达 ↗</a>`
                      : ""
                  }
                </div>
              </td>
            </tr>
          `;
        })
        .join("");
    }

    // Bind Open Modal & Passport Toggle
    document.querySelectorAll("[data-event-open]").forEach((el) => {
      el.addEventListener("click", () => {
        playMicroClick(580);
        openEventDossierModal(el.getAttribute("data-event-open"));
      });
    });

    document.querySelectorAll("[data-passport-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-passport-toggle");
        playMicroClick(700);
        togglePassportItem(id);
      });
    });
  }

  function setSelectedCity(city) {
    state.selectedCity = city;
    renderIsochroneStarMap();
    renderSpotlight();
    renderFilterPills();
    renderEventsDirectory();
  }

  function resetAllFilters() {
    state.selectedCity = "ALL";
    state.selectedModule = "ALL";
    state.selectedStatus = "ALL";
    state.searchQuery = "";
    const input = document.getElementById("eventSearchInput");
    if (input) input.value = "";
    document.querySelectorAll("#statusFilterGroup .status-pill").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-status") === "ALL");
    });
    renderIsochroneStarMap();
    renderSpotlight();
    renderFilterPills();
    renderModuleStrategyBanner();
    renderEventsDirectory();
  }

  /* ========================================================================
     7. EVENT DOSSIER MODAL
     ======================================================================== */
  function openEventDossierModal(eventId) {
    if (!state.snapshot) return;
    const ev = (state.snapshot.events || []).find((e) => e.event_id === eventId);
    if (!ev) return;

    const backdrop = document.getElementById("eventModalBackdrop");
    const tagsEl = document.getElementById("modalMetaTags");
    const bodyEl = document.getElementById("modalBodyContent");
    if (!backdrop || !tagsEl || !bodyEl) return;

    const inPassport = state.passportIds.has(ev.event_id);
    const searchKw = encodeURIComponent(`${ev.city} ${ev.title}`);

    tagsEl.innerHTML = `
      <span class="badge-city">${escapeHtml(ev.city)}</span>
      <span class="badge-module">MODULE ${escapeHtml(ev.module_code)} · ${escapeHtml(ev.category_name)}</span>
      <span class="heat-pill">${escapeHtml(ev.heat_label)}</span>
      <span class="mono-badge">${escapeHtml(ev.weekend_status)}</span>
    `;

    bodyEl.innerHTML = `
      <div>
        <h2 id="modalEventTitle" style="font-family:'Noto Serif SC',serif; font-size:1.55rem; line-height:1.35; margin-bottom:10px;">
          ${escapeHtml(ev.title)}
        </h2>
        <p style="font-size:0.95rem; color:var(--text-secondary); line-height:1.72;">
          ${escapeHtml(ev.highlights)}
        </p>
      </div>

      <div class="city-meta-grid" style="grid-template-columns: repeat(2, 1fr);">
        <div class="city-meta-item">
          <div class="item-label">TIME &amp; SCHEDULE // 活动时间与档期</div>
          <div class="item-val">${escapeHtml(ev.time_display)} (${escapeHtml(ev.start_date)} ~ ${escapeHtml(ev.end_date)})</div>
        </div>
        <div class="city-meta-item">
          <div class="item-label">TICKET &amp; ADMISSION // 票价与入场方式</div>
          <div class="item-val accent-gold"><strong>${escapeHtml(ev.price)}</strong> (${escapeHtml(ev.is_free)})</div>
        </div>
        <div class="city-meta-item">
          <div class="item-label">DISTRICT &amp; VENUE // 商圈与具体场馆</div>
          <div class="item-val">${escapeHtml(ev.district)} · ${escapeHtml(ev.venue)}</div>
        </div>
        <div class="city-meta-item">
          <div class="item-label">SUZHOU HSR &amp; METRO GUIDE // 苏州出发通勤指南</div>
          <div class="item-val">${escapeHtml(ev.suzhou_transit)}</div>
        </div>
      </div>

      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${(ev.tags || [])
          .map((t) => `<span class="mono-badge">#${escapeHtml(t)}</span>`)
          .join("")}
        <span class="mono-badge">信息源：${escapeHtml(ev.source)} (${escapeHtml(ev.verify_status)})</span>
      </div>

      <div style="padding-top:14px; border-top:1px solid var(--border-hairline); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button
            type="button"
            class="btn-editorial ${inPassport ? "btn-secondary" : "btn-primary"}"
            id="modalPassportToggleBtn"
          >
            ${inPassport ? "✓ 已在周末行程单（点击移除）" : "+ 加入我的周末行程单"}
          </button>
          ${
            ev.url
              ? `<a href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer" class="btn-editorial btn-outline">打开官方购票/详情页 ↗</a>`
              : ""
          }
        </div>

        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <a href="https://www.xiaohongshu.com/search_result?keyword=${searchKw}" target="_blank" rel="noopener noreferrer" class="card-action-btn">小红书实况 ↗</a>
          <a href="https://search.bilibili.com/all?keyword=${searchKw}" target="_blank" rel="noopener noreferrer" class="card-action-btn">B站Repo ↗</a>
          <a href="https://www.baidu.com/s?wd=${searchKw}" target="_blank" rel="noopener noreferrer" class="card-action-btn">百度检索 ↗</a>
        </div>
      </div>
    `;

    const modalPassportBtn = document.getElementById("modalPassportToggleBtn");
    if (modalPassportBtn) {
      modalPassportBtn.addEventListener("click", () => {
        playMicroClick(700);
        togglePassportItem(ev.event_id);
        openEventDossierModal(ev.event_id);
      });
    }

    backdrop.classList.remove("hidden");
  }

  /* ========================================================================
     8. [04 / 05] CROSS-PLATFORM SMART SEARCH MATRIX & BACKGROUND AI SUMMARIZER
     ======================================================================== */
  const CITY_LANDMARK_KEYWORDS = {
    苏州: "(仁恒仓街 OR 十全街 OR 诚品生活 OR 苏州中心 OR 本色美术馆 OR 山丘Livehouse)",
    上海: "(张园 OR 西岸美术馆 OR 安福路 OR 百联ZX OR 静安大悦城 OR 浦东美术馆)",
    无锡: "(南长街 OR 拈花湾 OR 惠山古镇 OR 无锡大剧院 OR 无锡奥体中心)",
    常州: "(太湖湾 OR 青果巷 OR 文化广场 OR 中华恐龙园 OR 棉仓)",
    杭州: "(天目里 OR 良渚大屋顶 OR 湖滨in77 OR 西湖 OR 大麦66Livehouse)",
    南京: "(德基广场 OR 1701Livehouse OR 南京博物院 OR 熙南里 OR 江苏大剧院)",
    ALL: "(苏州 OR 上海 OR 无锡 OR 常州 OR 杭州 OR 南京)",
  };

  function getModuleScenarioKeyword(modCode) {
    const wm = getBeijingWeekendMeta();
    const map = {
      A: `(一日店长 OR 明星空降 OR 演唱会 OR 品牌见面会) ${wm.yearMonthLabel}`,
      B: "(快闪 OR Pop-up OR 限时店 OR 打卡领礼) 本周末",
      C: "(美术馆特展 OR 新书沙龙 OR 原版音乐剧 OR 交响乐) 本周末",
      D: "(Livehouse巡演 OR 脱口秀开放麦 OR 摇滚现场) 本周末",
      E: `(咖啡节 OR 精酿啤酒节 OR 本色市集 OR 周末市集) ${wm.monthShort}`,
      F: `(漫展 OR 同人ONLY OR 谷子痛楼 OR 地下偶像) ${wm.monthShort}`,
      G: "(Citywalk OR 环湖骑行 OR 宠物友好派对 OR 市民夜校) 周末",
      H: "(园林夜游 OR 昆曲评弹 OR 无人机烟花秀 OR 红枫银杏) 本周末",
      I: `(会展排期 OR 文博会 OR 潮玩展 OR 宠物展) ${wm.monthShort}`,
      J: "(主厨限时晚宴 OR 亲子剧场 OR 马拉松 OR 博物馆奇妙夜) 周末",
      ALL: "(演唱会 OR 快闪 OR 特展 OR 市集 OR 漫展 OR 夜游) 本周末",
    };
    return map[modCode] || "本周末 活动";
  }

  const SYNONYM_EXPANSION_MAP = {
    一日店长: ["一日店长", "明星", "快闪", "代言", "空降", "见面会"],
    快闪: ["快闪", "pop-up", "限时", "主题", "打卡", "联名", "领礼"],
    免费: ["免费", "免票", "0元", "公益", "羊毛", "领礼"],
    羊毛: ["免费", "免票", "羊毛", "快闪", "半价", "票根"],
    演唱会: ["演唱会", "巡演", "奥体", "体育中心", "音乐节"],
    音乐剧: ["音乐剧", "剧院魅影", "歌剧", "舞剧", "话剧", "戏剧", "大剧院"],
    展览: ["展览", "特展", "美术馆", "艺术", "博物院", "博物馆", "双年展"],
    市集: ["市集", "本色", "咖啡", "精酿", "面包", "微醺", "雅集"],
    漫展: ["漫展", "同人", "only", "二次元", "主题餐厅", "谷子", "痛楼", "acgn"],
    夜游: ["夜游", "红枫", "园林", "拙政", "网师园", "拈花湾", "昆曲", "评弹", "无人机"],
    脱口秀: ["脱口秀", "喜剧", "开放麦", "漫才", "即兴", "livehouse"],
  };

  function expandQueryTokens(rawInput) {
    const wm = getBeijingWeekendMeta();
    const cleaned = String(rawInput || "")
      .replace(/[()（）+]/g, " ")
      .replace(/\bOR\b|\bAND\b|site:\S+/gi, " ")
      .trim();
    if (!cleaned) return [];
    const baseTokens = cleaned
      .split(/[\s,，、/]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(
        (t) =>
          t.length >= 2 &&
          !["城市名", "本周末", "周末", wm.monthShort, wm.yearMonthLabel].includes(t)
      );

    const expanded = new Set(baseTokens);
    baseTokens.forEach((tok) => {
      Object.entries(SYNONYM_EXPANSION_MAP).forEach(([k, syns]) => {
        if (tok.includes(k) || k.includes(tok)) {
          syns.forEach((s) => expanded.add(s.toLowerCase()));
        }
      });
    });
    return Array.from(expanded);
  }

  function updateSynthesizerOutput(triggerBgSummary = true) {
    const citySel = document.getElementById("synthCitySelect");
    const modSel = document.getElementById("synthModuleSelect");
    const customIn = document.getElementById("synthCustomInput");
    const queryEl = document.getElementById("synthQueryDisplay");
    const tipEl = document.getElementById("synthTimingTip");
    const launchGrid = document.getElementById("platformLaunchGrid");
    if (!citySel || !modSel || !queryEl || !launchGrid) return;

    const wm = getBeijingWeekendMeta();
    const city = citySel.value || "苏州";
    const modCode = modSel.value || "A";
    const custom = (customIn ? customIn.value : "").trim();

    const cityDisplay = city === "ALL" ? "江浙沪6城" : city;
    const landmarkPart = CITY_LANDMARK_KEYWORDS[city] || cityDisplay;
    const scenarioPart = getModuleScenarioKeyword(modCode);
    const synthesized = custom
      ? `${city === "ALL" ? "(苏州 OR 上海 OR 无锡 OR 杭州 OR 南京 OR 常州)" : city} ${custom} ${scenarioPart}`
      : `${city === "ALL" ? "" : city + " "}${landmarkPart} ${scenarioPart}`.trim();

    queryEl.textContent = synthesized;

    const modObj = ((state.snapshot && state.snapshot.modules) || []).find(
      (m) => m.code === modCode
    );
    if (tipEl) {
      tipEl.textContent = modObj
        ? `⏱ 最佳检索时间窗口：${modObj.best_window}`
        : `⏱ 最佳检索时间窗口：每周四晚/周五上午检索当周末全城最新官宣快闪、市集与演出余票`;
    }

    const enc = encodeURIComponent(synthesized);
    const simpleKw = `${city === "ALL" ? "江浙沪" : city} ${
      custom || (modObj ? modObj.name : "周末活动")
    } ${wm.monthShort}`;
    const simpleEnc = encodeURIComponent(simpleKw);

    const platforms = [
      {
        name: "小红书 (按最新)",
        url: `https://www.xiaohongshu.com/search_result?keyword=${simpleEnc}`,
      },
      {
        name: "B站会员购 / 漫展",
        url: `https://search.bilibili.com/all?keyword=${simpleEnc}`,
      },
      {
        name: "微博同城实时",
        url: `https://s.weibo.com/weibo?q=${simpleEnc}`,
      },
      {
        name: "豆瓣同城活动",
        url: `https://www.douban.com/search?q=${simpleEnc}`,
      },
      {
        name: "大麦网票务",
        url: `https://search.damai.cn/search.htm?keyword=${encodeURIComponent(
          (city === "ALL" ? "上海 苏州" : city) + " " + custom
        )}`,
      },
      {
        name: "秀动 ShowStart",
        url: `https://www.showstart.com/event/list?keyword=${encodeURIComponent(
          city === "ALL" ? "上海" : city
        )}`,
      },
      {
        name: "百度布尔检索",
        url: `https://www.baidu.com/s?wd=${enc}`,
      },
      {
        name: "Google 深度检索",
        url: `https://www.google.com/search?q=${enc}`,
      },
    ];

    launchGrid.innerHTML = platforms
      .map(
        (p) => `
      <a href="${p.url}" target="_blank" rel="noopener noreferrer" class="platform-launch-btn">
        <span>${escapeHtml(p.name)}</span>
        <span>↗</span>
      </a>
    `
      )
      .join("");

    if (triggerBgSummary && state.snapshot) {
      runBackgroundSearchAndSummarize({ withLiveWeb: false, scrollIntoView: false });
    }
  }

  /* ------------------------------------------------------------------------
     BACKGROUND MULTI-SOURCE SEARCH & INTELLIGENCE SUMMARIZER
     ------------------------------------------------------------------------ */
  function scoreEventsForSynthesizer(city, modCode, customKw) {
    const allEvents = (state.snapshot && state.snapshot.events) || [];
    const tokens = expandQueryTokens(customKw);

    const scored = [];
    for (const ev of allEvents) {
      // Hard city filter if specific city selected
      if (city !== "ALL" && ev.city !== city) continue;

      let score = 0;
      const isExactMod = modCode === "ALL" || ev.module_code === modCode;
      if (isExactMod) {
        score += 45;
      } else if (!tokens.length) {
        // When no custom keyword is typed, keep strictly within the selected module
        continue;
      }

      const hayTitle = String(ev.title || "").toLowerCase();
      const hayVenue = `${ev.district || ""} ${ev.venue || ""}`.toLowerCase();
      const hayHigh = String(ev.highlights || "").toLowerCase();
      const hayTags = (ev.tags || []).join(" ").toLowerCase();
      const hayPrice = `${ev.price || ""} ${ev.is_free || ""}`.toLowerCase();
      const fullHay = `${hayTitle} ${hayVenue} ${hayHigh} ${hayTags} ${hayPrice} ${ev.category_name || ""}`.toLowerCase();

      let tokenHits = 0;
      if (tokens.length > 0) {
        for (const tok of tokens) {
          if (hayTitle.includes(tok)) {
            score += 32;
            tokenHits++;
          } else if (hayVenue.includes(tok) || hayTags.includes(tok)) {
            score += 24;
            tokenHits++;
          } else if (hayHigh.includes(tok) || hayPrice.includes(tok)) {
            score += 15;
            tokenHits++;
          }
        }
        if (tokenHits === 0) continue;
      }

      if (String(ev.weekend_status || "").includes("本周末")) score += 12;
      if (String(ev.is_free || "").includes("免费") || String(ev.price || "").includes("免费")) {
        if (customKw.includes("免费") || customKw.includes("羊毛")) score += 25;
      }
      score += (ev.heat_score || 88) * 0.25;

      scored.push({ ev, score, tokenHits });
    }

    scored.sort((a, b) => b.score - a.score || (b.ev.heat_score || 0) - (a.ev.heat_score || 0));

    // If strict city+module+keyword yielded 0, fallback to same city + module so summary is never empty
    let fallbackUsed = false;
    if (scored.length === 0) {
      fallbackUsed = true;
      for (const ev of allEvents) {
        if (city !== "ALL" && ev.city !== city) continue;
        if (modCode !== "ALL" && ev.module_code !== modCode) continue;
        scored.push({ ev, score: ev.heat_score || 88, tokenHits: 0 });
      }
      scored.sort((a, b) => b.score - a.score);
    }

    return {
      matchedEvents: scored.map((s) => s.ev),
      fallbackUsed,
      tokens,
    };
  }

  async function probeLivePublicCrossPlatformHints(city, modName, customKw) {
    const queryTerm = `${city === "ALL" ? "上海 苏州" : city} ${customKw || modName}`.trim();
    const results = [];

    // 1. Native CORS-supported Chinese Wikipedia / Cultural Landmark Context Probe
    try {
      const wikiUrl = `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        queryTerm
      )}&utf8=1&format=json&origin=*&srlimit=3`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3200);
      const resp = await fetch(wikiUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const data = await resp.json();
        const items = (data.query && data.query.search) || [];
        items.forEach((it) => {
          const cleanSnippet = String(it.snippet || "").replace(/<\/?[^>]+(>|$)/g, "");
          if (cleanSnippet) {
            results.push({
              source: "维基百科 / 城市文化地标实时库",
              title: it.title,
              snippet: cleanSnippet,
              url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(it.title)}`,
            });
          }
        });
      }
    } catch (_) {}

    // 2. Curated Multi-Platform Live Verification Channels for the selected City & Module
    const wm = getBeijingWeekendMeta();
    const enc = encodeURIComponent(
      `${city === "ALL" ? "江浙沪" : city} ${customKw || modName} ${wm.yearMonthLabel}`
    );
    results.push(
      {
        source: "小红书同城实时流",
        title: `${city === "ALL" ? "江浙沪6城" : city} · 「${customKw || modName}」近48小时最新打卡实况与避坑Repo`,
        snippet: `重点筛查【最新】排序下带现场实拍图的笔记，核实快闪排队时长、周边领礼库存与当日余票。`,
        url: `https://www.xiaohongshu.com/search_result?keyword=${enc}`,
      },
      {
        source: "B站会员购 / 大麦票务实时状态",
        title: `${city === "ALL" ? "长三角6城" : city} · 「${customKw || modName}」当周开票与余票监控`,
        snippet: `演出开场前24-48小时常有回流票释放；漫展与主题咖啡厅需提前在会员购或官方小程序锁定预约时段。`,
        url: `https://search.bilibili.com/all?keyword=${enc}`,
      }
    );

    return results;
  }

  async function runBackgroundSearchAndSummarize(options = {}) {
    const { withLiveWeb = false, scrollIntoView = false } = options;
    if (!state.snapshot) return;

    const citySel = document.getElementById("synthCitySelect");
    const modSel = document.getElementById("synthModuleSelect");
    const customIn = document.getElementById("synthCustomInput");
    const statusEl = document.getElementById("synthBgPipelineStatus");
    const headingEl = document.getElementById("bgSummaryHeading");
    const contentEl = document.getElementById("synthBgSummaryContent");
    if (!citySel || !modSel || !contentEl) return;

    const city = citySel.value || "苏州";
    const modCode = modSel.value || "A";
    const customKw = (customIn ? customIn.value : "").trim();

    const cityLabel = city === "ALL" ? "江浙沪 6 城全局" : city;
    const modObj = (state.snapshot.modules || []).find((m) => m.code === modCode);
    const modLabel = modObj ? `Module ${modObj.code} · ${modObj.name}` : "Modules A–J 全场景";

    if (statusEl) {
      statusEl.textContent = withLiveWeb
        ? "⚡ 正在后台并发检索云端库 + 实时跨平台公开源..."
        : "⚡ 正在后台聚合多源情报并生成总结...";
    }

    const { matchedEvents, fallbackUsed } = scoreEventsForSynthesizer(city, modCode, customKw);
    const weekendActive = matchedEvents.filter((e) =>
      String(e.weekend_status || "").includes("本周末")
    );
    const freeEvents = matchedEvents.filter(
      (e) => String(e.is_free || "").includes("免费") || String(e.price || "").includes("免费")
    );
    const topPicks = matchedEvents.slice(0, 6);

    // Compute price range & peak heat
    const peakHeat = matchedEvents.length
      ? Math.max(...matchedEvents.map((e) => e.heat_score || 88))
      : 95;
    const numericPrices = matchedEvents
      .map((e) => parseEstimatedPrice(e.price))
      .filter((p) => p > 0);
    const minPaid = numericPrices.length ? Math.min(...numericPrices) : 0;
    const maxPaid = numericPrices.length ? Math.max(...numericPrices) : 0;
    const priceRangeText =
      freeEvents.length > 0 && maxPaid > 0
        ? `¥0 (免费) ~ ¥${maxPaid}`
        : freeEvents.length > 0
        ? "免费入场 / 扫码预约"
        : minPaid > 0
        ? `¥${minPaid} ~ ¥${maxPaid} 起`
        : "详见各场馆官方票务";

    // Match Treasure Venues for this City & Module
    const allVenues = state.snapshot.venues || [];
    let matchedVenues = allVenues.filter((v) => {
      const cOk = city === "ALL" || v.city === city;
      const mOk = modCode === "ALL" || String(v.frequent_modules || "").includes(modCode);
      return cOk && mOk;
    });
    if (matchedVenues.length === 0) {
      matchedVenues = allVenues.filter((v) => city === "ALL" || v.city === city).slice(0, 4);
    } else {
      matchedVenues = matchedVenues.slice(0, 4);
    }

    // Match City Info for HSR guidance
    const cityMeta = (state.snapshot.cities || []).find((c) => c.city === city);
    const hsrAdvice = cityMeta
      ? `${cityMeta.transit_summary}（核心地标：${cityMeta.landmarks}）`
      : "以苏州站/苏州园区站为圆心：无锡 18m、上海 25m、常州 40m、南京 75m、杭州 85m 高铁直达";

    // Group active districts
    const districtSet = Array.from(
      new Set(topPicks.map((e) => e.district || e.city).filter(Boolean))
    ).slice(0, 4);

    // Optional live web probe
    let liveWebItems = [];
    if (withLiveWeb) {
      liveWebItems = await probeLivePublicCrossPlatformHints(
        city,
        modObj ? modObj.name : "周末活动",
        customKw
      );
    }

    if (headingEl) {
      headingEl.textContent = `《${cityLabel} · ${modLabel}${
        customKw ? ` · “${customKw}”` : ""
      }》后台检索智能总结报告`;
    }
    if (statusEl) {
      statusEl.textContent = `✓ 已完成多源聚合（命中 ${matchedEvents.length} 场核实活动 / ${matchedVenues.length} 大宝藏地标）`;
    }

    // Build Executive Summary Paragraph
    const topTitlesPreview = topPicks
      .slice(0, 3)
      .map((e) => `《${e.title}》`)
      .join("、");

    const execLeadHtml = fallbackUsed
      ? `后台未在当前在库主表中找到与自定义词 <strong>“${escapeHtml(
          customKw
        )}”</strong> 完全字面匹配的条目，已自动为您智能回退并总结 <strong>【${escapeHtml(
          cityLabel
        )} · ${escapeHtml(modLabel)}】</strong> 下热度最高的 <strong>${
          matchedEvents.length
        } 场</strong>已核实活动（其中本周末进行中 <strong>${
          weekendActive.length
        } 场</strong>，免费/快闪福利 <strong>${
          freeEvents.length
        } 场</strong>）。建议重点关注 ${escapeHtml(topTitlesPreview)}，或点击下方「附加实时网页深度探测」捕捉近 24 小时新官宣动态。`
      : `已为您在后台完成 <strong>【${escapeHtml(cityLabel)} × ${escapeHtml(modLabel)}${
          customKw ? ` × 关键词“${escapeHtml(customKw)}”` : ""
        }】</strong> 的多源去重检索与交叉核实：共命中 <strong>${
          matchedEvents.length
        } 场</strong>在库活动，其中 <strong>${
          weekendActive.length
        } 场本周末正在进行中</strong>、<strong>${
          freeEvents.length
        } 场支持免费入场或打卡领礼</strong>。热度峰值达 <strong class="accent-cinnabar">🔥 ${peakHeat}</strong>，整体票价区间为 <strong class="accent-gold">${escapeHtml(
          priceRangeText
        )}</strong>。本周末高频核心聚集在 <strong>${escapeHtml(
          districtSet.join("、") || cityLabel
        )}</strong>，首推必看现场包括：${escapeHtml(topTitlesPreview)}。`;

    // Save state for Markdown Copy & Batch Add to Passport
    state.lastBgTopEvents = topPicks;
    state.lastBgSummaryMarkdown = [
      `# 《${cityLabel} · ${modLabel}${customKw ? ` · ${customKw}` : ""}》周末情报后台检索总结报告`,
      `> 生成时间：${new Date().toLocaleString("zh-CN")} | 命中活动：${matchedEvents.length} 场 (本周末进行中 ${weekendActive.length} 场 / 免费 ${freeEvents.length} 场) | 票价区间：${priceRangeText}`,
      "",
      "## 一、核心情报综述",
      execLeadHtml.replace(/<\/?[^>]+(>|$)/g, ""),
      "",
      "## 二、重点推荐必去 TOP 活动清单",
      ...topPicks.map(
        (ev, idx) =>
          `${idx + 1}. **[${ev.city} · ${ev.module_code}] ${ev.title}** (${ev.heat_label} | ${ev.price})\n   - 时间：${ev.time_display}\n   - 场馆：${ev.district} · ${ev.venue}\n   - 看点：${ev.highlights}\n   - 苏州出发通勤：${ev.suzhou_transit}${ev.url ? `\n   - 链接：${ev.url}` : ""}`
      ),
      "",
      "## 三、必蹲核心地标与官方情报号",
      ...matchedVenues.map(
        (v) => `- **[${v.city}] ${v.name}** (${v.venue_type}) — ${v.official_accounts}`
      ),
      "",
      "## 四、策展人抢票/预约窗口与通勤建议",
      `- 最佳检索/预约窗口：${modObj ? modObj.best_window : "每周四晚/周五上午检索最新官宣"}`,
      `- 苏州出发高铁/轨交动线：${hsrAdvice}`,
    ].join("\n");

    contentEl.innerHTML = `
      <!-- 1. Executive Summary Card -->
      <div class="bg-exec-card">
        <div class="mono-label">01 // EXECUTIVE INTELLIGENCE SUMMARY · 后台检索综述与档期画像</div>
        <p class="bg-exec-lead">${execLeadHtml}</p>
        <div class="bg-exec-metrics">
          <span>🎯 命中总数: <strong>${matchedEvents.length} 场</strong></span>
          <span>⚡ 本周末进行中: <strong class="accent-cinnabar">${weekendActive.length} 场</strong></span>
          <span>🎁 免费/羊毛快闪: <strong class="accent-celadon">${freeEvents.length} 场</strong></span>
          <span>🔥 峰值热度: <strong>🔥 ${peakHeat}</strong></span>
          <span>💰 票价区间: <strong class="accent-gold">${escapeHtml(priceRangeText)}</strong></span>
        </div>
      </div>

      <!-- 2. Top Verified Picks Summary Grid -->
      <div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
          <span class="mono-label">02 // TOP VERIFIED PICKS · 后台命中必去 TOP ${topPicks.length} 活动精粹（可直接加入行程单）</span>
          <button type="button" class="card-action-btn" id="syncBgToMainDirectoryBtn">在上方主期刊库中展开全部 ${matchedEvents.length} 场 ↗</button>
        </div>
        <div class="bg-top-picks-grid">
          ${topPicks
            .map((ev, idx) => {
              const inPassport = state.passportIds.has(ev.event_id);
              const isFree =
                String(ev.is_free || "").includes("免费") ||
                String(ev.price || "").includes("免费");
              return `
                <div class="bg-pick-card">
                  <div>
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:6px; flex-wrap:wrap;">
                      <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span class="mono-badge">TOP 0${idx + 1}</span>
                        <span class="badge-city">${escapeHtml(ev.city)}</span>
                        <span class="badge-module">${escapeHtml(ev.module_code)} · ${escapeHtml(ev.category_name)}</span>
                        ${isFree ? `<span class="badge-free">免费</span>` : ""}
                      </div>
                      <span class="heat-pill">${escapeHtml(ev.heat_label)}</span>
                    </div>
                    <h4
                      style="font-family:'Noto Serif SC',serif; font-size:1.02rem; font-weight:700; cursor:pointer; margin-bottom:6px;"
                      data-bg-open-event="${escapeHtml(ev.event_id)}"
                    >
                      ${escapeHtml(ev.title)}
                    </h4>
                    <p style="font-size:0.81rem; color:var(--text-secondary); line-height:1.55;">
                      ${escapeHtml(ev.highlights)}
                    </p>
                  </div>

                  <div style="padding-top:8px; border-top:1px solid var(--border-hairline); font-size:0.77rem; color:var(--text-secondary); display:grid; gap:3px;">
                    <div>🕒 <strong>时间：</strong>${escapeHtml(ev.time_display)} ｜ 💰 <strong class="accent-gold">${escapeHtml(ev.price)}</strong></div>
                    <div>📍 <strong>场馆：</strong>${escapeHtml(ev.district)} · ${escapeHtml(ev.venue)}</div>
                    <div>🚄 <strong>苏州出发：</strong>${escapeHtml(ev.suzhou_transit)}</div>
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-top:6px; pt:4px;">
                      <div style="display:flex; gap:6px;">
                        <button type="button" class="card-action-btn" data-bg-open-event="${escapeHtml(ev.event_id)}">详情档案</button>
                        <button
                          type="button"
                          class="card-action-btn ${inPassport ? "in-passport" : ""}"
                          data-bg-passport-toggle="${escapeHtml(ev.event_id)}"
                        >
                          ${inPassport ? "✓ 已在行程单" : "+ 加入行程单"}
                        </button>
                      </div>
                      ${
                        ev.url
                          ? `<a href="${escapeHtml(ev.url)}" target="_blank" rel="noopener noreferrer" class="card-action-btn">官方直达 ↗</a>`
                          : ""
                      }
                    </div>
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>

      ${
        liveWebItems.length > 0
          ? `
      <!-- 3. Live Cross-Platform Public Web Probe Results -->
      <div class="bg-live-web-box">
        <div class="mono-label" style="color:var(--accent-celadon);">03 // LIVE CROSS-PLATFORM WEB PROBE · 跨平台公开源实时探测结果</div>
        <div style="display:grid; gap:8px;">
          ${liveWebItems
            .map(
              (item) => `
            <div style="padding:10px 12px; border:1px solid var(--border-hairline); background:var(--bg-card); display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
              <div>
                <div style="font-size:0.74rem; color:var(--accent-gold); font-family:'JetBrains Mono',monospace;">[${escapeHtml(item.source)}]</div>
                <div style="font-size:0.86rem; font-weight:600; margin:2px 0;">${escapeHtml(item.title)}</div>
                <div style="font-size:0.78rem; color:var(--text-secondary);">${escapeHtml(item.snippet)}</div>
              </div>
              <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="card-action-btn">查看实时源 ↗</a>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
      `
          : ""
      }

      <!-- 4. Target Treasure Venues & Curator's Actionable Strategy -->
      <div class="bg-venues-advice-grid">
        <div class="bg-sub-panel">
          <div class="mono-label">03 // TARGET LANDMARKS &amp; OFFICIAL ACCOUNTS · 该城必蹲宝藏场馆与官方号</div>
          <div style="display:grid; gap:8px;">
            ${matchedVenues
              .map(
                (v) => `
              <div style="padding:10px 12px; border:1px solid var(--border-hairline); background:var(--bg-card); display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div>
                  <div style="font-size:0.84rem; font-weight:700;">
                    <span class="badge-city" style="margin-right:6px;">${escapeHtml(v.city)}</span>
                    ${escapeHtml(v.name)}
                  </div>
                  <div style="font-size:0.76rem; color:var(--text-secondary); margin-top:3px;">
                    ${escapeHtml(v.official_accounts)} ｜ 高频：${escapeHtml(v.frequent_modules)}
                  </div>
                </div>
                ${
                  v.search_url
                    ? `<a href="${escapeHtml(v.search_url)}" target="_blank" rel="noopener noreferrer" class="card-action-btn">直达动态 ↗</a>`
                    : ""
                }
              </div>
            `
              )
              .join("")}
          </div>
        </div>

        <div class="bg-sub-panel">
          <div class="mono-label">04 // CURATOR'S ACTIONABLE STRATEGY · 策展人抢票预约与苏州高铁动线建议</div>
          <div style="font-size:0.82rem; color:var(--text-secondary); display:grid; gap:8px; line-height:1.62;">
            <div>
              <strong style="color:var(--text-primary);">⏱ 黄金蹲守与预约窗口：</strong>
              ${escapeHtml(
                modObj
                  ? modObj.best_window
                  : "体育场演唱会提前30-60天抢票；品牌一日店长与限时快闪通常在周三至周五官宣，建议周四晚至周五上午突击核实。"
              )}
            </div>
            <div>
              <strong style="color:var(--text-primary);">🚄 苏州出发跨城通勤提示：</strong>
              ${escapeHtml(hsrAdvice)}
            </div>
            <div>
              <strong style="color:var(--text-primary);">💡 现场避坑与羊毛贴士：</strong>
              凡标注「免费/需预约」的美术馆、园林夜游、谷子主题餐厅或大牌快闪（如仁恒仓街、张园、西岸、百联ZX），建议出发前在对应官方小程序或公众号确认当日预约余量；跨城看演出的观众请留意上海虹桥/无锡/南京南返程苏州的末班高铁（通常在 22:30–23:15 之间）。
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind events inside the generated summary
    contentEl.querySelectorAll("[data-bg-open-event]").forEach((el) => {
      el.addEventListener("click", () => {
        playMicroClick(580);
        openEventDossierModal(el.getAttribute("data-bg-open-event"));
      });
    });

    contentEl.querySelectorAll("[data-bg-passport-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        playMicroClick(700);
        togglePassportItem(btn.getAttribute("data-bg-passport-toggle"));
        runBackgroundSearchAndSummarize({ withLiveWeb: false, scrollIntoView: false });
      });
    });

    document.getElementById("syncBgToMainDirectoryBtn")?.addEventListener("click", () => {
      playMicroClick(620);
      state.selectedCity = city;
      state.selectedModule = modCode;
      state.searchQuery = customKw;
      const mainSearch = document.getElementById("eventSearchInput");
      if (mainSearch) mainSearch.value = customKw;
      renderIsochroneStarMap();
      renderSpotlight();
      renderFilterPills();
      renderModuleStrategyBanner();
      renderEventsDirectory();
      document.getElementById("section-directory")?.scrollIntoView({ behavior: "smooth" });
    });

    if (scrollIntoView) {
      document.getElementById("synthBgSummaryPanel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function renderCloudFormulasList() {
    const listEl = document.getElementById("cloudFormulasList");
    if (!listEl || !state.snapshot) return;

    const formulas = state.snapshot.search_formulas || [];
    listEl.innerHTML = formulas
      .map(
        (f) => `
      <div
        class="formula-item"
        data-load-formula="${escapeHtml(f.formula)}"
        data-formula-tab="${escapeHtml(f.tab_name)}"
      >
        <div class="formula-item-top">
          <span>${escapeHtml(f.tab_name)}</span>
          <span class="mono-badge">${escapeHtml(f.best_timing)}</span>
        </div>
        <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:4px;">${escapeHtml(f.scope)}</div>
        <div class="formula-item-code">${escapeHtml(f.formula)}</div>
      </div>
    `
      )
      .join("");

    listEl.querySelectorAll("[data-load-formula]").forEach((item) => {
      item.addEventListener("click", () => {
        const formula = item.getAttribute("data-load-formula") || "";
        const tabName = item.getAttribute("data-formula-tab") || "";
        playMicroClick(640);

        // Automatically sync the Module dropdown if tab starts with A_..J_
        const modMatch = tabName.match(/^([A-J])_/);
        const modSel = document.getElementById("synthModuleSelect");
        const customIn = document.getElementById("synthCustomInput");
        if (modSel) {
          modSel.value = modMatch ? modMatch[1] : "ALL";
        }
        if (customIn) {
          customIn.value = "";
        }

        updateSynthesizerOutput(false);
        const queryEl = document.getElementById("synthQueryDisplay");
        if (queryEl && formula) queryEl.textContent = formula;
        navigator.clipboard?.writeText(formula).catch(() => {});

        runBackgroundSearchAndSummarize({ withLiveWeb: false, scrollIntoView: true });
      });
    });
  }

  /* ========================================================================
     9. [05 / 05] 6-CITY 20 TREASURE VENUES & LANDMARK CHANNELS
     ======================================================================== */
  function renderTreasureVenues() {
    const gridEl = document.getElementById("venuesGrid");
    if (!gridEl || !state.snapshot) return;

    const venues = state.snapshot.venues || [];
    gridEl.innerHTML = venues
      .map(
        (v) => `
      <article class="venue-card">
        <div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <span class="badge-city">${escapeHtml(v.city)}</span>
            <span class="mono-label">VENUE #${String(v.seq).padStart(2, "0")}</span>
          </div>
          <h3 class="venue-title">${escapeHtml(v.name)}</h3>
          <div class="venue-type" style="margin: 4px 0 10px;">${escapeHtml(v.venue_type)}</div>
          <div class="venue-meta">
            <div><strong>高频模块：</strong>${escapeHtml(v.frequent_modules)}</div>
            <div><strong>必关注号：</strong>${escapeHtml(v.official_accounts)}</div>
            <div style="font-family:'JetBrains Mono',monospace; font-size:0.72rem; color:var(--text-muted); margin-top:4px;">
              公式：${escapeHtml(v.search_formula)}
            </div>
          </div>
        </div>

        <div style="display:flex; gap:8px; padding-top:10px; border-top:1px solid var(--border-hairline);">
          <button
            type="button"
            class="card-action-btn"
            data-filter-venue="${escapeHtml(v.city)}"
          >
            筛选该城活动
          </button>
          ${
            v.search_url
              ? `<a href="${escapeHtml(v.search_url)}" target="_blank" rel="noopener noreferrer" class="card-action-btn">直达情报源 ↗</a>`
              : ""
          }
        </div>
      </article>
    `
      )
      .join("");

    gridEl.querySelectorAll("[data-filter-venue]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const city = btn.getAttribute("data-filter-venue");
        playMicroClick(600);
        setSelectedCity(city);
        document.getElementById("section-directory")?.scrollIntoView({ behavior: "smooth" });
      });
    });
  }

  /* ========================================================================
     10. MY WEEKEND PASSPORT DRAWER & EXPORTERS (.MD / .ICS / .CSV)
     ======================================================================== */
  function togglePassportItem(eventId) {
    if (state.passportIds.has(eventId)) {
      state.passportIds.delete(eventId);
    } else {
      state.passportIds.add(eventId);
    }
    savePassportState();
    renderEventsDirectory();
    renderPassportDrawer();
  }

  function updatePassportBadge() {
    const badge = document.getElementById("passportCountBadge");
    if (badge) {
      badge.textContent = String(state.passportIds.size);
    }
  }

  function getPassportEvents() {
    if (!state.snapshot) return [];
    return (state.snapshot.events || []).filter((e) => state.passportIds.has(e.event_id));
  }

  function parseEstimatedPrice(priceStr) {
    const s = String(priceStr || "");
    if (s.includes("免费")) return 0;
    const m = s.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function renderPassportDrawer() {
    const summaryEl = document.getElementById("passportSummaryBar");
    const listEl = document.getElementById("passportItemsList");
    if (!summaryEl || !listEl) return;

    const items = getPassportEvents();
    const citiesSet = new Set(items.map((i) => i.city));
    const totalBudget = items.reduce((acc, ev) => acc + parseEstimatedPrice(ev.price), 0);

    summaryEl.innerHTML = `
      <span>SELECTED: <strong>${items.length} 场活动</strong></span>
      <span>CITIES: <strong>${citiesSet.size ? Array.from(citiesSet).join(" · ") : "暂无"}</strong></span>
      <span>EST. TICKET: <strong class="accent-gold">¥${totalBudget} 起</strong></span>
    `;

    if (items.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 36px 16px; text-align:center; color:var(--text-secondary);">
          <p style="margin-bottom:8px;">你的周末行程单还是空的</p>
          <p style="font-size:0.8rem; color:var(--text-muted);">在活动卡片上点击「+ 加入行程单」，即可自动规划苏州出发跨城高铁动线与门票预算，并导出日历或 Markdown。</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = items
      .map(
        (ev, idx) => `
      <div class="passport-item-card">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="mono-label">#0${idx + 1} · ${escapeHtml(ev.city)} · MODULE ${escapeHtml(ev.module_code)}</span>
          <button
            type="button"
            class="card-action-btn"
            data-remove-passport="${escapeHtml(ev.event_id)}"
          >移除 ×</button>
        </div>
        <strong style="font-size:0.94rem;">${escapeHtml(ev.title)}</strong>
        <div style="font-size:0.78rem; color:var(--text-secondary);">
          🕒 ${escapeHtml(ev.time_display)} ｜ 💰 <span class="accent-gold">${escapeHtml(ev.price)}</span>
        </div>
        <div style="font-size:0.76rem; color:var(--text-muted);">
          📍 ${escapeHtml(ev.venue)}<br/>
          🚄 ${escapeHtml(ev.suzhou_transit)}
        </div>
      </div>
    `
      )
      .join("");

    listEl.querySelectorAll("[data-remove-passport]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-remove-passport");
        playMicroClick(500);
        togglePassportItem(id);
      });
    });
  }

  function downloadBlob(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportPassportMarkdown() {
    const items = getPassportEvents();
    if (!items.length) return;
    const lines = [
      "# YRD WEEKEND PULSE｜我的江浙沪跨城周末行程单",
      `> 生成时间：${new Date().toLocaleString("zh-CN")} | 活动数：${items.length} 场`,
      "",
    ];
    items.forEach((ev, idx) => {
      lines.push(`## ${idx + 1}. [${ev.city} · ${ev.category_name}] ${ev.title}`);
      lines.push(`- **时间**：${ev.time_display} (${ev.start_date} ~ ${ev.end_date})`);
      lines.push(`- **场馆**：${ev.district} · ${ev.venue}`);
      lines.push(`- **票价**：${ev.price} (${ev.is_free})`);
      lines.push(`- **苏州出发高铁/地铁动线**：${ev.suzhou_transit}`);
      lines.push(`- **核心看点**：${ev.highlights}`);
      if (ev.url) lines.push(`- **官方链接**：${ev.url}`);
      lines.push("");
    });
    downloadBlob("yrd_weekend_passport.md", lines.join("\n"), "text/markdown;charset=utf-8");
  }

  function exportPassportIcs() {
    const items = getPassportEvents();
    if (!items.length) return;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//YRD WEEKEND PULSE//CN",
    ];
    items.forEach((ev) => {
      const dStart = (ev.start_date || "2026-11-21").replace(/-/g, "");
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${ev.event_id}@yrd-weekend-pulse`);
      lines.push(`DTSTART;VALUE=DATE:${dStart}`);
      lines.push(`SUMMARY:[${ev.city}] ${ev.title}`);
      lines.push(`LOCATION:${ev.city} ${ev.venue}`);
      lines.push(`DESCRIPTION:${ev.highlights} | 通勤：${ev.suzhou_transit}`);
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    downloadBlob("yrd_weekend_passport.ics", lines.join("\r\n"), "text/calendar;charset=utf-8");
  }

  function exportPassportCsv() {
    const items = getPassportEvents();
    if (!items.length) return;
    const headers = ["城市", "模块", "活动名称", "活动时间", "具体场馆", "票价", "苏州出发通勤", "官方链接"];
    const rows = items.map((ev) =>
      [
        ev.city,
        `${ev.module_code}_${ev.category_name}`,
        ev.title,
        ev.time_display,
        ev.venue,
        ev.price,
        ev.suzhou_transit,
        ev.url,
      ]
        .map((v) => `"${String(v || "").replace(/"/g, '""')}"`)
        .join(",")
    );
    downloadBlob(
      "yrd_weekend_passport.csv",
      "\uFEFF" + [headers.join(","), ...rows].join("\n"),
      "text/csv;charset=utf-8"
    );
  }

  /* ========================================================================
     11. UI EVENT LISTENERS & BOOTSTRAP
     ======================================================================== */
  function bindUiEvents() {
    // Scroll Progress Scrubber
    window.addEventListener(
      "scroll",
      () => {
        const doc = document.documentElement;
        const scrollTop = doc.scrollTop || document.body.scrollTop;
        const scrollHeight = doc.scrollHeight - doc.clientHeight;
        const pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
        const bar = document.getElementById("scrollProgressBar");
        if (bar) bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      },
      { passive: true }
    );

    // Theme Switcher
    document.getElementById("themeToggleBtn")?.addEventListener("click", () => {
      const curr = document.documentElement.getAttribute("data-theme") || "dark";
      const next = curr === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      updateThemeLabel(next);
      playMicroClick(680);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch (_) {}
    });

    // Sound Toggle
    document.getElementById("soundToggleBtn")?.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;
      const lbl = document.getElementById("soundStateLabel");
      if (lbl) lbl.textContent = state.soundEnabled ? "[ON]" : "[OFF]";
      if (state.soundEnabled) playMicroClick(760);
    });

    // Star Map Reset
    document.getElementById("starMapResetBtn")?.addEventListener("click", () => {
      playMicroClick(520);
      setSelectedCity("ALL");
    });

    // Search Input
    const searchInput = document.getElementById("eventSearchInput");
    searchInput?.addEventListener("input", (e) => {
      state.searchQuery = e.target.value || "";
      renderEventsDirectory();
    });

    document.getElementById("clearSearchBtn")?.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      state.searchQuery = "";
      renderEventsDirectory();
    });

    // Quick Status Toggles
    document.querySelectorAll("#statusFilterGroup .status-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        playMicroClick(580);
        state.selectedStatus = btn.getAttribute("data-status") || "ALL";
        document.querySelectorAll("#statusFilterGroup .status-pill").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
        renderEventsDirectory();
      });
    });

    // View Switcher (Grid vs Table)
    document.querySelectorAll(".view-mode-group .view-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        playMicroClick(600);
        state.viewMode = btn.getAttribute("data-view") || "grid";
        document.querySelectorAll(".view-mode-group .view-btn").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });
        renderEventsDirectory();
      });
    });

    // Synthesizer Controls
    ["synthCitySelect", "synthModuleSelect", "synthCustomInput"].forEach((id) => {
      const el = document.getElementById(id);
      el?.addEventListener("input", () => updateSynthesizerOutput(true));
      el?.addEventListener("change", () => updateSynthesizerOutput(true));
    });

    // Preset Quick-Chips
    document.querySelectorAll("#synthPresetChips .preset-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        playMicroClick(640);
        const c = chip.getAttribute("data-preset-city") || "苏州";
        const m = chip.getAttribute("data-preset-mod") || "A";
        const kw = chip.getAttribute("data-preset-kw") || "";
        const citySel = document.getElementById("synthCitySelect");
        const modSel = document.getElementById("synthModuleSelect");
        const customIn = document.getElementById("synthCustomInput");
        if (citySel) citySel.value = c;
        if (modSel) modSel.value = m;
        if (customIn) customIn.value = kw;
        updateSynthesizerOutput(false);
        runBackgroundSearchAndSummarize({ withLiveWeb: false, scrollIntoView: true });
      });
    });

    // Background Search & Summary Trigger Buttons
    document.getElementById("runBgSearchBtn")?.addEventListener("click", () => {
      playMicroClick(720);
      runBackgroundSearchAndSummarize({ withLiveWeb: false, scrollIntoView: true });
    });

    document.getElementById("runLiveWebProbeBtn")?.addEventListener("click", () => {
      playMicroClick(760);
      runBackgroundSearchAndSummarize({ withLiveWeb: true, scrollIntoView: true });
    });

    // Copy Markdown Summary Report
    document.getElementById("copyBgSummaryMdBtn")?.addEventListener("click", () => {
      playMicroClick(680);
      const md = state.lastBgSummaryMarkdown || "";
      if (!md) return;
      navigator.clipboard?.writeText(md).catch(() => {});
      const btn = document.getElementById("copyBgSummaryMdBtn");
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = "✓ 已复制完整 Markdown 总结";
        setTimeout(() => {
          btn.textContent = orig;
        }, 1800);
      }
    });

    // Batch Add Top Recommended Events to Weekend Passport
    document.getElementById("batchAddSummaryToPassportBtn")?.addEventListener("click", () => {
      playMicroClick(740);
      const topEvs = state.lastBgTopEvents || [];
      topEvs.forEach((ev) => state.passportIds.add(ev.event_id));
      savePassportState();
      renderEventsDirectory();
      renderPassportDrawer();
      runBackgroundSearchAndSummarize({ withLiveWeb: false, scrollIntoView: false });
      const btn = document.getElementById("batchAddSummaryToPassportBtn");
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = `✓ 已将 ${topEvs.length} 场推荐活动加入行程单`;
        setTimeout(() => {
          btn.textContent = orig;
        }, 1800);
      }
    });

    document.getElementById("copySynthQueryBtn")?.addEventListener("click", () => {
      const q = document.getElementById("synthQueryDisplay")?.textContent || "";
      navigator.clipboard?.writeText(q).catch(() => {});
      const btn = document.getElementById("copySynthQueryBtn");
      if (btn) {
        btn.textContent = "✓ 已复制";
        setTimeout(() => {
          btn.textContent = "复制检索词";
        }, 1500);
      }
    });

    // Modal Close
    const modalBackdrop = document.getElementById("eventModalBackdrop");
    document.getElementById("closeModalBtn")?.addEventListener("click", () => {
      modalBackdrop?.classList.add("hidden");
    });
    modalBackdrop?.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) modalBackdrop.classList.add("hidden");
    });

    // Passport Drawer Open/Close & Exporters
    const drawerBackdrop = document.getElementById("passportDrawerBackdrop");
    document.getElementById("passportTriggerBtn")?.addEventListener("click", () => {
      playMicroClick(640);
      renderPassportDrawer();
      drawerBackdrop?.classList.remove("hidden");
    });
    document.getElementById("closePassportBtn")?.addEventListener("click", () => {
      drawerBackdrop?.classList.add("hidden");
    });
    drawerBackdrop?.addEventListener("click", (e) => {
      if (e.target === drawerBackdrop) drawerBackdrop.classList.add("hidden");
    });

    document.getElementById("exportMarkdownBtn")?.addEventListener("click", exportPassportMarkdown);
    document.getElementById("exportIcsBtn")?.addEventListener("click", exportPassportIcs);
    document.getElementById("exportCsvBtn")?.addEventListener("click", exportPassportCsv);
    document.getElementById("clearPassportBtn")?.addEventListener("click", () => {
      state.passportIds.clear();
      savePassportState();
      renderEventsDirectory();
      renderPassportDrawer();
    });

    // ESC key closes modals/drawers
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        modalBackdrop?.classList.add("hidden");
        drawerBackdrop?.classList.add("hidden");
      }
    });
  }

  async function init() {
    loadPersistedState();
    updatePassportBadge();
    bindUiEvents();

    try {
      state.snapshot = await loadSnapshotData();
      renderHeroAndTelemetry();
      renderIsochroneStarMap();
      renderSpotlight();
      renderFilterPills();
      renderModuleStrategyBanner();
      renderEventsDirectory();
      updateSynthesizerOutput();
      renderCloudFormulasList();
      renderTreasureVenues();
    } catch (err) {
      console.error("[YRD WEEKEND PULSE] Snapshot load error:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
