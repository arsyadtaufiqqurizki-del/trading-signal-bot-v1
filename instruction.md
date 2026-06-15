# 📘 Codebase Instruction & Knowledge Base

> Dokumen ini berisi pemahaman menyeluruh tentang codebase trading bot.
> Digunakan sebagai referensi untuk pengembangan dan debugging.
> Terakhir diperbarui: 16 Juni 2026

---

## 🏗️ ARSITEKTUR UMUM

| Aspek | Detail |
|---|---|
| **Runtime** | Node.js 20, CommonJS (`"type": "commonjs"`) |
| **Deploy** | Google Cloud Run (asia-southeast2) |
| **Interface** | Telegram Bot via `node-telegram-bot-api` |
| **AI** | OpenRouter API (multi-model fallback: minimax, hermes-3, gemma-4, gpt-oss-120b) + Google Gemini |
| **Persistence** | GitHub Gist (signal performance), local JSON (crypto alerts) |
| **Language** | Bahasa Indonesia (UI), English (code) |
| **Architecture** | Modular — setiap file = self-contained feature module |

---

## 📂 STRUKTUR DIRECTORY

```
Trading bot v1/
├── api/
│   ├── cron.js                  # Cron endpoint
│   └── webhook.js               # ★ CORE ROUTER — Telegram webhook command handler
├── .github/workflows/
│   ├── deploy.yml               # CI/CD → Google Cloud Run
│   └── cron.yml                 # Hourly auto-scan cron
├── node_modules/
│
├── index.js                     # CLI entry point (one-shot scan + Telegram send)
├── server.js                    # ★ Express HTTP server (API + webhook + scheduler)
├── set-webhook.js               # Utility to register Telegram webhook
│
├── binance.js                   # Binance API client
├── coingecko.js                 # CoinGecko API client
├── indicators.js                # Technical indicators library (17+ indicators)
├── scanner.js                   # Main signal scanner (multi-pair, multi-TF)
├── analyzer.js                  # Signal formatter untuk /high
├── fast-scanner.js              # Fast scanner (15m-focused, 50 pairs)
├── fast-analyzer.js             # Fast signal formatter untuk /fast
├── utils.js                     # Utility functions (fmt, pct, nowWIB, getSession, escMd)
│
├── outlook.js                   # Market outlook engine (/outlook)
├── quant.js                     # Quant analysis (/quant, /quant reversion)
├── liq.js                       # Liquidation & L/S ratio (/liq)
├── onchain.js                   # On-chain analysis (/onchain)
├── polymarket.js                # Polymarket prediction data (/poly)
├── news.js                      # Daily market news (/news)
├── bloomberg.js                 # Bloomberg-style news (/blom)
├── stock.js                     # Indonesian stock analysis (/stock)
├── dex.js                       # DEX token monitor (/dex)
├── deribit.js                   # Deribit Options Flow (/options) ★ BARU
├── bola.js                      # World Cup 2026 predictor (/bola) ★ BARU
├── economic-calendar.js         # Economic event calendar (Finnhub)
├── crypto-analyzer.js           # Crypto impact analysis (/crypto)
├── crypto-alerts.js             # Auto-monitoring crypto event alerts
├── crypto-impact-tracker.js     # Tracks economic event impact on crypto
├── ai-analyst.js                # Conversational AI Analyst (/ask)
├── price-monitor.js             # Real-time price monitoring
├── content_generator.js         # AI content generation (/create)
├── social_scanner.js            # Social/news trend scanner
├── trend_analyzer.js            # Trend analysis engine (/trend)
├── alert-storage.js             # Alert persistence (local JSON)
├── performance.js               # Signal performance tracking (GitHub Gist)
│
├── package.json
├── Dockerfile
├── inovation.md                 # Innovation roadmap
└── instruction.md               # ★ File ini
```

---

## 🔌 DEPENDENCIES (package.json)

```json
{
  "@google/generative-ai": "^0.24.1",   // Google Gemini AI
  "axios": "^1.15.2",                     // HTTP client
  "cors": "^2.8.6",                       // Express CORS
  "dotenv": "^17.4.2",                    // Environment variables
  "express": "^5.2.1",                    // HTTP server
  "node-telegram-bot-api": "^0.67.0",     // Telegram Bot API
  "rss-parser": "^3.13.0",               // RSS/Atom feed parser
  "yahoo-finance2": "^3.14.0"            // Yahoo Finance data
}
```

**Implicit (Node built-in):** `https`, `crypto`, `fs`, `path`

---

## 📡 EXTERNAL APIs

| API | Base URL | Auth | Used By |
|---|---|---|---|
| Binance Spot | `https://api.binance.com/api/v3` | None | binance.js |
| Binance Futures | `https://fapi.binance.com/fapi/v1` | None | binance.js, liq.js, outlook.js |
| Binance Futures Data | `https://fapi.binance.com/futures/data` | None | outlook.js, liq.js |
| CoinGecko | `https://api.coingecko.com/api/v3` | None | coingecko.js, outlook.js, onchain.js |
| Fear & Greed | `https://api.alternative.me/fng/` | None | outlook.js, onchain.js |
| Polymarket | `https://gamma-api.polymarket.com/markets` | None | polymarket.js, outlook.js |
| DexScreener | `https://api.dexscreener.com` | None | dex.js |
| Deribit | `https://www.deribit.com/api/v2/public` | None | deribit.js ★ |
| Yahoo Finance | via `yahoo-finance2` SDK | None | stock.js, news.js |
| Finnhub | via SDK | API Key | economic-calendar.js |
| Blockchain.info | `https://blockchain.info/stats` | None | onchain.js |
| DefiLlama | `https://api.llama.fi/v2` | None | onchain.js |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | API Key | news.js, bloomberg.js, content_generator.js, trend_analyzer.js, bola.js |
| Football-Data.org | `https://api.football-data.org/v4` | API Key | bola.js ★ |
| Xiaomi MiMo | `https://api.xiaomimimo.com/v1` | API Key | ai-analyst.js ★ |
| Google Gemini | via `@google/generative-ai` SDK | API Key | outlook.js, fast-analyzer.js, content_generator.js |
| GitHub Gist | `https://api.github.com/gists` | Token | performance.js |
| RSS Feeds | Various (CNBC, BBC, NYT, Reuters, FT, etc.) | None | news.js, bloomberg.js, social_scanner.js |

---

## 📋 COMMAND REGISTRY

Commands di-register di `api/webhook.js` via if/else chain.

| Command | Module | Handler | Deskripsi |
|---|---|---|---|
| `/start` | inline | help menu | Menu bantuan |
| `/high [PAIR]` | `analyzer.js` | `runAnalysis` / `runAnalysisPair` | High-probability signal scan |
| `/fast [PAIR]` | `fast-analyzer.js` | `runFastAnalysis` | Rapid signal scan (15m) |
| `/outlook [sub]` | `outlook.js` | `runOutlook` + variants | Market outlook 7-day |
| `/outlook macro` | `outlook.js` | `runOutlookMacro` | Macro outlook only |
| `/outlook scenario` | `outlook.js` | `runOutlookScenario` | Scenario analysis only |
| `/outlook sector` | `outlook.js` | `runOutlookSector` | Sector rotation |
| `/outlook PAIR` | `outlook.js` | `runOutlookPair` | Per-pair outlook |
| `/options [BTC\|ETH]` | `deribit.js` | `runOptions` | Deribit options flow ★ |
| `/options unusual` | `deribit.js` | `runOptionsUnusual` | Unusual activity scan ★ |
| `/quant [reversion]` | `quant.js` | `runQuant` / `runQuantReversion` | Quant momentum & mean reversion |
| `/onchain [sub]` | `onchain.js` | `runOnchain` | On-chain analysis |
| `/liq [whale\|PAIR]` | `liq.js` | `runLiqOverview` + variants | Liquidation monitor |
| `/poly [sub]` | `polymarket.js` | `runPolyOverview` + variants | Prediction market |
| `/stock [TICKER]` | `stock.js` | `runStockOverview` / `runStockDetail` | IDX stock analysis |
| `/dex [sub]` | `dex.js` | `runDexOverview` + variants | DEX token monitor |
| `/ask <question>` | `ai-analyst.js` | `handleAskQuestion` | Conversational AI Analyst ★ |
| `/news` | `news.js` | `getNewsData` | Daily news report |
| `/blom [sub]` | `bloomberg.js` | `runBloombergOverview` + variants | Bloomberg-style news |
| `/crypto [sub]` | `crypto-analyzer.js` | various | Crypto event impact |
| `/trend [sub]` | `social_scanner.js` + `trend_analyzer.js` | various | Social trend analysis |
| `/create [sub] <kw>` | `content_generator.js` | various | AI content generation |
| `/bola` | `bola.js` | `runBola` | Hasil & jadwal Piala Dunia 2026 hari ini ★ |
| `/bola jadwal` | `bola.js` | `runBolaJadwal` | Jadwal pertandingan mendatang ★ |
| `/bola hasil` | `bola.js` | `runBolaHasil` | Hasil pertandingan terbaru ★ |
| `/bola grup` | `bola.js` | `runBolaGrup` | Klasemen 12 grup WC 2026 ★ |
| `/bola prediksi [T1 T2]` | `bola.js` | `runBolaPrediksi` | Prediksi AI match (openai/gpt-oss-120b:free) ★ |
| `/bola h2h T1 T2` | `bola.js` | `runBolaH2H` | Head-to-head history 2 tim ★ |
| `/result PAIR DIR OUT` | `performance.js` | `updateResult` | Record signal result |
| `/stats [days]` | `performance.js` | `getStats` | Performance stats |
| `/pending` | `performance.js` | `getPending` | Pending signals |
| `/status` | inline | health check | Bot status |
| `/list coin` | inline | list coins | Registered coins |

---

## 🔧 CODE PATTERNS & CONVENTIONS

### 1. In-memory Cache with TTL
```javascript
const _store = new Map();
async function cached(key, ttlMs, fn) {
  const hit = _store.get(key);
  if (hit && Date.now() < hit.exp) return hit.val;
  if (hit) _store.delete(key);
  const result = await fn();
  if (result != null) _store.set(key, { val: result, exp: Date.now() + ttlMs });
  return result;
}
```
Digunakan di: `outlook.js`, `stock.js`, `deribit.js`

### 2. API Call Pattern (Axios + Timeout)
```javascript
const REQ = { timeout: 10000 };
const { data } = await axios.get(url, { params, ...REQ });
```

### 3. Telegram Message Pattern
```javascript
await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
await bot.sendMessage(chatId, text, { parse_mode: 'HTML', disable_web_page_preview: true });
```

### 4. HTML Formatting
```html
<b>Bold</b>  <i>Italic</i>  <code>Monospace</code>
<a href="url">Link</a>
&amp;  &lt;  &gt;  &quot;
```

### 5. Visual Elements
```
Progress bar: '█'.repeat(filled) + '░'.repeat(10 - filled)
Separator:    ━━━━━━━━━━━━━━━━━━━━━━━━
Long:         🟢  Short: 🔴
```

### 6. Lazy Imports (inside handlers)
```javascript
} else if (text.startsWith('/options')) {
  const { runOptions } = require('../deribit');
  await runOptions(bot, chatId, 'BTC');
}
```

### 7. Long Message Splitting
```javascript
const MAX = 4000;
if (txt.length <= MAX) {
  await bot.sendMessage(chatId, txt, { parse_mode: 'HTML' });
} else {
  // Split by lines into chunks
}
```

### 8. Parallel Data Fetching
```javascript
const [a, b, c] = await Promise.all([fetchA(), fetchB(), fetchC()]);
const results = await Promise.allSettled(PAIRS.map(p => analyze(p)));
```

---

## ✅ SUDAH DIPelajari DETAIL

| File | Lines | Pemahaman |
|---|---|---|
| `api/webhook.js` | 1097 | Full — semua command routing, if/else chain, help menu |
| `outlook.js` | 1455 | Full — fetchers, bias score, cycle detection, scenarios, report builder, AI narrative |
| `binance.js` | ~80 | Full — getKlines, getTicker, getAllTickers, getFundingRate, getOpenInterest, fetchFundingOI |
| `indicators.js` | ~400 | Full — 17+ indicators (EMA, RSI, ATR, ADX, MACD, StochRSI, VWAP, CVD, Fib, S/R, BOS, CHoCH, Divergence, FVG, OrderBlocks, CandlePattern, LiquiditySweep) |
| `scanner.js` | ~500 | Full — 50 pairs, 4 tiers, multi-TF (4H/1H/15M), 16-factor weighted scoring |
| `analyzer.js` | ~300 | Full — signal formatting, HTML report, TradingView link |
| `fast-scanner.js` | ~200 | Full — 15m-focused, 50 pairs, speed-optimized |
| `fast-analyzer.js` | ~250 | Full — fast signal formatting + Gemini AI verification |
| `liq.js` | 421 | Full — force orders, L/S ratios (global/top account/top position), OI history, taker volume, whale detection |
| `onchain.js` | 299 | Full — Fear&Greed, CoinGecko global, BTC stats (blockchain.info), DeFi TVL (DefiLlama), ETH staking |
| `utils.js` | 31 | Full — fmt, pct, nowWIB, getSession, escMd |
| `deribit.js` | 309 | Full — buat sendiri (PCR, Max Pain, IV, GEX, Unusual Activity, report builder) |
| `bola.js` | ~710 | Full — WC 2026 predictor: fetchers, cache (6 TTL), FLAG map 55+ tim, formatters HTML, AI prediction (openai/gpt-oss-120b:free via OpenRouter), 6 exported handlers ★ |
| `ai-analyst.js` | ~200 | Full — buat sendiri (context gathering, Xiaomi MiMo AI, fallback analysis, /ask handler) ★ |
| `package.json` | ~20 | Full — semua dependencies |
| `server.js` | 209 | Full — Express server, 6 REST API endpoints, webhook/cron route, auto-news scheduler (10:00 WIB) |
| `index.js` | 113 | Full — CLI entry point, one-shot scanAllPairs + Telegram send, formatSignal |
| `coingecko.js` | 30 | Full — getGlobalSentiment (BTC dominance + market condition), getTrendingCoins (top 5) |
| `set-webhook.js` | 29 | Full — Telegram setWebhook utility via CLI argument |
| `.github/workflows/deploy.yml` | 37 | Full — CI/CD: push main → build Docker → push to Artifact Registry → deploy Cloud Run (asia-southeast2) |
| `.github/workflows/cron.yml` | 16 | Full — Hourly cron: GET /api/cron with x-cron-secret header |
| `Dockerfile` | 18 | Full — node:20-slim, npm install --production, CMD node server.js |
| `.dockerignore` | 9 | Full — excludes: node_modules, .env, .git, .github, .vercel, .gemini, tmp |
| `.gitignore` | 4 | Full — excludes: .env, node_modules/, *.log, signals_data.json |
| `inovation.md` | 668 | Full — Innovation roadmap, 17 items with priority matrix |
| `signal_high_upgrade.md` | 257 | Full — /high upgrade roadmap, 13 items (2 done: Funding Rate + OI Change) |
| `upgrade_v1.md` | 538 | Full — v1 upgrade roadmap, 15 items (P0-P3) with implementation matrix |
| `CRYPTO_ALERTS_GUIDE.md` | 348 | Full — Complete guide to /crypto alerts: manual, auto, report, active, stop |
| `README.md` | 37 | Full — Project overview, 3 feature pillars, tech stack |
| `.claude/settings.local.json` | 38 | Full — Claude Code permission rules for bash/PowerShell commands |

---

## 🔄 SUDAH DIPelajari SEBAGIAN

| File | Lines | Pemahaman | Yang Diketahui |
|---|---|---|---|
| `stock.js` | 584 | Tinggi | Struktur, exports, Yahoo Finance integration, RSI/MACD/BB/ATR, confluence scoring, LQ45 |
| `dex.js` | 601 | Tinggi | Struktur, exports, DexScreener API, risk scoring, multi-chain (SOL/BNB/ETH/BASE) |
| `polymarket.js` | 292 | Tinggi | Struktur, exports, regex classification, weighted scoring |
| `news.js` | 259 | Tinggi | Struktur, exports, RSS feeds, OpenRouter AI summary |
| `bloomberg.js` | 343 | Tinggi | Struktur, exports, multi-source RSS, category filtering, AI analyst |
| `content_generator.js` | 629 | Tinggi | Struktur, exports, multi-platform, multi-tone, OpenRouter |
| `social_scanner.js` | 134 | Tinggi | Struktur, exports, RSS scanning, Indonesian news sources |
| `trend_analyzer.js` | 287 | Tinggi | Struktur, exports, trend scoring, velocity, AI insights |
| `economic-calendar.js` | 133 | Tinggi | Struktur, exports, Finnhub API, event filtering, crypto impact mapping |
| `crypto-analyzer.js` | 148 | Tinggi | Struktur, exports, event + price orchestration |
| `crypto-alerts.js` | 231 | Tinggi | Struktur, exports, price monitoring, auto-scheduling |
| `crypto-impact-tracker.js` | 180 | Tinggi | Struktur, exports, CoinGecko prices, Binance klines, impact scoring |
| `performance.js` | 214 | Tinggi | Struktur, exports, GitHub Gist CRUD, win rate, PnL tracking |
| `price-monitor.js` | 105 | Tinggi | Struktur, exports, polling, concurrent monitors |
| `alert-storage.js` | 127 | Tinggi | Struktur, exports, local JSON persistence |

---

## ❌ BELUM DIPelajari

✅ **Semua file sudah dipelajari — 100% codebase coverage.**

---

## 📊 MODULE DEPENDENCY GRAPH

```
server.js ──→ api/webhook.js ──→ semua module
         ──→ scanner.js ──→ binance.js, indicators.js
         ──→ analyzer.js ──→ scanner.js, performance.js
         ──→ news.js ──→ coingecko.js, rss-parser, OpenRouter

outlook.js ──→ binance.js, coingecko.js, economic-calendar.js
           ──→ polymarket.js, deribit.js ★, Gemini AI

deribit.js ──→ axios (Deribit public API) ★

ai-analyst.js ──→ axios (Xiaomi MiMo API) ★

liq.js ──→ axios (Binance Futures Data API)
onchain.js ──→ axios (blockchain.info, CoinGecko, DefiLlama)
stock.js ──→ yahoo-finance2
dex.js ──→ axios (DexScreener)
performance.js ──→ https (GitHub Gist API)

content_generator.js ──→ trend_analyzer.js, OpenRouter
crypto-alerts.js ──→ price-monitor.js, alert-storage.js, economic-calendar.js
crypto-analyzer.js ──→ economic-calendar.js, crypto-impact-tracker.js
bloomberg.js ──→ rss-parser, OpenRouter
news.js ──→ rss-parser, OpenRouter
```

---

## 🚀 DEPLOYMENT FLOW

```
git push main
  → GitHub Actions: deploy.yml
    → Build Docker image (node:20-slim)
    → Push to Artifact Registry (asia-southeast1)
    → Deploy to Cloud Run (asia-southeast2)
  
GitHub Actions: cron.yml (setiap jam)
  → GET /api/cron (dengan secret header)
    → Auto-scan signals
```

---

## 📝 CATATAN PENTING

1. **Semua UI dalam Bahasa Indonesia** — code English, output Indonesia
2. **No database** — pakai GitHub Gist + local JSON file
3. **No test framework** — tidak ada unit test
4. **No TypeScript** — murni JavaScript CommonJS
5. **No bundler** — langsung Node.js
6. **Lazy imports** — module di-require() di dalam handler, bukan di top-level
7. **Monolithic flat structure** — semua 25+ module di root directory
8. **Webhook-driven** — production pakai webhook, bukan polling
9. **Dual AI** — Gemini untuk market narratives, OpenRouter untuk content/news
10. **Cache per module** — setiap module punya cache sendiri, tidak shared
