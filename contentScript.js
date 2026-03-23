// ============================================================
// Content Script — MemeLord Site Blocker
// Detects blocked sites, checks schedule, renders Win95 meme page.
// ============================================================

const restricted_sites = new Set();

// Retrieve blocked sites and their schedules from Chrome storage
chrome.storage.sync.get(["blockedWebsitesArray", "blockingSchedules"], function (data) {
  const blockedWebsitesArray = data.blockedWebsitesArray || [];
  const blockingSchedules    = data.blockingSchedules    || {};

  blockedWebsitesArray.forEach((item) => {
    const lower      = item.toLowerCase();
    const normalized = normalizeURL(lower);
    // Look up schedule by either the raw or www-stripped hostname
    const schedule   = blockingSchedules[normalized] || blockingSchedules[lower];

    // Only add to restricted set if no schedule is defined or we're currently within it
    if (!schedule || isWithinBlockingSchedule(schedule)) {
      restricted_sites.add(lower);
      restricted_sites.add(normalized);
    }
  });

  check_if_restricted();
});

// Remove 'www.' prefix for consistent comparisons
function normalizeURL(url) {
  return url.replace(/^www\./i, "");
}

// Returns true if the current page hostname matches a restricted site
function shouldBlockWebsite() {
  const currentHostname = normalizeURL(window.location.hostname.toLowerCase());
  return restricted_sites.has(currentHostname);
}

/**
 * Determines whether "now" falls inside a blocking schedule.
 * schedule = { days: [0..6], startTime: "HH:MM", endTime: "HH:MM" }
 * Defaults (no entry) mean block 24/7.
 */
function isWithinBlockingSchedule(schedule) {
  if (!schedule) return true;

  const now            = new Date();
  const currentDay     = now.getDay(); // 0 = Sun … 6 = Sat
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Check day
  const days = Array.isArray(schedule.days) && schedule.days.length > 0
    ? schedule.days
    : [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(currentDay)) return false;

  // Check time range
  if (schedule.startTime && schedule.endTime) {
    const [sh, sm] = schedule.startTime.split(":").map(Number);
    const [eh, em] = schedule.endTime.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin   = eh * 60 + em;

    if (endMin >= startMin) {
      // Normal range e.g. 09:00–17:00
      return currentMinutes >= startMin && currentMinutes < endMin;
    } else {
      // Overnight range e.g. 22:00–06:00
      return currentMinutes >= startMin || currentMinutes < endMin;
    }
  }

  return true;
}

// Entry point
function check_if_restricted() {
  if (shouldBlockWebsite()) {
    createBlockedPage();
  }
}

// ── Blocked Page ──────────────────────────────────────────────

function createBlockedPage() {
  const hostname = window.location.hostname;

  const styleEl = document.createElement("style");
  styleEl.textContent = generateSTYLING();
  (document.head || document.getElementsByTagName("head")[0]).appendChild(styleEl);

  document.body.innerHTML = generateHTML(hostname);

  requestMeme(hostname, false);

  document.getElementById("mlb-new-meme-btn").addEventListener("click", () => {
    showLoadingState();
    requestMeme(hostname, true);
  });
}

// Send a message to the background service worker to fetch a meme
function requestMeme(hostname, refresh) {
  const messageType = refresh ? "REFRESH_MEME" : "GET_MEME";
  chrome.runtime.sendMessage({ type: messageType, hostname }, (response) => {
    if (chrome.runtime.lastError) {
      showErrorState("Could not reach the extension background. Try reloading the page.");
      return;
    }
    if (response && response.success) {
      showMemeState(response.imageUrl);
    } else {
      showErrorState(response?.error || "Something went wrong fetching your meme.");
    }
  });
}

// ── State Transitions ─────────────────────────────────────────

// Use setProperty with !important so we override the stylesheet's !important rules
function setDisplay(el, value) {
  el.style.setProperty("display", value, "important");
}

function showLoadingState() {
  setDisplay(document.getElementById("mlb-loading"),      "flex");
  setDisplay(document.getElementById("mlb-meme-display"), "none");
  setDisplay(document.getElementById("mlb-error"),        "none");
  setDisplay(document.getElementById("mlb-new-meme-btn"), "none");
  document.getElementById("mlb-status-text").textContent = "Contacting MemeLord API…";
}

function isValidHttpsUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function showMemeState(imageUrl) {
  if (!isValidHttpsUrl(imageUrl)) {
    showErrorState("Received an invalid or insecure image URL. Try generating a new meme.");
    return;
  }

  const img = document.getElementById("mlb-meme-image");

  // Safety timeout: if image never loads/errors within 15 s, show error
  const timeout = setTimeout(() => {
    img.onload  = null;
    img.onerror = null;
    showErrorState("Meme image timed out. The URL may have expired. Try a new one.");
  }, 15000);

  img.onload = () => {
    clearTimeout(timeout);
    setDisplay(document.getElementById("mlb-loading"),        "none");
    setDisplay(document.getElementById("mlb-meme-display"),   "block");
    setDisplay(document.getElementById("mlb-error"),          "none");
    setDisplay(document.getElementById("mlb-new-meme-btn"),   "inline-block");
    document.getElementById("mlb-status-text").textContent = "Meme loaded successfully";
  };
  img.onerror = () => {
    clearTimeout(timeout);
    showErrorState("Meme image failed to load. Try generating a new one.");
  };

  img.src = imageUrl;
}

function showErrorState(message) {
  setDisplay(document.getElementById("mlb-loading"),        "none");
  setDisplay(document.getElementById("mlb-meme-display"),   "none");
  setDisplay(document.getElementById("mlb-error"),          "flex");
  setDisplay(document.getElementById("mlb-new-meme-btn"),   "inline-block");
  document.getElementById("mlb-error-text").textContent  = message;
  document.getElementById("mlb-status-text").textContent = "Error — click 'New Meme' to retry";
}

// ── HTML Generation ───────────────────────────────────────────

function generateHTML(hostname) {
  const clean = hostname.replace(/^www\./, "");
  return `
<div id="mlb-desktop">
  <div id="mlb-window" role="dialog" aria-label="MemeLord Site Blocker">

    <!-- Title bar -->
    <div id="mlb-titlebar">
      <div id="mlb-titlebar-left">
        <span id="mlb-titlebar-icon">🦈</span>
        <span id="mlb-titlebar-text">MemeLord Site Blocker</span>
      </div>
      <div id="mlb-titlebar-btns">
        <button class="mlb-wbtn" title="Minimize" aria-label="Minimize">_</button>
        <button class="mlb-wbtn" title="Maximize" aria-label="Maximize">□</button>
        <button class="mlb-wbtn" title="Close"    aria-label="Close">✕</button>
      </div>
    </div>

    <!-- Menu bar -->
    <div id="mlb-menubar" role="menubar">
      <span class="mlb-menu-item" role="menuitem">File</span>
      <span class="mlb-menu-item" role="menuitem">View</span>
      <span class="mlb-menu-item" role="menuitem">Help</span>
    </div>

    <!-- Window body -->
    <div id="mlb-window-body">

      <!-- Header row -->
      <div id="mlb-header">
        <span id="mlb-shark-icon">🦈</span>
        <div id="mlb-header-text">
          <div id="mlb-blocked-title">ACCESS DENIED</div>
          <div id="mlb-blocked-sub">
            <strong>${clean}</strong> is on your block list — here&rsquo;s your meme
          </div>
        </div>
      </div>

      <!-- Sunken content area -->
      <div id="mlb-content-area">

        <!-- Loading state -->
        <div id="mlb-loading">
          <div id="mlb-loading-inner">
            <p id="mlb-loading-text">Generating your Shark Tank meme&hellip;</p>
            <div id="mlb-progress-track">
              <div id="mlb-progress-bar"></div>
            </div>
          </div>
        </div>

        <!-- Meme image -->
        <div id="mlb-meme-display">
          <img id="mlb-meme-image" src="" alt="AI-Generated Shark Tank Meme" />
        </div>

        <!-- Error state -->
        <div id="mlb-error">
          <div id="mlb-error-icon">⚠️</div>
          <p id="mlb-error-text">Something went wrong.</p>
          <p id="mlb-error-hint">
            Make sure your MemeLord API key is set in the extension popup.
          </p>
        </div>

      </div><!-- /content-area -->

      <!-- Action button -->
      <div id="mlb-actions">
        <button id="mlb-new-meme-btn">🎲 Generate New Meme</button>
      </div>

    </div><!-- /window-body -->

    <!-- Status bar -->
    <div id="mlb-statusbar">
      <div id="mlb-status-panel">
        <span id="mlb-status-text">Connecting to MemeLord API&hellip;</span>
      </div>
      <div id="mlb-status-panel2">MemeLord v2.0</div>
    </div>

  </div><!-- /window -->
</div><!-- /desktop -->
  `;
}

// ── CSS Generation ────────────────────────────────────────────

function generateSTYLING() {
  return `
    /* ── Reset ── */
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      height: 100% !important;
      overflow: hidden !important;
    }

    /* ── Win95 Desktop (teal) ── */
    #mlb-desktop {
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      background-color: #008080 !important;
      font-family: 'MS Sans Serif', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
      font-size: 11px !important;
      overflow-y: auto !important;
      padding: 1.5rem 1rem !important;
      box-sizing: border-box !important;
    }

    /* ── Win95 Window ── */
    #mlb-window {
      width: 560px !important;
      max-width: 98vw !important;
      background: #c0c0c0 !important;
      /* Raised 3-D border */
      border-top:    2px solid #ffffff !important;
      border-left:   2px solid #ffffff !important;
      border-right:  2px solid #404040 !important;
      border-bottom: 2px solid #404040 !important;
      box-shadow: 1px 1px 0 #000000, inset 1px 1px 0 #dfdfdf !important;
      display: flex !important;
      flex-direction: column !important;
    }

    /* ── Title Bar ── */
    #mlb-titlebar {
      background: linear-gradient(to right, #000080, #1084d0) !important;
      padding: 3px 4px 3px 6px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      user-select: none !important;
      flex-shrink: 0 !important;
    }

    #mlb-titlebar-left {
      display: flex !important;
      align-items: center !important;
      gap: 5px !important;
    }

    #mlb-titlebar-icon {
      font-size: 14px !important;
      line-height: 1 !important;
    }

    #mlb-titlebar-text {
      color: #ffffff !important;
      font-weight: bold !important;
      font-size: 11px !important;
      font-family: 'MS Sans Serif', 'Segoe UI', Tahoma, sans-serif !important;
      letter-spacing: 0 !important;
    }

    #mlb-titlebar-btns {
      display: flex !important;
      gap: 2px !important;
    }

    .mlb-wbtn {
      width: 16px !important;
      height: 14px !important;
      min-width: 0 !important;
      background: #c0c0c0 !important;
      border-top:    1px solid #ffffff !important;
      border-left:   1px solid #ffffff !important;
      border-right:  1px solid #404040 !important;
      border-bottom: 1px solid #404040 !important;
      font-size: 8px !important;
      line-height: 1 !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      color: #000000 !important;
      font-family: 'MS Sans Serif', Tahoma, sans-serif !important;
      box-sizing: border-box !important;
      border-radius: 0 !important;
      flex-shrink: 0 !important;
    }

    .mlb-wbtn:active {
      border-top:    1px solid #404040 !important;
      border-left:   1px solid #404040 !important;
      border-right:  1px solid #ffffff !important;
      border-bottom: 1px solid #ffffff !important;
    }

    /* ── Menu Bar ── */
    #mlb-menubar {
      background: #c0c0c0 !important;
      border-bottom: 1px solid #808080 !important;
      display: flex !important;
      padding: 1px 2px !important;
      flex-shrink: 0 !important;
    }

    .mlb-menu-item {
      padding: 2px 8px !important;
      font-size: 11px !important;
      cursor: default !important;
      color: #000000 !important;
      font-family: 'MS Sans Serif', Tahoma, sans-serif !important;
      border-radius: 0 !important;
    }

    .mlb-menu-item:hover {
      background: #000080 !important;
      color: #ffffff !important;
    }

    /* ── Window Body ── */
    #mlb-window-body {
      padding: 8px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 6px !important;
    }

    /* ── Header ── */
    #mlb-header {
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;
      padding: 2px 0 4px !important;
    }

    #mlb-shark-icon {
      font-size: 2.2rem !important;
      line-height: 1 !important;
      flex-shrink: 0 !important;
    }

    #mlb-header-text {
      display: flex !important;
      flex-direction: column !important;
      gap: 2px !important;
    }

    #mlb-blocked-title {
      font-size: 13px !important;
      font-weight: bold !important;
      color: #000080 !important;
      letter-spacing: 1px !important;
      font-family: 'MS Sans Serif', Tahoma, sans-serif !important;
    }

    #mlb-blocked-sub {
      font-size: 11px !important;
      color: #000000 !important;
      font-family: 'MS Sans Serif', Tahoma, sans-serif !important;
    }

    #mlb-blocked-sub strong {
      color: #800000 !important;
    }

    /* ── Sunken Content Area ── */
    #mlb-content-area {
      border-top:    2px solid #808080 !important;
      border-left:   2px solid #808080 !important;
      border-right:  2px solid #ffffff !important;
      border-bottom: 2px solid #ffffff !important;
      background: #ffffff !important;
      min-height: 180px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 12px !important;
      box-sizing: border-box !important;
      position: relative !important;
    }

    /* ── Loading ── */
    #mlb-loading {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      width: 100% !important;
      padding: 1.5rem 0 !important;
    }

    #mlb-loading-inner {
      width: 300px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 8px !important;
    }

    #mlb-loading-text {
      font-size: 11px !important;
      color: #000000 !important;
      margin: 0 !important;
      font-family: 'MS Sans Serif', Tahoma, sans-serif !important;
    }

    /* Win95-style marquee progress bar */
    #mlb-progress-track {
      width: 100% !important;
      height: 18px !important;
      border-top:    1px solid #808080 !important;
      border-left:   1px solid #808080 !important;
      border-right:  1px solid #ffffff !important;
      border-bottom: 1px solid #ffffff !important;
      background: #c0c0c0 !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }

    #mlb-progress-bar {
      height: 100% !important;
      width: 100% !important;
      background: repeating-linear-gradient(
        90deg,
        #000080 0px, #000080 10px,
        #c0c0c0 10px, #c0c0c0 14px
      ) !important;
      background-size: 28px 100% !important;
      animation: mlb-marquee 1.2s linear infinite !important;
    }

    @keyframes mlb-marquee {
      from { background-position: 0 0; }
      to   { background-position: 28px 0; }
    }

    /* ── Meme Image ── */
    #mlb-meme-display {
      display: none !important;
      text-align: center !important;
      width: 100% !important;
    }

    #mlb-meme-image {
      max-width: 100% !important;
      max-height: 52vh !important;
      object-fit: contain !important;
      display: block !important;
      margin: 0 auto !important;
      border: 2px solid #808080 !important;
    }

    /* ── Error ── */
    #mlb-error {
      display: none !important;
      flex-direction: column !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 1.2rem 1rem !important;
      text-align: center !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }

    #mlb-error-icon {
      font-size: 2rem !important;
      line-height: 1 !important;
    }

    #mlb-error-text {
      font-size: 11px !important;
      font-weight: bold !important;
      color: #000000 !important;
      margin: 0 !important;
      font-family: 'MS Sans Serif', Tahoma, sans-serif !important;
    }

    #mlb-error-hint {
      font-size: 10px !important;
      color: #444444 !important;
      margin: 0 !important;
      font-family: 'MS Sans Serif', Tahoma, sans-serif !important;
    }

    /* ── Actions ── */
    #mlb-actions {
      display: flex !important;
      justify-content: center !important;
      padding: 2px 0 !important;
    }

    /* Win95 raised button */
    #mlb-new-meme-btn {
      display: none !important;
      background: #c0c0c0 !important;
      color: #000000 !important;
      border-top:    2px solid #ffffff !important;
      border-left:   2px solid #ffffff !important;
      border-right:  2px solid #404040 !important;
      border-bottom: 2px solid #404040 !important;
      padding: 4px 22px !important;
      font-size: 11px !important;
      font-family: 'MS Sans Serif', 'Segoe UI', Tahoma, sans-serif !important;
      cursor: pointer !important;
      min-width: 100px !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }

    #mlb-new-meme-btn:active {
      border-top:    2px solid #404040 !important;
      border-left:   2px solid #404040 !important;
      border-right:  2px solid #ffffff !important;
      border-bottom: 2px solid #ffffff !important;
      padding-top:   5px !important;
      padding-left:  23px !important;
    }

    /* ── Status Bar ── */
    #mlb-statusbar {
      border-top: 1px solid #808080 !important;
      background: #c0c0c0 !important;
      display: flex !important;
      gap: 2px !important;
      padding: 2px 4px 3px !important;
      flex-shrink: 0 !important;
    }

    #mlb-status-panel {
      flex: 1 !important;
      min-width: 0 !important;
      border-top:    1px solid #808080 !important;
      border-left:   1px solid #808080 !important;
      border-right:  1px solid #ffffff !important;
      border-bottom: 1px solid #ffffff !important;
      padding: 1px 5px !important;
      font-size: 10px !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      font-family: 'MS Sans Serif', Tahoma, sans-serif !important;
      color: #000000 !important;
    }

    #mlb-status-panel2 {
      width: 80px !important;
      flex-shrink: 0 !important;
      border-top:    1px solid #808080 !important;
      border-left:   1px solid #808080 !important;
      border-right:  1px solid #ffffff !important;
      border-bottom: 1px solid #ffffff !important;
      padding: 1px 4px !important;
      font-size: 10px !important;
      text-align: center !important;
      font-family: 'MS Sans Serif', Tahoma, sans-serif !important;
      color: #000000 !important;
    }
  `;
}
