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
  async function loadSnapshotData() {
    if (window.__YRD_PRELOADED_SNAPSHOT__) {
      return window.__YRD_PRELOADED_SNAPSHOT__;
    }
    const candidates = [
      "./data/dashboard_snapshot.json",
      "../data/dashboard_snapshot.json",
      "data/dashboard_snapshot.json",
    ];
    for (const url of candidates) {
      try {
        const resp = await fetch(url, { cache: "no-store" });
        if (resp.ok) {
          return await resp.json();
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
      totalMeta.textContent = `${stats.total_events || 198} EVENTS`;
    }

    const setNum = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    setNum("statTotalEvents", stats.total_events || 198);
    setNum("statWeekendActive", stats.active_weekend_events || 133);
    setNum("statFreeEvents", stats.free_events || 31);
    setNum("statTotalVenues", stats.total_venues || 20);

    const footerUpdated = document.getElementById("footerUpdatedAt");
    if (footerUpdated) {
      footerUpdated.textContent = snap.updated_at || "2026-11-21";
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
  function renderSpotlight() {
    const container = document.getElementById("spotlightGrid");
    if (!container || !state.snapshot) return;

    let pool = state.snapshot.events || [];
    if (state.selectedCity !== "ALL") {
      pool = pool.filter((e) => e.city === state.selectedCity);
    }

    // Pick top 6 diversified high-heat events
    const topEvents = [...pool]
      .sort((a, b) => (b.heat_score || 0) - (a.heat_score || 0))
      .slice(0, 6);

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
     8. [04 / 05] CROSS-PLATFORM SMART SEARCH MATRIX
     ======================================================================== */
  const CITY_LANDMARK_KEYWORDS = {
    苏州: "(仁恒仓街 OR 十全街 OR 诚品生活 OR 苏州中心 OR 本色美术馆 OR 山丘Livehouse)",
    上海: "(张园 OR 西岸美术馆 OR 安福路 OR 百联ZX OR 静安大悦城 OR 浦东美术馆)",
    无锡: "(南长街 OR 拈花湾 OR 惠山古镇 OR 无锡大剧院 OR 无锡奥体中心)",
    常州: "(太湖湾 OR 青果巷 OR 文化广场 OR 中华恐龙园 OR 棉仓)",
    杭州: "(天目里 OR 良渚大屋顶 OR 湖滨in77 OR 西湖 OR 大麦66Livehouse)",
    南京: "(德基广场 OR 1701Livehouse OR 南京博物院 OR 熙南里 OR 江苏大剧院)",
  };

  const MODULE_SCENARIO_KEYWORDS = {
    A: "(一日店长 OR 明星空降 OR 演唱会 OR 品牌见面会) 2026年11月",
    B: "(快闪 OR Pop-up OR 限时店 OR 打卡领礼) 本周末",
    C: "(美术馆特展 OR 新书沙龙 OR 原版音乐剧 OR 交响乐) 本周末",
    D: "(Livehouse巡演 OR 脱口秀开放麦 OR 摇滚现场) 本周末",
    E: "(咖啡节 OR 精酿啤酒节 OR 本色市集 OR 周末市集) 11月",
    F: "(漫展 OR 同人ONLY OR 谷子痛楼 OR 地下偶像) 11月",
    G: "(Citywalk OR 环湖骑行 OR 宠物友好派对 OR 市民夜校) 周末",
    H: "(园林夜游 OR 昆曲评弹 OR 无人机烟花秀 OR 红枫银杏) 本周末",
    I: "(会展排期 OR 文博会 OR 潮玩展 OR 宠物展) 11月",
    J: "(主厨限时晚宴 OR 亲子剧场 OR 马拉松 OR 博物馆奇妙夜) 周末",
  };

  function updateSynthesizerOutput() {
    const citySel = document.getElementById("synthCitySelect");
    const modSel = document.getElementById("synthModuleSelect");
    const customIn = document.getElementById("synthCustomInput");
    const queryEl = document.getElementById("synthQueryDisplay");
    const tipEl = document.getElementById("synthTimingTip");
    const launchGrid = document.getElementById("platformLaunchGrid");
    if (!citySel || !modSel || !queryEl || !launchGrid) return;

    const city = citySel.value || "苏州";
    const modCode = modSel.value || "A";
    const custom = (customIn ? customIn.value : "").trim();

    const landmarkPart = CITY_LANDMARK_KEYWORDS[city] || city;
    const scenarioPart = MODULE_SCENARIO_KEYWORDS[modCode] || "本周末 活动";
    const synthesized = custom
      ? `${city} ${custom} ${scenarioPart}`
      : `${city} ${landmarkPart} ${scenarioPart}`;

    queryEl.textContent = synthesized;

    const modObj = ((state.snapshot && state.snapshot.modules) || []).find(
      (m) => m.code === modCode
    );
    if (tipEl && modObj) {
      tipEl.textContent = `⏱ 最佳检索时间窗口：${modObj.best_window}`;
    }

    const enc = encodeURIComponent(synthesized);
    const simpleEnc = encodeURIComponent(`${city} ${custom || (modObj ? modObj.name : "周末活动")} 11月`);

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
        url: `https://search.damai.cn/search.htm?keyword=${encodeURIComponent(city + " " + custom)}`,
      },
      {
        name: "秀动 ShowStart",
        url: `https://www.showstart.com/event/list?keyword=${encodeURIComponent(city)}`,
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
  }

  function renderCloudFormulasList() {
    const listEl = document.getElementById("cloudFormulasList");
    if (!listEl || !state.snapshot) return;

    const formulas = state.snapshot.search_formulas || [];
    listEl.innerHTML = formulas
      .map(
        (f) => `
      <div class="formula-item" data-load-formula="${escapeHtml(f.formula)}">
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
        const formula = item.getAttribute("data-load-formula");
        playMicroClick(640);
        const queryEl = document.getElementById("synthQueryDisplay");
        if (queryEl) queryEl.textContent = formula;
        navigator.clipboard?.writeText(formula).catch(() => {});
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
      el?.addEventListener("input", updateSynthesizerOutput);
      el?.addEventListener("change", updateSynthesizerOutput);
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
