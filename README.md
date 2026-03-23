# 🦈 MemeLord Site Blocker

![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-f0db4f.svg)
![Chrome](https://img.shields.io/badge/Browser-Chrome-277beb.svg)
![Manifest](https://img.shields.io/badge/Manifest-V3-blue.svg)

A Chrome extension that blocks distracting websites and roasts you with an **AI-generated Shark Tank USA meme** every time you try to visit one. Each meme is custom-generated for the specific site you're trying to visit — YouTube gets a different meme than Reddit, TikTok, or Netflix.

Powered by the [MemeLord API](https://www.memelord.com).

---

## ✨ Features

- 🦈 **Shark Tank themed memes** — every blocked page shows a freshly AI-generated Shark Tank meme tailored to the site you tried to visit
- 🎯 **Per-site custom prompts** — edit exactly what scenario gets sent to the AI for each blocked site
- 🔄 **Generate New Meme** button — get a different meme without unblocking the site
- 📋 **12 sites blocked by default** — the most common distracting sites are pre-loaded on install
- ➕ **Add any site** — block any domain beyond the defaults
- 🗑️ **Delete sites** — remove any site from your block list
- 🎨 **Global prompt fallback** — set a catch-all prompt template for sites not in the known list
- 💾 **24-hour meme cache** — memes are cached so the same site doesn't burn API credits on every visit
- 🔑 **API key management** — enter your MemeLord API key directly in the popup, no code editing required
- 🔒 **Security-first** — HTTPS-only image loading, sender validation, prompt sanitization

---

## 📦 Default Blocked Sites

The following sites are automatically blocked when you install the extension. Each has its own custom Shark Tank meme scenario built in:

| Site | Shark Tank Scenario |
|------|-------------------|
| `youtube.com` | 9 hours of YouTube reaction videos. Mark Cuban facepalms. |
| `twitter.com` | Business idea from doom-scrolling at 3am. "I got 14 likes on a tweet." |
| `x.com` | Go-to-market strategy from quote-tweets. "I have 200 followers." |
| `reddit.com` | 6 hours in rabbit holes. "I've seen better plans on a napkin." |
| `facebook.com` | All day in Facebook groups. "I got 47 angry reacts." |
| `instagram.com` | Great aesthetic. No product. No revenue. No plan. |
| `tiktok.com` | Opened for 5 minutes. Lost 4 hours. Zero MVP progress. |
| `netflix.com` | "Just one more episode" ×12. Asks sharks for $1M. |
| `twitch.tv` | Watched others succeed with an idea sitting in their head. |
| `linkedin.com` | 10,000 followers. Zero revenue. "That is not a business." |
| `pinterest.com` | 400 inspiration boards. Zero execution. Tank goes silent. |
| `amazon.com` | Funding the enemy instead of building a competitor. |

---

## 📥 Installation

1. **Download** — clone or download this repository as a ZIP and extract it
2. **Open Chrome Extensions** — go to `chrome://extensions/` in your browser
3. **Enable Developer Mode** — toggle it on in the top-right corner
4. **Load Unpacked** — click "Load unpacked" and select the extracted folder
5. **Pin the extension** — click the puzzle icon in Chrome's toolbar → pin MemeLord Site Blocker

> ⚠️ Keep the extension folder in a permanent location (e.g. `Documents/Extensions/`). Chrome links directly to the folder — if you move or delete it, the extension will break and you'll need to reload it.

---

## 🚀 How to Use

### Step 1 — Get a MemeLord API Key

1. Sign up at [memelord.com](https://www.memelord.com)
2. Go to Developer Settings and generate an API key (format: `mlord_live_...`)
3. Each meme generation costs 1 credit

### Step 2 — Enter Your API Key

1. Click the MemeLord Site Blocker icon in Chrome's toolbar
2. Scroll to the **"MemeLord API Key"** section
3. Paste your key (format: `mlord_live_...`) and click **Save**
4. A green confirmation shows your key is saved

### Step 3 — Manage Blocked Sites

The 12 default sites are pre-loaded. To manage them:

- **Add a site** — type a domain (e.g. `notion.so`) in the "Add to Block List" field and click **Block**
- **Remove a site** — click the 🗑️ trash icon next to any site
- **Edit a site's meme prompt** — click the ✏️ pencil icon to expand the prompt editor for that site

### Step 4 — Customise Meme Prompts (Optional)

#### Per-site prompts
Click ✏️ next to any blocked site to open its prompt editor:
- The textarea is pre-filled with the current prompt (built-in or your previous custom one)
- Edit it to anything you want, then click **Save**
- A **"custom"** badge appears on sites with overridden prompts
- Click **Reset** to revert back to the built-in Shark Tank scenario
- Saving a new prompt automatically clears that site's cached meme so the next visit regenerates it

#### Global fallback prompt
In the **"Meme Style / Prompt"** section at the bottom:
- Use `{site}` as a placeholder for the blocked site's domain
- Example: `Shark Tank USA meme where Kevin O'Leary refuses to invest in someone who spent all day on {site}`
- This applies to any site that doesn't have a per-site prompt set — it does **not** override per-site prompts

### Step 5 — Get Roasted

Visit a blocked site and see your personalised Shark Tank meme. Hit **🎲 Generate New Meme** if you want a fresh one.

---

## ⚙️ Prompt Priority

When generating a meme for a blocked site, the following order is used:

```
1. Per-site custom prompt   (saved via ✏️ editor in popup)
        ↓ if not set
2. Built-in Shark Tank prompt  (the 12 defaults in the table above)
        ↓ if site not in list
3. Global template prompt   (saved in "Meme Style / Prompt" section, uses {site})
        ↓ if not set
4. Generic Shark Tank fallback  (auto-generated for any site)
```

---

## 🗂️ Project Structure

```
MemeLord-Site-Blocker/
├── manifest.json         # Extension manifest (MV3)
├── background.js         # Service worker: API calls, caching, message routing
├── contentScript.js      # Injected into blocked pages: renders the meme UI
├── config.js             # API configuration (URL, cache TTL, defaults)
├── .env                  # API key reference (not read at runtime, not committed)
├── .gitignore            # Ignores .env
├── images/               # Extension icons
└── popup/
    ├── popup.html        # Extension popup UI
    ├── popup.js          # Popup logic: site management, prompt editors, API key
    └── popup.css         # Popup styles
```

---

## 🔐 Security Notes

- **API key storage** — your MemeLord key is stored in `chrome.storage.sync` (encrypted by Chrome, synced across your signed-in devices). It is never logged or sent anywhere except the MemeLord API endpoint.
- **HTTPS only** — meme image URLs are validated to be `https://` before being loaded into the page.
- **Message validation** — the background service worker only processes messages from the extension itself, blocking any external pages from sending commands.
- **Prompt sanitisation** — custom prompts are capped at 500 characters and stripped of null bytes before storage and API use.
- **config.js** — this file contains a placeholder key. If you hardcode your real key here, be careful not to commit it to a public repository. Use the popup's API key field instead.

---

## 🛠️ Configuration Reference

| Setting | Where | Description |
|---------|-------|-------------|
| MemeLord API Key | Popup → API Key section | Required for meme generation |
| Per-site prompt | Popup → ✏️ next to each site | Custom AI prompt for that site |
| Global template | Popup → Meme Style section | Fallback for unlisted sites; use `{site}` |
| Cache TTL | `config.js` → `MEME_CACHE_TTL_MS` | How long memes are cached (default: 24h) |
| Meme category | `config.js` → `DEFAULT_CATEGORY` | `"trending"` or `"classic"` |
| NSFW | `config.js` → `INCLUDE_NSFW` | Include NSFW templates (default: `false`) |

---

## ❤️ Credits

- Original extension by Michelle Flandin
- Meme generation powered by [MemeLord](https://www.memelord.com)
- Inspired by [shark-tank-theme-site-blocker](https://github.com/Pankajtanwarbanna/shark-tank-theme-site-blocker) by Pankaj Tanwar Banna
