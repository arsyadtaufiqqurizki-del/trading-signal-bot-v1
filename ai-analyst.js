'use strict';

const axios = require('axios');

const MIMO_API_KEY = process.env.MIMO_API_KEY;
const MIMO_BASE_URL = 'https://token-plan-sgp.xiaomimimo.com/v1';
const MIMO_MODEL = 'mimo-v2.5';

const FAPI  = 'https://fapi.binance.com/fapi/v1';
const FDATA = 'https://fapi.binance.com/futures/data';
const REQ   = { timeout: 10000 };

// ─── In-memory Cache ─────────────────────────────────────────────────────────

const _store = new Map();

async function cached(key, ttlMs, fn) {
  const hit = _store.get(key);
  if (hit && Date.now() < hit.exp) return hit.val;
  if (hit) _store.delete(key);
  const result = await fn();
  if (result != null) _store.set(key, { val: result, exp: Date.now() + ttlMs });
  return result;
}

// ─── Data Fetchers ────────────────────────────────────────────────────────────

function fetchFearGreed() {
  return cached('ask_fg', 10 * 60_000, async () => {
    try {
      const { data } = await axios.get('https://api.alternative.me/fng/?limit=3', REQ);
      return data.data.map(d => ({
        value: +d.value,
        label: d.value_classification,
        timestamp: d.timestamp
      }));
    } catch { return null; }
  });
}

function fetchGlobal() {
  return cached('ask_global', 5 * 60_000, async () => {
    try {
      const { data } = await axios.get('https://api.coingecko.com/api/v3/global', REQ);
      const d = data.data;
      return {
        totalMcap: d.total_market_cap.usd,
        btcDom: d.market_cap_percentage.btc,
        ethDom: d.market_cap_percentage.eth,
        stableDom: (d.market_cap_percentage.usdt || 0) + (d.market_cap_percentage.usdc || 0),
        mcapChange24h: d.market_cap_change_percentage_24h_usd
      };
    } catch { return null; }
  });
}

function fetchTicker(symbol) {
  return cached(`ask_ticker_${symbol}`, 2 * 60_000, async () => {
    try {
      const { data } = await axios.get(`${FAPI}/ticker/24hr`, {
        params: { symbol: `${symbol}USDT` }, ...REQ
      });
      return {
        price: +data.lastPrice,
        change24h: +data.priceChangePercent,
        high24h: +data.highPrice,
        low24h: +data.lowPrice,
        volume: +data.quoteVolume
      };
    } catch { return null; }
  });
}

function fetchFundingOI(symbol) {
  return cached(`ask_foi_${symbol}`, 3 * 60_000, async () => {
    try {
      const sym = `${symbol}USDT`;
      const [fundingRes, oiHistRes, lsrRes] = await Promise.all([
        axios.get(`${FAPI}/fundingRate`, { params: { symbol: sym, limit: 1 }, ...REQ }),
        axios.get(`${FAPI}/openInterestHist`, { params: { symbol: sym, period: '1h', limit: 2 }, ...REQ }),
        axios.get(`${FDATA}/globalLongShortAccountRatio`, { params: { symbol: sym, period: '1h', limit: 1 }, ...REQ })
      ]);

      const fundingRate = fundingRes.data[0] ? +fundingRes.data[0].fundingRate * 100 : null;

      let oiValue = null, oiChange = null;
      const oiData = oiHistRes.data;
      if (oiData && oiData.length >= 2) {
        const curr = oiData[oiData.length - 1];
        const prev = oiData[oiData.length - 2];
        oiValue  = +curr.sumOpenInterestValue;
        const prevOI = +prev.sumOpenInterestValue;
        if (prevOI > 0) oiChange = ((oiValue - prevOI) / prevOI) * 100;
      }

      let lsr = null;
      if (lsrRes.data?.[0]) {
        lsr = {
          longPct:  +lsrRes.data[0].longAccount  * 100,
          shortPct: +lsrRes.data[0].shortAccount * 100,
          ratio:    +lsrRes.data[0].longShortRatio
        };
      }

      return { fundingRate, oiValue, oiChange, lsr };
    } catch { return null; }
  });
}

function fetchBtcDominance() {
  return cached('ask_btcdom', 5 * 60_000, async () => {
    try {
      const { data } = await axios.get('https://api.coingecko.com/api/v3/global', REQ);
      return data.data.market_cap_percentage.btc;
    } catch { return null; }
  });
}

function fetchRecentKlines(symbol, interval = '1h', limit = 24) {
  return cached(`ask_klines_${symbol}_${interval}`, 2 * 60_000, async () => {
    try {
      const { data } = await axios.get(`${FAPI}/klines`, {
        params: { symbol: `${symbol}USDT`, interval, limit }, ...REQ
      });
      return data.map(c => ({
        time: c[0],
        open: +c[1], high: +c[2], low: +c[3], close: +c[4],
        volume: +c[5]
      }));
    } catch { return null; }
  });
}

// ─── Symbol Extraction ────────────────────────────────────────────────────────

function extractSymbol(text) {
  const upper = text.toUpperCase();
  const symbols = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOT', 'LINK', 'MATIC',
                   'DOGE', 'SHIB', 'PEPE', 'ARB', 'OP', 'SUI', 'APT', 'NEAR', 'FIL', 'ATOM'];
  for (const s of symbols) {
    if (upper.includes(s)) return s;
  }
  return null;
}

// ─── Context Builder ──────────────────────────────────────────────────────────

async function buildContext(question) {
  const symbol = extractSymbol(question) || 'BTC';

  const [ticker, fundingOI, fearGreed, global, klines] = await Promise.allSettled([
    fetchTicker(symbol),
    fetchFundingOI(symbol),
    fetchFearGreed(),
    fetchGlobal(),
    fetchRecentKlines(symbol, '1h', 24)
  ]);

  const tickerData = ticker.status === 'fulfilled' ? ticker.value : null;
  const foiData = fundingOI.status === 'fulfilled' ? fundingOI.value : null;
  const fgData = fearGreed.status === 'fulfilled' ? fearGreed.value : null;
  const globalData = global.status === 'fulfilled' ? global.value : null;
  const klineData = klines.status === 'fulfilled' ? klines.value : null;

  // Calculate simple technicals from klines
  let technicals = null;
  if (klineData && klineData.length >= 14) {
    const closes = klineData.map(k => k.close);
    const volumes = klineData.map(k => k.volume);
    const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length);
    const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const lastVol = volumes[volumes.length - 1];

    // Simple RSI calculation
    let gains = 0, losses = 0;
    for (let i = 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / (closes.length - 1);
    const avgLoss = losses / (closes.length - 1);
    const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
    const rsi = 100 - (100 / (1 + rs));

    const high24 = Math.max(...klineData.map(k => k.high));
    const low24 = Math.min(...klineData.map(k => k.low));

    technicals = {
      sma20: +sma20.toFixed(2),
      rsi: +rsi.toFixed(1),
      volumeRatio: avgVol > 0 ? +(lastVol / avgVol).toFixed(2) : null,
      high24, low24,
      trend: closes[closes.length - 1] > sma20 ? 'ABOVE_SMA20' : 'BELOW_SMA20'
    };
  }

  return {
    symbol,
    ticker: tickerData,
    fundingOI: foiData,
    fearGreed: fgData ? { current: fgData[0], previous: fgData[1] } : null,
    global: globalData,
    technicals
  };
}

// ─── AI Analysis (Xiaomi MiMo) ───────────────────────────────────────────────

async function generateAnalysis(question, context) {
  if (!MIMO_API_KEY) return null;

  try {
    const contextStr = JSON.stringify(context, null, 2);

    const messages = [
      {
        role: 'system',
        content: `Kamu adalah Senior Crypto Analyst profesional. Jawab pertanyaan user tentang market crypto berdasarkan data yang diberikan. HANYA gunakan HTML tags ini: <b>, <i>, <code>, <pre>, <blockquote>. JANGAN gunakan tag lain (div, p, h1, br, table, dll). Pisahkan section dengan karakter ━━━━━━━━━━━━━━━━━━━━━. Gunakan emoji yang relevan. Bahasa Indonesia kasual tapi profesional. Maksimal 800 karakter, padat dan actionable. Jangan gunakan markdown.`
      },
      {
        role: 'user',
        content: `DATA MARKET SAAT INI:\n${contextStr}\n\nPERTANYAAN: ${question}\n\nFormat jawaban:\n1. Analisis data yang relevan\n2. Kesimpulan dengan confidence level (High/Medium/Low)\n3. Rekomendasi aksi (entry/exit/hold/wait)\n4. Risk warning singkat`
      }
    ];

    const { data } = await axios.post(`${MIMO_BASE_URL}/chat/completions`, {
      model: MIMO_MODEL,
      messages,
      max_completion_tokens: 1024,
      temperature: 0.7,
      top_p: 0.95,
      stream: false
    }, {
      headers: {
        'Authorization': `Bearer ${MIMO_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    const errDetail = e.response?.data?.error?.message || e.response?.data?.message || e.response?.data || e.message;
    console.error('[AI Analyst] MiMo error:', errDetail);
    return { error: errDetail };
  }
}

// ─── Fallback Analysis ────────────────────────────────────────────────────────

function buildFallbackAnalysis(question, context) {
  const { symbol, ticker, fundingOI, fearGreed, technicals } = context;
  const lines = [];

  lines.push(`<b>📊 Analisis ${symbol}</b>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  if (ticker) {
    const dir = ticker.change24h >= 0 ? '🟢' : '🔴';
    lines.push(`<b>Harga:</b> $${ticker.price.toLocaleString()} ${dir}${ticker.change24h.toFixed(2)}%`);
    lines.push(`<b>Range 24h:</b> $${ticker.low24h.toLocaleString()} — $${ticker.high24h.toLocaleString()}`);
  }

  if (technicals) {
    lines.push(`<b>RSI 14:</b> ${technicals.rsi} ${technicals.rsi > 70 ? '(Overbought)' : technicals.rsi < 30 ? '(Oversold)' : '(Normal)'}`);
    lines.push(`<b>Trend:</b> ${technicals.trend === 'ABOVE_SMA20' ? '🟢 Di atas SMA20' : '🔴 Di bawah SMA20'}`);
    if (technicals.volumeRatio) {
      lines.push(`<b>Volume:</b> ${technicals.volumeRatio}x rata-rata ${technicals.volumeRatio > 2 ? '⚠️ Spike!' : ''}`);
    }
  }

  if (fundingOI) {
    if (fundingOI.fundingRate !== null) {
      const fLabel = fundingOI.fundingRate > 0.01 ? '(Long heavy)' : fundingOI.fundingRate < -0.01 ? '(Short heavy)' : '(Netral)';
      lines.push(`<b>Funding:</b> ${fundingOI.fundingRate.toFixed(4)}% ${fLabel}`);
    }
    if (fundingOI.oiChange !== null) {
      lines.push(`<b>OI Change:</b> ${fundingOI.oiChange > 0 ? '+' : ''}${fundingOI.oiChange.toFixed(2)}%`);
    }
    if (fundingOI.lsr) {
      lines.push(`<b>L/S Ratio:</b> Long ${fundingOI.lsr.longPct.toFixed(1)}% / Short ${fundingOI.lsr.shortPct.toFixed(1)}%`);
    }
  }

  if (fearGreed?.current) {
    lines.push(`<b>Fear & Greed:</b> ${fearGreed.current.value} (${fearGreed.current.label})`);
  }

  lines.push(`\n⚠️ <i>AI analysis unavailable — data ditampilkan apa adanya</i>`);

  return lines.join('\n');
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

async function handleAskQuestion(bot, chatId, question) {
  if (!question || question.trim().length < 3) {
    await bot.sendMessage(chatId,
      `🤖 <b>AI Market Analyst</b>\n\n` +
      `Tanya apa saja tentang market crypto!\n\n` +
      `<b>Contoh:</b>\n` +
      `• /ask kenapa BTC turun hari ini?\n` +
      `• /ask ETH atau SOL yang lebih bagus untuk long?\n` +
      `• /ask kapan waktu terbaik entry BTC?\n` +
      `• /ask apa dampak NFP ke crypto?`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const loadingMsg = await bot.sendMessage(chatId, '🧠 <i>Sedang menganalisis...</i>', { parse_mode: 'HTML' });

  try {
    const context = await buildContext(question);
    const aiResult = await generateAnalysis(question, context);

    let analysis;
    if (aiResult && typeof aiResult === 'string') {
      analysis = aiResult;
    } else {
      const errorMsg = aiResult?.error ? `\n⚠️ <i>MiMo AI error: ${aiResult.error}</i>\n` : '';
      analysis = buildFallbackAnalysis(question, context) + errorMsg;
    }

    // Clean up: ensure HTML is valid for Telegram
    analysis = analysis
      .replace(/```html\s*/gi, '')
      .replace(/```\s*/gi, '')
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/<\/?(?:div|p|br|hr|span|table|tr|td|th|ul|ol|li|h[1-6]|section|article|header|footer|main|nav|aside|figure|figcaption|img|video|audio|source|form|input|button|select|option|textarea|label|fieldset|legend|datalist|output|progress|meter|details|summary|dialog|slot|template|canvas|svg|path|rect|circle|ellipse|line|polyline|polygon|text|g|defs|use|symbol|marker|pattern|clipPath|mask|filter|feBlend|feColorMatrix|feComponentTransfer|feComposite|feConvolveMatrix|feDiffuseLighting|feDisplacementMap|feFlood|feGaussianBlur|feImage|feMerge|feMergeNode|feMorphology|feOffset|feSpecularLighting|feTile|feTurbulence|foreignObject)[^>]*\/?>/gi, '')
      .replace(/<\/?(?:strong|em|ins|del|strike|tg-spoiler)\b[^>]*>/gi, (tag) => {
        const t = tag.toLowerCase();
        if (t.includes('strong')) return t.replace('strong', 'b');
        if (t.includes('em')) return t.replace('em', 'i');
        if (t.includes('ins')) return t.replace('ins', 'u');
        if (t.includes('del') || t.includes('strike')) return t.replace(/del|strike/, 's');
        if (t.includes('tg-spoiler')) return tag;
        return tag;
      });

    const MAX = 4000;
    if (analysis.length <= MAX) {
      await bot.editMessageText(analysis, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
    } else {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
      const chunks = [];
      const lines = analysis.split('\n');
      let chunk = '';
      for (const line of lines) {
        if ((chunk + line + '\n').length > MAX) {
          if (chunk) chunks.push(chunk);
          chunk = line + '\n';
        } else {
          chunk += line + '\n';
        }
      }
      if (chunk) chunks.push(chunk);
      for (const c of chunks) {
        await bot.sendMessage(chatId, c, { parse_mode: 'HTML', disable_web_page_preview: true });
      }
    }
  } catch (e) {
    console.error('[AI Analyst] Error:', e.message);
    await bot.editMessageText(
      `❌ Gagal menganalisis: ${e.message}\n\nCoba lagi atau gunakan command spesifik seperti /high, /outlook, /onchain.`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'HTML'
      }
    );
  }
}

module.exports = { handleAskQuestion };
