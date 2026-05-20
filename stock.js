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
      return rows.map(r => ({ close: r.close, volume: r.volume }));
    } catch { return null; }
  });
}

// ─── Technicals ───────────────────────────────────────────────────────────────

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

function computeTechnicals(history) {
  if (!history || history.length < 20) return null;
  const closes = history.map(h => h.close);
  const rsi    = calcRSI(closes, 14);
  const ma20   = calcMA(closes, 20);
  const ma50   = calcMA(closes, Math.min(50, closes.length));
  const trend  = ma20 && ma50 ? (ma20 > ma50 ? 'Uptrend' : 'Downtrend') : 'Sideways';
  const rsiSignal = rsi == null ? 'N/A' : rsi >= 70 ? 'Overbought ⚠️' : rsi <= 30 ? 'Oversold ⚠️' : 'Neutral';
  return { rsi, ma20, ma50, trend, rsiSignal };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtIdr(n, decimals = 0) {
  if (n == null || isNaN(n)) return 'N/A';
  return 'Rp ' + Number(n).toLocaleString('id-ID', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals
  });
}

function fmtCap(n) {
  if (n == null) return 'N/A';
  if (n >= 1e12) return `Rp ${fmt(n / 1e12, 1)}T`;
  if (n >= 1e9)  return `Rp ${fmt(n / 1e9, 1)}M`;
  return fmtIdr(n);
}

function changeEmoji(c) {
  if (c == null)  return '⬜';
  if (c >=  2)    return '🟢';
  if (c >=  0)    return '🟩';
  if (c >= -2)    return '🟥';
  return '🔴';
}

function posBar(price, low, high, width = 10) {
  if (price == null || low == null || high == null || high === low) return null;
  const pct = Math.max(0, Math.min(100, (price - low) / (high - low) * 100));
  const filled = Math.round(pct / 100 * width);
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${fmt(pct, 0)}%`;
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

  const sorted   = [...stocks].sort((a, b) => (b.change ?? -999) - (a.change ?? -999));
  const gainers  = sorted.slice(0, 3);
  const losers   = sorted.slice(-3).reverse();
  const advancing = stocks.filter(s => (s.change ?? 0) >= 0).length;
  const declining = stocks.filter(s => (s.change ?? 0) <  0).length;

  const dateStr  = nowWIB();
  const ihsgDir  = !ihsg ? '' : (ihsg.change ?? 0) >= 0 ? '▲' : '▼';
  const ihsgPosBar = ihsg ? posBar(ihsg.price, ihsg.yearLow, ihsg.yearHigh) : null;

  let msg = `📈 <b>IDX MARKET OVERVIEW</b>\n`;
  msg += `<i>${dateStr} WIB</i>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // IHSG block
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

  // Breadth
  msg += `📊 <b>Breadth LQ45 (${stocks.length} saham):</b>  🟢 ${advancing} naik  ·  🔴 ${declining} turun\n\n`;

  // Gainers
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

  await bot.sendMessage(chatId, `⏳ Menganalisis <b>${code}</b>...`, { parse_mode: 'HTML' });

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

  const tech      = computeTechnicals(history);
  const stockName = quote.name || known?.name || code;
  const dateStr   = nowWIB();
  const dir       = (quote.change ?? 0) >= 0 ? '▲' : '▼';

  // 52-week position
  const yrBar = posBar(quote.price, quote.yearLow, quote.yearHigh);

  // MA vs price
  const maStatus = !tech ? '' :
    (quote.price > (tech.ma20 ?? 0) && quote.price > (tech.ma50 ?? 0))
      ? '  ↑ Di atas MA20 & MA50'
      : (quote.price < (tech.ma20 ?? 0) && quote.price < (tech.ma50 ?? 0))
        ? '  ↓ Di bawah MA20 & MA50'
        : '  ↔ Di antara MA20 & MA50';

  const trendEmoji = !tech ? '➡️' : tech.trend === 'Uptrend' ? '📈' : tech.trend === 'Downtrend' ? '📉' : '➡️';

  let msg = `📊 <b>STOCK ANALYSIS — ${code}</b>\n`;
  msg += `<i>${stockName}</i>\n`;
  msg += `<i>${known?.sector ?? 'IDX'}  ·  ${dateStr} WIB</i>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `${changeEmoji(quote.change)} <b>${fmtIdr(quote.price)}</b>  ${dir} ${pct(quote.change)}\n\n`;

  // Fundamental
  msg += `<b>📌 Fundamental</b>\n`;
  msg += `Market Cap : ${fmtCap(quote.mktCap)}\n`;
  msg += `P/E Ratio  : ${quote.pe != null ? fmt(quote.pe, 1) + 'x' : 'N/A'}\n\n`;

  // 52-Week Range
  msg += `<b>📐 52-Week Range</b>\n`;
  msg += `Low  : ${fmtIdr(quote.yearLow)}\n`;
  msg += `High : ${fmtIdr(quote.yearHigh)}\n`;
  if (yrBar) msg += `Posisi : <code>${yrBar}</code>\n`;
  msg += `\n`;

  // Technicals
  if (tech) {
    msg += `<b>📉 Teknikal (60 Hari)</b>\n`;
    msg += `Tren   : ${trendEmoji} <b>${tech.trend}</b>${maStatus}\n`;
    msg += `RSI(14): <b>${fmt(tech.rsi, 1)}</b>  ${tech.rsiSignal}\n`;
    msg += `MA20   : ${fmtIdr(tech.ma20)}\n`;
    msg += `MA50   : ${fmtIdr(tech.ma50)}\n`;
  } else {
    msg += `<b>📉 Teknikal</b>\n`;
    msg += `⚠️ Data historis tidak cukup untuk kalkulasi\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💡 <i>Kembali ke overview: /stock</i>`;

  await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
}

module.exports = { runStockOverview, runStockDetail, LQ45 };
