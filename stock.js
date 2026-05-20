'use strict';

const { fmt, pct, nowWIB } = require('./utils');

const { default: YahooFinance } = require('yahoo-finance2');
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

// ─── LQ45 Watchlist ───────────────────────────────────────────────────────────

const LQ45 = [
  { ticker: 'BBCA.JK',  name: 'Bank Central Asia',       sector: 'Perbankan' },
  { ticker: 'BBRI.JK',  name: 'Bank Rakyat Indonesia',   sector: 'Perbankan' },
  { ticker: 'BMRI.JK',  name: 'Bank Mandiri',            sector: 'Perbankan' },
  { ticker: 'BBNI.JK',  name: 'Bank Negara Indonesia',   sector: 'Perbankan' },
  { ticker: 'TLKM.JK',  name: 'Telkom Indonesia',        sector: 'Telekomunikasi' },
  { ticker: 'EXCL.JK',  name: 'XL Axiata',               sector: 'Telekomunikasi' },
  { ticker: 'ASII.JK',  name: 'Astra International',     sector: 'Industri' },
  { ticker: 'UNVR.JK',  name: 'Unilever Indonesia',      sector: 'Consumer Goods' },
  { ticker: 'INDF.JK',  name: 'Indofood Sukses Makmur',  sector: 'Consumer Goods' },
  { ticker: 'ICBP.JK',  name: 'Indofood CBP',            sector: 'Consumer Goods' },
  { ticker: 'KLBF.JK',  name: 'Kalbe Farma',             sector: 'Kesehatan' },
  { ticker: 'HMSP.JK',  name: 'HM Sampoerna',            sector: 'Consumer Goods' },
  { ticker: 'ADRO.JK',  name: 'Adaro Energy',            sector: 'Energi' },
  { ticker: 'BYAN.JK',  name: 'Bayan Resources',         sector: 'Energi' },
  { ticker: 'PTBA.JK',  name: 'Bukit Asam',              sector: 'Energi' },
  { ticker: 'PGAS.JK',  name: 'Perusahaan Gas Negara',   sector: 'Energi' },
  { ticker: 'ANTM.JK',  name: 'Aneka Tambang',           sector: 'Tambang' },
  { ticker: 'MDKA.JK',  name: 'Merdeka Copper Gold',     sector: 'Tambang' },
  { ticker: 'SMGR.JK',  name: 'Semen Indonesia',         sector: 'Industri' },
  { ticker: 'GOTO.JK',  name: 'GoTo Group',              sector: 'Teknologi' },
];

// ─── Cache ────────────────────────────────────────────────────────────────────

const _cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = _cache.get(key);
  if (hit && Date.now() < hit.exp) return hit.val;
  _cache.delete(key);
  const val = await fn();
  if (val != null) _cache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
}

// ─── Data Fetchers ────────────────────────────────────────────────────────────

function fetchIHSG() {
  return cached('ihsg', 3 * 60_000, async () => {
    try {
      const q = await yf.quote('^JKSE');
      return {
        price:     q.regularMarketPrice,
        change:    q.regularMarketChangePercent,
        open:      q.regularMarketOpen,
        high:      q.regularMarketDayHigh,
        low:       q.regularMarketDayLow,
        volume:    q.regularMarketVolume,
        yearHigh:  q.fiftyTwoWeekHigh,
        yearLow:   q.fiftyTwoWeekLow,
        prevClose: q.regularMarketPreviousClose,
      };
    } catch { return null; }
  });
}

function fetchQuote(ticker) {
  return cached(`q_${ticker}`, 3 * 60_000, async () => {
    try {
      const q = await yf.quote(ticker);
      return {
        price:    q.regularMarketPrice,
        change:   q.regularMarketChangePercent,
        volume:   q.regularMarketVolume,
        mktCap:   q.marketCap,
        yearHigh: q.fiftyTwoWeekHigh,
        yearLow:  q.fiftyTwoWeekLow,
        pe:       q.trailingPE,
        name:     q.shortName || q.longName,
      };
    } catch { return null; }
  });
}

function fetchHistory(ticker, days = 60) {
  return cached(`h_${ticker}_${days}`, 5 * 60_000, async () => {
    try {
      const end   = new Date();
      const start = new Date(Date.now() - days * 86_400_000);
      const rows  = await yf.historical(ticker, { period1: start, period2: end, interval: '1d' });
      return rows.map(r => ({ high: r.high, low: r.low, close: r.close, volume: r.volume }));
    } catch { return null; }
  });
}

// ─── Indicators ───────────────────────────────────────────────────────────────

function calcRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  const gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  let ag = mean(gains.slice(0, period));
  let al = mean(losses.slice(0, period));
  for (let i = period; i < gains.length; i++) {
    ag = (ag * (period - 1) + gains[i]) / period;
    al = (al * (period - 1) + losses[i]) / period;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

function calcMA(closes, period) {
  if (!closes || closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcEMAArray(values, period) {
  if (!values || values.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function calcMACD(closes) {
  if (!closes || closes.length < 35) return null;
  const ema12 = calcEMAArray(closes, 12);
  const ema26 = calcEMAArray(closes, 26);
  if (!ema12.length || !ema26.length) return null;
  // Align: ema12[0] = close[11], ema26[0] = close[25]. Offset = 14.
  const offset = 14;
  const macdLine = [];
  for (let i = offset; i < ema12.length; i++) {
    macdLine.push(ema12[i] - ema26[i - offset]);
  }
  if (macdLine.length < 9) return null;
  const signalArr = calcEMAArray(macdLine, 9);
  if (!signalArr.length) return null;
  const macd   = macdLine[macdLine.length - 1];
  const signal = signalArr[signalArr.length - 1];
  const prevMacd   = macdLine.length >= 2 ? macdLine[macdLine.length - 2] : macd;
  const prevSignal = signalArr.length >= 2 ? signalArr[signalArr.length - 2] : signal;
  return {
    macd, signal,
    hist:        macd - signal,
    isCrossUp:   macd > signal && prevMacd <= prevSignal,
    isCrossDown: macd < signal && prevMacd >= prevSignal,
    isBullish:   macd > signal,
  };
}

function calcATR(history, period = 14) {
  if (!history || history.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < history.length; i++) {
    const { high, low } = history[i];
    const prevClose = history[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcBollinger(closes, period = 20) {
  if (!closes || closes.length < period) return null;
  const slice  = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const std    = Math.sqrt(slice.reduce((a, b) => a + (b - middle) ** 2, 0) / period);
  return { upper: middle + 2 * std, middle, lower: middle - 2 * std };
}

function calcVolumeRatio(history, period = 20) {
  if (!history || history.length < period + 1) return null;
  const vols   = history.map(h => h.volume);
  const avgVol = vols.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / period;
  return avgVol > 0 ? vols[vols.length - 1] / avgVol : null;
}

// ─── Support & Resistance ─────────────────────────────────────────────────────

function findSwingLevels(history, lookback = 4) {
  if (!history || history.length < lookback * 2 + 1) return { supports: [], resistances: [] };
  const rawSup = [], rawRes = [];

  for (let i = lookback; i < history.length - lookback; i++) {
    const win = history.slice(i - lookback, i + lookback + 1);
    if (win.every(h => h.low  >= history[i].low))  rawSup.push(history[i].low);
    if (win.every(h => h.high <= history[i].high)) rawRes.push(history[i].high);
  }

  function cluster(levels) {
    if (!levels.length) return [];
    levels.sort((a, b) => a - b);
    const out = [];
    for (const lvl of levels) {
      const last = out[out.length - 1];
      if (last && Math.abs(lvl - last.price) / last.price < 0.025) {
        last.price  = (last.price * last.touches + lvl) / (last.touches + 1);
        last.touches++;
      } else {
        out.push({ price: lvl, touches: 1 });
      }
    }
    return out.sort((a, b) => b.touches - a.touches);
  }

  return { supports: cluster(rawSup), resistances: cluster(rawRes) };
}

// ─── Full Technical Analysis ──────────────────────────────────────────────────

function computeFullTechnicals(history, quote) {
  if (!history || history.length < 20) return null;

  const closes = history.map(h => h.close);
  const price  = quote.price;

  const rsi      = calcRSI(closes, 14);
  const ma20     = calcMA(closes, 20);
  const ma50     = calcMA(closes, Math.min(50, closes.length));
  const macd     = calcMACD(closes);
  const bb       = calcBollinger(closes);
  const atr      = calcATR(history, 14);
  const volRatio = calcVolumeRatio(history, 20);

  const trend = ma20 && ma50 ? (ma20 > ma50 ? 'Uptrend' : 'Downtrend') : 'Sideways';

  const { supports, resistances } = findSwingLevels(history);
  const nearestSupport    = supports.filter(s => s.price < price).sort((a, b) => b.price - a.price)[0] ?? null;
  const nearestResistance = resistances.filter(r => r.price > price).sort((a, b) => a.price - b.price)[0] ?? null;

  const yearRange = (quote.yearHigh ?? 0) - (quote.yearLow ?? 0);
  const yearPos   = yearRange > 0 ? (price - quote.yearLow) / yearRange * 100 : null;

  // ── Confluence factors ────────────────────────────────────────────────────
  const factors      = [];
  const bearishFlags = [];

  if (ma20 && ma50 && ma20 > ma50)            factors.push('Uptrend — MA20 di atas MA50');
  if (ma20 && ma50 && ma20 < ma50)            bearishFlags.push('Downtrend — MA20 di bawah MA50');

  if (price && ma20 && price > ma20)          factors.push('Harga di atas MA20');
  else if (price && ma20)                     bearishFlags.push('Harga di bawah MA20');

  if (price && ma50 && price > ma50)          factors.push('Harga di atas MA50');
  else if (price && ma50)                     bearishFlags.push('Harga di bawah MA50');

  if (rsi != null) {
    if (rsi >= 40 && rsi < 70)               factors.push(`RSI ${fmt(rsi, 1)} — Zona Bullish`);
    else if (rsi < 35)                        factors.push(`RSI ${fmt(rsi, 1)} — Oversold (Potensi Pantulan)`);
    else if (rsi >= 70)                       bearishFlags.push(`RSI ${fmt(rsi, 1)} — Overbought ⚠️`);
    else                                      bearishFlags.push(`RSI ${fmt(rsi, 1)} — Zona Bearish`);
  }

  if (macd) {
    if (macd.isCrossUp)                       factors.push('MACD Golden Cross — Momentum Bullish ⭐');
    else if (macd.isBullish)                  factors.push('MACD Bullish (di atas Signal Line)');
    else if (macd.isCrossDown)                bearishFlags.push('MACD Death Cross — Momentum Bearish ⭐');
    else                                      bearishFlags.push('MACD Bearish (di bawah Signal Line)');
  }

  if (volRatio != null) {
    if (volRatio >= 1.5 && (quote.change ?? 0) >= 0) factors.push(`Volume ${fmt(volRatio, 1)}x rata-rata — Konfirmasi Bullish`);
    else if (volRatio >= 1.5 && (quote.change ?? 0) < 0) bearishFlags.push(`Volume Tinggi ${fmt(volRatio, 1)}x saat Harga Turun ⚠️`);
    else if (volRatio >= 1.2)                           factors.push(`Volume ${fmt(volRatio, 1)}x rata-rata — Di Atas Normal`);
  }

  if (bb && price > bb.middle)               factors.push('Harga di atas Bollinger Middle Band');
  else if (bb && price <= bb.middle)          bearishFlags.push('Harga di bawah Bollinger Middle Band');

  if (nearestSupport && Math.abs(price - nearestSupport.price) / price < 0.03)
    factors.push(`Dekat Support Kuat (${fmtIdr(nearestSupport.price)}, ${nearestSupport.touches}x tested)`);

  if (yearPos != null && yearPos >= 35 && yearPos <= 75)
    factors.push(`Posisi 52W Sehat (${fmt(yearPos, 0)}%)`);

  const score = factors.length;
  let confLevel = 'Low';
  if (score >= 7)      confLevel = 'Very High ⭐';
  else if (score >= 5) confLevel = 'High';
  else if (score >= 3) confLevel = 'Medium';

  // ── Signal direction ──────────────────────────────────────────────────────
  let signal = 'NEUTRAL';
  if (score >= 5 && bearishFlags.length <= 1)                                          signal = 'BULLISH';
  else if (bearishFlags.length >= 3 || (ma20 && ma50 && ma20 < ma50 && rsi != null && rsi < 50)) signal = 'BEARISH';

  // ── Entry strategy (for BULLISH or NEUTRAL with decent score) ─────────────
  let entry = null;
  if (signal !== 'BEARISH' && score >= 3) {
    const slBase = nearestSupport
      ? nearestSupport.price * 0.985
      : atr ? price - atr * 1.5 : price * 0.95;
    const tp1 = nearestResistance
      ? nearestResistance.price
      : atr ? price + atr * 2 : price * 1.05;
    const tp2 = quote.yearHigh && quote.yearHigh > tp1
      ? quote.yearHigh
      : tp1 * 1.05;
    const risk = price - slBase;
    entry = {
      buyZone: nearestSupport
        ? `${fmtIdr(nearestSupport.price)} – ${fmtIdr(price)}`
        : fmtIdr(price),
      sl:  slBase,
      tp1, tp2,
      rr1: risk > 0 ? (tp1 - price) / risk : null,
      rr2: risk > 0 ? (tp2 - price) / risk : null,
    };
  }

  return {
    rsi, ma20, ma50, macd, bb, atr, volRatio,
    trend, factors, bearishFlags, score, confLevel, signal,
    nearestSupport, nearestResistance, yearPos, entry,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtIdr(n, decimals = 0) {
  if (n == null || isNaN(n)) return 'N/A';
  return 'Rp ' + Number(n).toLocaleString('id-ID', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
}

function fmtCap(n) {
  if (n == null) return 'N/A';
  if (n >= 1e12) return `Rp ${fmt(n / 1e12, 1)}T`;
  if (n >= 1e9)  return `Rp ${fmt(n / 1e9, 1)}M`;
  return fmtIdr(n);
}

function changeEmoji(c) {
  if (c == null) return '⬜';
  if (c >=  2)   return '🟢';
  if (c >=  0)   return '🟩';
  if (c >= -2)   return '🟥';
  return '🔴';
}

function posBar(price, low, high, width = 10) {
  if (price == null || low == null || high == null || high === low) return null;
  const p      = Math.max(0, Math.min(100, (price - low) / (high - low) * 100));
  const filled = Math.round(p / 100 * width);
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${fmt(p, 0)}%`;
}

// ─── /stock overview ──────────────────────────────────────────────────────────

async function runStockOverview(bot, chatId) {
  await bot.sendMessage(chatId, '⏳ Mengambil data IHSG & LQ45...');

  const [ihsg, ...quotes] = await Promise.all([
    fetchIHSG(),
    ...LQ45.map(s => fetchQuote(s.ticker)),
  ]);

  const stocks = LQ45
    .map((s, i) => ({ ...s, ...(quotes[i] || {}) }))
    .filter(s => s.price != null);

  const sorted    = [...stocks].sort((a, b) => (b.change ?? -999) - (a.change ?? -999));
  const gainers   = sorted.slice(0, 3);
  const losers    = sorted.slice(-3).reverse();
  const advancing = stocks.filter(s => (s.change ?? 0) >= 0).length;
  const declining = stocks.filter(s => (s.change ?? 0) <  0).length;

  const dateStr    = nowWIB();
  const ihsgDir    = !ihsg ? '' : (ihsg.change ?? 0) >= 0 ? '▲' : '▼';
  const ihsgPosBar = ihsg ? posBar(ihsg.price, ihsg.yearLow, ihsg.yearHigh) : null;

  let msg = `📈 <b>IDX MARKET OVERVIEW</b>\n`;
  msg += `<i>${dateStr} WIB</i>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `🏦 <b>IHSG (Jakarta Composite)</b>\n`;
  if (ihsg) {
    msg += `${changeEmoji(ihsg.change)} <b>${fmtIdr(ihsg.price)}</b>  ${ihsgDir} ${pct(ihsg.change)}\n`;
    msg += `Open: ${fmtIdr(ihsg.open)}  ·  H: ${fmtIdr(ihsg.high)}  ·  L: ${fmtIdr(ihsg.low)}\n`;
    msg += `52W Range: ${fmtIdr(ihsg.yearLow)} — ${fmtIdr(ihsg.yearHigh)}\n`;
    if (ihsgPosBar) msg += `Posisi: <code>${ihsgPosBar}</code>\n`;
  } else {
    msg += `⚠️ Data IHSG tidak tersedia\n`;
  }
  msg += `\n`;

  msg += `📊 <b>Breadth LQ45 (${stocks.length} saham):</b>  🟢 ${advancing} naik  ·  🔴 ${declining} turun\n\n`;

  msg += `🚀 <b>TOP GAINER</b>\n`;
  for (const s of gainers) {
    msg += `  ${changeEmoji(s.change)} <b>${s.ticker.replace('.JK', '')}</b> — ${fmtIdr(s.price)}  <b>(${pct(s.change)})</b>\n`;
  }

  msg += `\n💧 <b>TOP LOSER</b>\n`;
  for (const s of losers) {
    msg += `  ${changeEmoji(s.change)} <b>${s.ticker.replace('.JK', '')}</b> — ${fmtIdr(s.price)}  <b>(${pct(s.change)})</b>\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📋 <b>WATCHLIST LQ45</b>\n`;
  for (const s of stocks) {
    const dir = (s.change ?? 0) >= 0 ? '▲' : '▼';
    msg += `${changeEmoji(s.change)} <b>${s.ticker.replace('.JK', '')}</b>  ${fmtIdr(s.price)}  ${dir}${pct(s.change)}\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💡 <i>Analisis saham: /stock BBCA · /stock TLKM · /stock GOTO</i>`;

  await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
}

// ─── /stock <TICKER> ──────────────────────────────────────────────────────────

async function runStockDetail(bot, chatId, tickerInput) {
  const code   = tickerInput.toUpperCase().replace(/\.JK$/i, '');
  const ticker = `${code}.JK`;
  const known  = LQ45.find(s => s.ticker === ticker);

  await bot.sendMessage(chatId, `🔍 <b>Menganalisis ${code}...</b>`, { parse_mode: 'HTML' });

  const [quote, history] = await Promise.all([
    fetchQuote(ticker),
    fetchHistory(ticker, 60),
  ]);

  if (!quote || quote.price == null) {
    await bot.sendMessage(chatId,
      `❌ <b>Data tidak ditemukan untuk "${code}"</b>\n\nPastikan kode saham benar dan terdaftar di IDX.\nContoh: <code>/stock BBCA</code>  <code>/stock TLKM</code>  <code>/stock GOTO</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const tech      = computeFullTechnicals(history, quote);
  const stockName = quote.name || known?.name || code;
  const dateStr   = nowWIB();
  const dir       = (quote.change ?? 0) >= 0 ? '▲' : '▼';

  // ── Confluence bar ────────────────────────────────────────────────────────
  const score    = tech?.score ?? 0;
  const filled   = Math.min(10, Math.round((score / 10) * 10));
  const confBar  = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const confLevel = tech?.confLevel ?? 'N/A';

  // ── Signal label ──────────────────────────────────────────────────────────
  const signalLabel = !tech ? '⬜ N/A'
    : tech.signal === 'BULLISH'  ? '🟢 BULLISH'
    : tech.signal === 'BEARISH'  ? '🔴 BEARISH'
    : '🟡 NEUTRAL';

  const trendEmoji = !tech ? '➡️'
    : tech.trend === 'Uptrend'   ? '📈'
    : tech.trend === 'Downtrend' ? '📉'
    : '➡️';

  // ── MACD line ─────────────────────────────────────────────────────────────
  const macdLine = (() => {
    if (!tech?.macd) return 'N/A';
    const { macd, isCrossUp, isCrossDown, isBullish } = tech.macd;
    const tag = isCrossUp ? ' 🚀 Golden Cross' : isCrossDown ? ' ⚠️ Death Cross' : isBullish ? ' ↑' : ' ↓';
    return `${macd >= 0 ? '+' : ''}${fmt(macd, 0)}${tag}`;
  })();

  // ── Volume line ───────────────────────────────────────────────────────────
  const volLine = tech?.volRatio != null
    ? `${fmt(tech.volRatio, 1)}x rata-rata${tech.volRatio >= 1.5 ? ' ✅' : ''}`
    : 'N/A';

  // ── ATR line ──────────────────────────────────────────────────────────────
  const atrLine = tech?.atr != null ? `${fmtIdr(tech.atr)} / hari` : 'N/A';

  // ── S/R lines ─────────────────────────────────────────────────────────────
  const srBlock = (() => {
    if (!tech) return '';
    const res = tech.nearestResistance;
    const sup = tech.nearestSupport;
    if (!res && !sup) return '';
    const resStr = res ? `🔴 <b>Resistance:</b> ${fmtIdr(res.price)} (${res.touches}x tested)` : '🔴 <b>Resistance:</b> —';
    const supStr = sup ? `🟢 <b>Support:</b> ${fmtIdr(sup.price)} (${sup.touches}x tested)`     : '🟢 <b>Support:</b> —';
    return `\n━━━━━━━━━━━━━━━━━━━━━━━\n📐 <b>LEVEL KUNCI</b>\n${resStr}\n${supStr}`;
  })();

  // ── Entry strategy ────────────────────────────────────────────────────────
  const entryBlock = (() => {
    if (!tech?.entry) return '';
    const { buyZone, sl, tp1, tp2, rr1, rr2 } = tech.entry;
    let s = `\n━━━━━━━━━━━━━━━━━━━━━━━\n🎯 <b>ENTRY STRATEGY</b>\n`;
    s += `• <b>Zona Beli:</b> ${buyZone}\n`;
    s += `• <b>Stop Loss:</b> ${fmtIdr(sl)}\n`;
    s += `• <b>Target 1 (50%):</b> ${fmtIdr(tp1)}${rr1 != null ? `  → RR 1:${fmt(rr1, 2)}` : ''}\n`;
    s += `• <b>Target 2 (Full):</b> ${fmtIdr(tp2)}${rr2 != null ? `  → RR 1:${fmt(rr2, 2)}` : ''}\n`;
    return s;
  })();

  // ── Confluence list ───────────────────────────────────────────────────────
  const factorList = tech?.factors.length
    ? tech.factors.map(f => `  ✅ ${f}`).join('\n')
    : '  —';
  const bearishList = tech?.bearishFlags.length
    ? tech.bearishFlags.map(f => `  ⚠️ ${f}`).join('\n')
    : '';

  // ── Narrative ─────────────────────────────────────────────────────────────
  const narrative = (() => {
    if (!tech) return 'Data teknikal tidak cukup untuk analisis.';
    if (tech.signal === 'BULLISH') {
      const maStatus = tech.macd?.isBullish ? 'MACD mendukung momentum bullish' : 'sinyal teknikal cukup kuat';
      const volStatus = tech.volRatio != null && tech.volRatio >= 1.5
        ? ` Volume ${fmt(tech.volRatio, 1)}x rata-rata mengonfirmasi minat beli yang kuat.`
        : '';
      return `Setup <b>BULLISH</b> dengan ${score} faktor confluence aktif. ${trendEmoji} Tren ${tech.trend} dikonfirmasi oleh ${maStatus}.${volStatus} RSI ${tech.rsi != null ? fmt(tech.rsi, 1) : 'N/A'} masih memiliki ruang naik. Perhatikan resistance terdekat sebagai target awal.`;
    }
    if (tech.signal === 'BEARISH') {
      return `Setup <b>BEARISH</b> — ${tech.bearishFlags.length} sinyal negatif aktif. Tren ${tech.trend} dengan tekanan jual dominan. Hindari posisi baru; tunggu konfirmasi reversal di level support kuat sebelum entry.`;
    }
    return `Setup <b>NEUTRAL/SIDEWAYS</b> — sinyal belum cukup kuat untuk posisi baru. Harga berkonsolidasi antara support ${tech.nearestSupport ? fmtIdr(tech.nearestSupport.price) : 'N/A'} dan resistance ${tech.nearestResistance ? fmtIdr(tech.nearestResistance.price) : 'N/A'}. Tunggu breakout dengan konfirmasi volume.`;
  })();

  // ── Build final message ───────────────────────────────────────────────────
  const yrBar = posBar(quote.price, quote.yearLow, quote.yearHigh);

  let msg = `📊 <b>STOCK ANALYSIS — ${code}</b>\n`;
  msg += `<i>${stockName}</i>\n`;
  msg += `<i>${known?.sector ?? 'IDX'}  ·  ${dateStr} WIB</i>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `${changeEmoji(quote.change)} <b>${fmtIdr(quote.price)}</b>  ${dir} ${pct(quote.change)}\n`;
  msg += `Sinyal: <b>${signalLabel}</b>\n\n`;

  msg += `<b>📊 CONFLUENCE SCORE:</b>\n`;
  msg += `<code>${confBar}</code> ${score} pts (${confLevel})\n`;

  // Entry block
  msg += entryBlock;

  // S/R block
  msg += srBlock;

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `<b>📉 ANALISIS TEKNIKAL (60 Hari)</b>\n`;
  msg += `Tren   : ${trendEmoji} <b>${tech?.trend ?? 'N/A'}</b>\n`;
  msg += `RSI(14): <b>${tech?.rsi != null ? fmt(tech.rsi, 1) : 'N/A'}</b>\n`;
  msg += `MACD   : ${macdLine}\n`;
  msg += `MA20   : ${fmtIdr(tech?.ma20)}  |  MA50: ${fmtIdr(tech?.ma50)}\n`;
  if (tech?.bb) {
    msg += `Bollinger: ${fmtIdr(tech.bb.lower)} — <b>${fmtIdr(tech.bb.middle)}</b> — ${fmtIdr(tech.bb.upper)}\n`;
  }
  msg += `Volume : ${volLine}\n`;
  msg += `ATR(14): ${atrLine}\n`;

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `<b>📌 FUNDAMENTAL</b>\n`;
  msg += `Market Cap : ${fmtCap(quote.mktCap)}\n`;
  msg += `P/E Ratio  : ${quote.pe != null ? fmt(quote.pe, 1) + 'x' : 'N/A'}\n`;
  msg += `52W Range  : ${fmtIdr(quote.yearLow)} — ${fmtIdr(quote.yearHigh)}\n`;
  if (yrBar) msg += `Posisi 52W : <code>${yrBar}</code>\n`;

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `<b>🔗 CONFLUENCE FACTORS (${score} aktif)</b>\n`;
  msg += factorList;
  if (bearishList) {
    msg += `\n\n<b>🚩 BEARISH FLAGS</b>\n${bearishList}`;
  }

  msg += `\n\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `<b>📝 ANALISIS:</b>\n<i>${narrative}</i>\n`;

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `⚠️ <i>Bukan rekomendasi investasi. Selalu lakukan riset dan manajemen risiko sendiri.</i>`;

  await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
}

module.exports = { runStockOverview, runStockDetail, LQ45 };
