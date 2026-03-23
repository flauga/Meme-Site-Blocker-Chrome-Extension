// ============================================================
// MemeLord API Configuration
// ============================================================
// Copy your API key from .env into MEMELORD_API_KEY below,
// OR enter it directly in the extension popup (recommended).
// Get your key at https://www.memelord.com
// ============================================================

const CONFIG = {
  MEMELORD_API_KEY: "mlord_live_XXXXX",        // Paste your key here, or use the popup
  MEMELORD_API_URL: "https://www.memelord.com/api/v1/ai-meme",
  MEME_CACHE_TTL_MS: 24 * 60 * 60 * 1000,     // Cache memes for 24 hours
  DEFAULT_CATEGORY: "trending",                 // "trending" or "classic"
  INCLUDE_NSFW: false,
  MEME_COUNT: 1,                               // Number of memes to request per call
};
