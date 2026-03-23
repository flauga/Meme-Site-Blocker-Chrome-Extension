// ============================================================
// Background Service Worker
// Handles MemeLord API calls and meme caching.
// Content scripts cannot make cross-origin fetch requests to
// external APIs directly, so all API communication lives here.
// ============================================================

importScripts("config.js");

// ── Auto-populate default blocked sites on first install ─────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.sync.get("blockedWebsitesArray", (data) => {
      if (!data.blockedWebsitesArray || data.blockedWebsitesArray.length === 0) {
        chrome.storage.sync.set({ blockedWebsitesArray: Object.keys(SHARK_TANK_PROMPTS) });
      }
    });
  }
});

// ── Message Router ───────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Security: only process messages originating from this extension itself
  if (sender.id !== chrome.runtime.id) return;

  if (message.type === "GET_MEME") {
    handleGetMeme(message.hostname)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }

  if (message.type === "REFRESH_MEME") {
    // Clear the cache for this hostname then fetch a fresh meme
    const cacheKey = buildCacheKey(message.hostname);
    chrome.storage.local.remove(cacheKey, () => {
      handleGetMeme(message.hostname)
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  if (message.type === "UPDATE_API_KEY") {
    chrome.storage.sync.set({ memelordApiKey: message.apiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_API_KEY_STATUS") {
    chrome.storage.sync.get("memelordApiKey", (data) => {
      const key = data.memelordApiKey || "";
      sendResponse({
        hasKey: key.length > 0 && key !== "mlord_live_XXXXX",
        maskedKey: key.length > 0 ? maskKey(key) : "",
      });
    });
    return true;
  }

  if (message.type === "UPDATE_PROMPT_TEMPLATE") {
    // Security: cap prompt length and strip null bytes before storing
    const raw = typeof message.template === "string" ? message.template : "";
    const sanitized = raw.replace(/\0/g, "").slice(0, 1000);
    chrome.storage.sync.set({ memelordPromptTemplate: sanitized }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_PROMPT_TEMPLATE") {
    chrome.storage.sync.get("memelordPromptTemplate", (data) => {
      sendResponse({ template: data.memelordPromptTemplate || "" });
    });
    return true;
  }

  // ── Per-site prompt management ────────────────────────────
  if (message.type === "GET_ALL_DEFAULTS") {
    // Returns built-in Shark Tank prompt strings for all known sites
    const defaults = {};
    for (const [host, arr] of Object.entries(SHARK_TANK_PROMPTS)) {
      const [label, situation] = arr;
      defaults[host] = `${label}: ${situation} Style: funny, expressive, high-energy Shark Tank panel reaction shot.`;
    }
    sendResponse({ defaults });
    return true;
  }

  if (message.type === "GET_SITE_PROMPTS") {
    chrome.storage.local.get("sitePrompts", (data) => {
      sendResponse({ sitePrompts: data.sitePrompts || {} });
    });
    return true;
  }

  if (message.type === "UPDATE_SITE_PROMPT") {
    const hostname = message.hostname;
    const raw = typeof message.prompt === "string" ? message.prompt : "";
    const sanitized = raw.replace(/\0/g, "").slice(0, 500);
    chrome.storage.local.get("sitePrompts", (data) => {
      const sitePrompts = data.sitePrompts || {};
      if (sanitized.trim() === "") {
        delete sitePrompts[hostname]; // empty = revert to built-in default
      } else {
        sitePrompts[hostname] = sanitized;
      }
      chrome.storage.local.set({ sitePrompts }, () => {
        // Clear cached meme for this site so next visit regenerates with new prompt
        chrome.storage.local.remove([`meme_cache_${hostname}`, `meme_cache_www.${hostname}`]);
        sendResponse({ success: true });
      });
    });
    return true;
  }
});

// ── Core: fetch meme (cache-first) ──────────────────────────
async function handleGetMeme(hostname) {
  const cacheKey = buildCacheKey(hostname);

  // 1. Check cache
  const stored = await chrome.storage.local.get(cacheKey);
  const cached = stored[cacheKey];
  if (cached && Date.now() - cached.timestamp < CONFIG.MEME_CACHE_TTL_MS) {
    return { success: true, imageUrl: cached.imageUrl, fromCache: true };
  }

  // 2. Resolve API key (user-saved key takes priority over config.js placeholder)
  const syncData = await chrome.storage.sync.get("memelordApiKey");
  const apiKey =
    syncData.memelordApiKey && syncData.memelordApiKey !== "mlord_live_XXXXX"
      ? syncData.memelordApiKey
      : CONFIG.MEMELORD_API_KEY;

  if (!apiKey || apiKey === "mlord_live_XXXXX") {
    return {
      success: false,
      error: "No API key configured. Please add your MemeLord API key in the extension popup.",
    };
  }

  // 3. Build prompt — priority: per-site custom → built-in Shark Tank → global template → generic fallback
  const [promptSyncData, promptLocalData] = await Promise.all([
    chrome.storage.sync.get("memelordPromptTemplate"),
    chrome.storage.local.get("sitePrompts"),
  ]);
  const sitePrompts = promptLocalData.sitePrompts || {};
  const prompt = buildPrompt(hostname, sitePrompts, promptSyncData.memelordPromptTemplate || "");
  let response;
  try {
    response = await fetch(CONFIG.MEMELORD_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        count: CONFIG.MEME_COUNT,
        category: CONFIG.DEFAULT_CATEGORY,
        include_nsfw: CONFIG.INCLUDE_NSFW,
      }),
    });
  } catch (networkErr) {
    return { success: false, error: `Network error: ${networkErr.message}` };
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    return { success: false, error: `API error ${response.status}: ${errText}` };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { success: false, error: "Invalid JSON response from MemeLord API." };
  }

  // Check top-level success flag (API may return 200 with success:false)
  if (data.success === false) {
    const apiMsg = data.message || data.error || "API returned success: false";
    return { success: false, error: `MemeLord API error: ${apiMsg}` };
  }

  // Also check the first result's own success flag
  if (data?.results?.[0]?.success === false) {
    return { success: false, error: "MemeLord could not generate a meme for this prompt. Try a different prompt." };
  }

  // Extract image URL — docs confirm shape is: { results: [{ url, ... }] }
  // Fall through to deep search only as a last resort safety net
  const imageUrl =
    data?.results?.[0]?.url ||       // ← correct per official docs
    data?.memes?.[0]?.url ||
    data?.data?.[0]?.url ||
    data?.url ||
    deepFindImageUrl(data) ||
    null;

  if (!imageUrl) {
    const topKeys = Object.keys(data || {}).join(", ");
    return {
      success: false,
      error: `MemeLord API returned no meme URL. Response keys: [${topKeys}]`,
    };
  }

  // Security: ensure the returned URL is https before caching or displaying it
  if (!isValidHttpsUrl(imageUrl)) {
    return { success: false, error: "MemeLord returned an insecure or invalid image URL." };
  }

  // 4. Cache and return
  await chrome.storage.local.set({
    [cacheKey]: { imageUrl, prompt, timestamp: Date.now() },
  });

  return { success: true, imageUrl, fromCache: false };
}

// ── Helpers ──────────────────────────────────────────────────
function buildCacheKey(hostname) {
  return `meme_cache_${hostname}`;
}

// Each entry is [sharkTankPrompt, situation description] for richer context.
// The situation is woven into the prompt so the meme image fits the blocked site.
const SHARK_TANK_PROMPTS = {
  "youtube.com": [
    "Shark Tank USA meme",
    "An entrepreneur walks into the Tank and admits they went from watching one 'How to Start a Business' video to a 6-hour rabbit hole ending at 'Top 10 Deep Sea Creatures That Shouldn't Exist.' Mark Cuban asks 'What's your product?' The founder says 'I can now identify every species of anglerfish.' Kevin O'Leary says 'You are dead to me — and so is your watch history.'"
  ],
  "twitter.com": [
    "Shark Tank USA meme",
    "A founder pitches a revolutionary product but admits they spent 5 hours today ratio'ing strangers and getting into fights about whether a hot dog is a sandwich. Barbara Corcoran asks about their customer base. The founder says 'I got mass-reported by 30 people, so engagement is through the roof.' Daymond John says 'The only thing going viral here is my disappointment.'"
  ],
  "x.com": [
    "Shark Tank USA meme",
    "An entrepreneur says they've been doing 'personal brand building' on X. Mark Cuban asks what that means. The founder says 'I reply Good morning to Elon's posts every day at 5am.' Robert Herjavec says 'That's not networking, that's a parasocial relationship with a billionaire who will never see your tweet.' Revenue: zero. Blue checkmark subscription: $8/month. All sharks out."
  ],
  "reddit.com": [
    "Shark Tank USA meme",
    "A founder says they did 'extensive market research.' Kevin O'Leary asks for the data. The founder pulls up a Reddit thread titled 'Is this business idea stupid?' with 847 comments all saying yes. The founder says 'But one guy with the username DogFart420 said it could work.' Lori Greiner physically leaves the stage."
  ],
  "facebook.com": [
    "Shark Tank USA meme",
    "An entrepreneur spent all morning in a Facebook group argument about whether essential oils can replace venture capital. They have no product, no revenue, and 14 pending Marketplace disputes. Barbara Corcoran asks 'Who is your target customer?' The founder says 'People who still use Facebook.' Mark Cuban says 'So... your parents?'"
  ],
  "instagram.com": [
    "Shark Tank USA meme",
    "A startup founder presents their brand strategy: 47 perfectly curated Instagram posts, a ring light, and zero actual products. Lori Greiner asks to see the prototype. The founder says 'It's in the Linktree.' Robert clicks it. It's another Instagram page. The sharks sit in stunned silence while the founder asks if anyone wants to do a collab."
  ],
  "tiktok.com": [
    "Shark Tank USA meme",
    "An entrepreneur opened TikTok to research competitors and emerged 5 hours later knowing three full choreographies and a pasta recipe but nothing about their own business. They pitch the sharks while involuntarily doing a trending hand gesture. Mark Cuban says 'Your attention span has been repossessed by a Chinese algorithm.' Daymond John says 'Even your pitch has a 15-second hook and no substance.'"
  ],
  "netflix.com": [
    "Shark Tank USA meme",
    "A founder asks for $1 million. Kevin O'Leary asks what they accomplished this quarter. The founder says 'I watched 3 full series, a documentary about startups, and a true crime show that I am now emotionally invested in.' Kevin says 'The only crime here is your time management.' The founder says 'Just let me finish this episode and I'll pivot.' All sharks out."
  ],
  "twitch.tv": [
    "Shark Tank USA meme",
    "An entrepreneur spent 8 hours watching someone else code on Twitch instead of coding their own app. Daymond John says 'Let me understand — you watched another person build a career while you donated your rent money in the chat?' The founder says 'But I'm a tier 3 subscriber, that's basically an investor.' Mark Cuban has already left the building."
  ],
  "linkedin.com": [
    "Shark Tank USA meme",
    "A founder posted 'Thrilled to announce I'm disrupting the space' on LinkedIn 47 times this year but has disrupted nothing. Their pitch deck is a screenshot of their own post that got 2,000 likes from other people who also have no revenue. Kevin O'Leary says 'You didn't build a company, you built a personal brand for a person who does nothing.' Barbara asks 'Did you just agree with yourself in your own comments section?' The founder says 'Engagement is engagement.'"
  ],
  "pinterest.com": [
    "Shark Tank USA meme",
    "An entrepreneur has 86 Pinterest boards: 'Dream Office,' 'CEO Aesthetic,' 'Startup Mood,' 'Fonts That Mean Business.' Lori Greiner asks to see the actual product. The founder shows a board called 'Products I Could Maybe Make Someday (Aspirational).' It has 400 pins and zero completed items. Robert Herjavec says 'You didn't build a business, you built a vision board for a business that ghosted you.'"
  ],
  "amazon.com": [
    "Shark Tank USA meme",
    "A founder says they're building an e-commerce empire. Mark Cuban asks about their store. The founder says 'Well I haven't launched yet but I did spend 4 hours on Amazon buying a standing desk, a motivational poster, and a CEO mug that says Boss Mode.' Kevin O'Leary says 'You gave Jeff Bezos your money and came here asking for mine. The audacity is the only impressive thing about this pitch.'"
  ],
};

// Priority: per-site custom → built-in Shark Tank default → global template → generic fallback
function buildPrompt(hostname, sitePrompts, globalTemplate) {
  const cleanHost = hostname.replace(/^www\./, "");

  // 1. Per-site custom prompt saved by the user
  if (sitePrompts[cleanHost]?.trim()) {
    return sitePrompts[cleanHost].trim();
  }

  // 2. Built-in Shark Tank themed prompt for known sites
  if (SHARK_TANK_PROMPTS[cleanHost]) {
    const [label, situation] = SHARK_TANK_PROMPTS[cleanHost];
    return `${label}: ${situation} Style: funny, expressive, high-energy Shark Tank panel reaction shot.`;
  }

  // 3. User's global template (for sites not in the known list)
  if (globalTemplate?.trim()) {
    return globalTemplate.trim().replace(/\{site\}/g, cleanHost);
  }

  // 4. Generic Shark Tank fallback
  return `Shark Tank USA meme: An entrepreneur walks into the Tank and admits they wasted hours on ${cleanHost} instead of building their startup. The sharks are visibly disappointed. Kevin O'Leary says "You had one job." Mark Cuban covers his face. Style: funny, expressive Shark Tank panel meme.`;
}

/**
 * Validates that a URL is a well-formed https:// URL.
 * Used to ensure we never set an http or data: URL as an image src.
 */
function isValidHttpsUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Last-resort recursive search through the API response for an https image URL.
 * Only matches strings that are https and end in a known image extension or
 * contain a known image CDN hostname — intentionally narrow to avoid false matches.
 */
function deepFindImageUrl(obj, depth = 0) {
  if (depth > 6 || obj == null) return null;

  if (typeof obj === "string") {
    // Must be https and look specifically like an image (not a tracking pixel or logo)
    if (
      /^https:\/\/.+/i.test(obj) &&
      /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(obj)
    ) {
      return obj;
    }
    return null;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = deepFindImageUrl(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof obj === "object") {
    // Check image-likely keys first
    const priorityKeys = ["url", "image_url", "image", "src", "meme_url", "download_url"];
    for (const key of priorityKeys) {
      if (obj[key] != null) {
        const found = deepFindImageUrl(obj[key], depth + 1);
        if (found) return found;
      }
    }
    for (const key of Object.keys(obj)) {
      if (priorityKeys.includes(key)) continue;
      const found = deepFindImageUrl(obj[key], depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function maskKey(key) {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 10) + "••••" + key.slice(-4);
}
