'use strict';

const axios = require('axios');
const { fmt, pct } = require('./utils');

const FAPI  = 'https://fapi.binance.com/fapi/v1';
const FDATA = 'https://fapi.binance.com/futures/data';
const REQ   = { timeout: 10000 };

const MAJOR_PAIRS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];

// ─── In-memory Cache ─────────────────────────────────────────────────────────
const _cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = _cache.get(key);
  if (hit && Date.now() < hit.exp) return hit.val;
  if (hit) _cache.delete(key);
  const result = await fn();
  if (result != null) _cache.set(key, { val: result, exp: Date.now() + ttlMs });
  return result;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function fetchTicker(symbol) {
  try {
    const { data } = await axios.get(`${FAPI}/ticker/24hr`, {
      params: { symbol }, ...REQ
    });
    return {
      price: +data.lastPrice,
      change24h: +data.priceChangePercent,
      volume: +data.quoteVolume
    };
  } catch { return null; }
}

async function fetchFundingRate(symbol) {
  try {
    const { data } = await axios.get(`${FAPI}/fundingRate`, {
      params: { symbol, limit: 1 }, ...REQ
    });
    return data[0] ? +data[0].fundingRate * 100 : null;
  } catch { return null; }
}

async function fetchOIHistory(symbol) {
  try {
    const { data } = await axios.get(`${FDATA}/openInterestHist`, {
      params: { symbol, period: '1h', limit: 2 }, ...REQ
    });
    if (!data || data.length < 2) return null;
    const curr = data[data.length - 1];
    const prev = data[data.length - 2];
    const oiValue = +curr.sumOpenInterestValue;
    const prevOI = +prev.sumOpenInterestValue;
    const oiChange = prevOI > 0 ? ((oiValue - prevOI) / prevOI) * 100 : 0;
    return { oiValue, oiChange };
  } catch { return null; }
}

async function fetchGlobalLSRatio(symbol) {
  try {
    const { data } = await axios.get(`${FDATA}/globalLongShortAccountRatio`, {
      params: { symbol, period: '1h', limit: 1 }, ...REQ
    });
    if (!data[0]) return null;
    return {
      longPct:  +data[0].longAccount  * 100,
      shortPct: +data[0].shortAccount * 100,
      ratio:    +data[0].longShortRatio
    };
  } catch { return null; }
}

async function fetchTakerVolume(symbol) {
  try {
    const { data } = await axios.get(`${FDATA}/takerbuyVolume`, {
      params: { symbol, period: '1h', limit: 1 }, ...REQ
    });
    if (!data[0]) return null;
    const buyVol  = +data[0].buyVol;
    const sellVol = +data[0].sellVol;
    const total   = buyVol + sellVol;
    if (total === 0) return null;
    return {
      buyPct:  (buyVol  / total) * 100,
      sellPct: (sellVol / total) * 100,
      ratio:   +data[0].buySellRatio
    };
  } catch { return null; }
}

async function fetchPriceChange1h(symbol) {
  try {
    const { data } = await axios.get(`${FAPI}/klines`, {
      params: { symbol, interval: '1h', limit: 2 }, ...REQ
    });
    if (!data || data.length < 2) return null;
    const prev = +data[data.length - 2][4]; // close 1 candle ago
    const curr = +data[data.length - 1][4]; // current close
    return prev > 0 ? ((curr - prev) / prev) * 100 : 0;
  } catch { return null; }
}

async function fetchVolumeAvg(symbol) {
  try {
    const { data } = await axios.get(`${FAPI}/klines`, {
      params: { symbol, interval: '1h', limit: 25 }, ...REQ
    });
    if (!data || data.length < 2) return null;
    const currentVol = +data[data.length - 1][5];
    const avgVol = data.slice(0, -1).reduce((s, c) => s + +c[5], 0) / (data.length - 1);
    return avgVol > 0 ? currentVol / avgVol : 1;
  } catch { return null; }
}

// ─── Smart Money Detection ───────────────────────────────────────────────────

function detectSmartMoney(metrics) {
  const { volumeRatio, oiChange, priceChange, takerBuyRatio, fundingRate, lsRatio } = metrics;

  // Accumulation Score (0-100)
  let score = 0;
  let signals = [];

  // Volume spike detection
  if (volumeRatio > 2) {
    score += 25;
    signals.push('Volume spike >2x');
  } else if (volumeRatio > 1.5) {
    score += 15;
    signals.push('Volume naik 1.5x');
  }

  // OI surge detection
  if (oiChange > 3) {
    score += 25;
    signals.push(`OI surge +${oiChange.toFixed(1)}%`);
  } else if (oiChange > 1) {
    score += 15;
    signals.push(`OI naik +${oiChange.toFixed(1)}%`);
  } else if (oiChange < -3) {
    score -= 20;
    signals.push(`OI drop ${oiChange.toFixed(1)}%`);
  }

  // Price flat despite volume (key accumulation signal)
  if (Math.abs(priceChange) < 1 && volumeRatio > 1.5) {
    score += 25;
    signals.push('Price flat meski volume tinggi');
  } else if (Math.abs(priceChange) < 0.5) {
    score += 10;
    signals.push('Price stabil');
  } else if (priceChange < -3) {
    score -= 15;
    signals.push(`Price dump ${priceChange.toFixed(1)}%`);
  }

  // Taker buy dominance
  if (takerBuyRatio > 60) {
    score += 25;
    signals.push(`Taker buy agresif ${takerBuyRatio.toFixed(0)}%`);
  } else if (takerBuyRatio > 55) {
    score += 15;
    signals.push(`Taker buy dominan ${takerBuyRatio.toFixed(0)}%`);
  } else if (takerBuyRatio < 40) {
    score -= 15;
    signals.push(`Taker sell dominan ${(100 - takerBuyRatio).toFixed(0)}%`);
  }

  // Funding rate flip (contrarian signal)
  if (fundingRate !== null) {
    if (fundingRate < -0.01) {
      score += 10;
      signals.push('Funding negatif → short crowded');
    } else if (fundingRate > 0.05) {
      score -= 10;
      signals.push('Funding tinggi → long crowded');
    }
  }

  // L/S ratio — crowd detection
  if (lsRatio) {
    if (lsRatio.shortPct > 60) {
      score += 10;
      signals.push('Short crowded → squeeze potential');
    } else if (lsRatio.longPct > 65) {
      score -= 10;
      signals.push('Long crowded → dump risk');
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine type
  let type, emoji;
  if (score >= 70) {
    type = 'ACCUMULATION';
    emoji = '🟢';
  } else if (score <= 30) {
    type = 'DISTRIBUTION';
    emoji = '🔴';
  } else {
    type = 'NEUTRAL';
    emoji = '⚖️';
  }

  return { type, emoji, score, signals };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function volStr(v) {
  if (!v && v !== 0) return 'N/A';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function priceStr(p) {
  if (!p && p !== 0) return 'N/A';
  if (p >= 1000) return fmt(p, 0);
  if (p >= 1) return fmt(p, 2);
  return fmt(p, 4);
}

function lsIcon(longPct) {
  if (longPct > 65 || longPct < 35) return '🔴';
  if (longPct > 55 || longPct < 45) return '🟡';
  return '🟢';
}

function dateHeader() {
  const now = new Date();
  return {
    date: now.toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }),
    time: now.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
  };
}

// ─── Analyze Single Pair ─────────────────────────────────────────────────────

async function analyzePair(symbol) {
  const [ticker, funding, oiData, lsData, takerData, priceChange1h, volumeRatio] = await Promise.all([
    fetchTicker(symbol),
    fetchFundingRate(symbol),
    fetchOIHistory(symbol),
    fetchGlobalLSRatio(symbol),
    fetchTakerVolume(symbol),
    fetchPriceChange1h(symbol),
    fetchVolumeAvg(symbol)
  ]);

  if (!ticker) return null;

  const metrics = {
    volumeRatio:   volumeRatio || 1,
    oiChange:      oiData?.oiChange || 0,
    priceChange:   priceChange1h || 0,
    takerBuyRatio: takerData?.buyPct || 50,
    fundingRate:   funding,
    lsRatio:       lsData
  };

  const detection = detectSmartMoney(metrics);

  return {
    symbol,
    ticker,
    funding,
    oiData,
    lsData,
    takerData,
    priceChange1h,
    volumeRatio,
    metrics,
    detection
  };
}

// ─── Report Builders ─────────────────────────────────────────────────────────

function buildOverviewReport(results) {
  const { date, time } = dateHeader();

  let r = `<b>🐋 SMART MONEY TRACKER</b>\n`;
  r += `<i>Futures Market Analytics · ${date} · ${time} WIB</i>\n`;
  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Summary counts
  const accum = results.filter(r => r.detection.type === 'ACCUMULATION');
  const dist  = results.filter(r => r.detection.type === 'DISTRIBUTION');
  const neut  = results.filter(r => r.detection.type === 'NEUTRAL');

  r += `<b>📊 RINGKASAN</b>\n`;
  r += `🟢 Akumulasi: <b>${accum.length}</b> · `;
  r += `🔴 Distribusi: <b>${dist.length}</b> · `;
  r += `⚖️ Neutral: <b>${neut.length}</b>\n\n`;

  // Per-pair results sorted by score (highest first)
  const sorted = [...results].sort((a, b) => b.detection.score - a.detection.score);

  for (const r2 of sorted) {
    const { detection, ticker, oiData, lsData, takerData, volumeRatio } = r2;
    const sym = r2.symbol.replace('USDT', '');

    r += `<b>${detection.emoji} ${sym} — ${detection.type}</b> (Score: ${detection.score}/100)\n`;
    r += `   Price: $${priceStr(ticker.price)} (${ticker.change24h >= 0 ? '+' : ''}${ticker.change24h.toFixed(1)}%) · Vol: ${volStr(ticker.volume)}\n`;

    if (oiData) {
      const oiArrow = oiData.oiChange > 2 ? '⬆️' : oiData.oiChange < -2 ? '⬇️' : '→';
      r += `   OI: ${volStr(oiData.oiValue)} ${oiArrow} ${pct(oiData.oiChange)} · `;
    }
    if (r2.funding !== null) {
      r += `Funding: ${r2.funding.toFixed(3)}%\n`;
    } else {
      r += '\n';
    }

    if (takerData) {
      const takerLabel = takerData.ratio > 1.1 ? '🟢 Buy' : takerData.ratio < 0.9 ? '🔴 Sell' : '⚖️';
      r += `   Taker: ${takerData.buyPct.toFixed(0)}% / ${takerData.sellPct.toFixed(0)}% ${takerLabel}`;
    }
    if (lsData) {
      r += ` · L/S: ${lsData.longPct.toFixed(0)}%/${lsData.shortPct.toFixed(0)}% ${lsIcon(lsData.longPct)}`;
    }
    r += '\n';

    // Top signals (max 3)
    if (detection.signals.length > 0) {
      r += `   <i>${detection.signals.slice(0, 3).join(' · ')}</i>\n`;
    }
    r += '\n';
  }

  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  // Pattern summary
  const allSignals = results.flatMap(r2 => r2.detection.signals);
  const signalCounts = {};
  allSignals.forEach(s => {
    const key = s.split(' ')[0];
    signalCounts[key] = (signalCounts[key] || 0) + 1;
  });
  const topSignals = Object.entries(signalCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topSignals.length > 0) {
    r += `<b>💡 Pattern aktif:</b>\n`;
    topSignals.forEach(([sig, count]) => {
      r += `• ${sig} — terdeteksi di ${count} pair\n`;
    });
    r += '\n';
  }

  r += `<i>Detail: /smartmoney BTC · /smartmoney ETH</i>`;

  return r;
}

function buildDetailReport(data) {
  const { date, time } = dateHeader();
  const { symbol, detection, ticker, funding, oiData, lsData, takerData, volumeRatio, priceChange1h } = data;
  const sym = symbol.replace('USDT', '/USDT');

  let r = `${detection.emoji} <b>SMART MONEY — ${sym}</b>\n`;
  r += `<i>${detection.type} · Score: ${detection.score}/100 · ${date} · ${time} WIB</i>\n`;
  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Price & Volume
  r += `<b>💰 HARGA & VOLUME</b>\n`;
  r += `Harga       : <b>$${priceStr(ticker.price)}</b> (${ticker.change24h >= 0 ? '+' : ''}${ticker.change24h.toFixed(2)}%)\n`;
  r += `Volume 24H  : <b>${volStr(ticker.volume)}</b>\n`;
  r += `Vol Ratio   : <b>${volumeRatio ? volumeRatio.toFixed(1) + 'x' : 'N/A'}</b> vs avg 24H\n`;
  r += `Price 1H    : ${priceChange1h !== null ? (priceChange1h >= 0 ? '+' : '') + priceChange1h.toFixed(2) + '%' : 'N/A'}\n\n`;

  // Open Interest
  if (oiData) {
    const oiArrow = oiData.oiChange > 3 ? '⬆️' : oiData.oiChange < -3 ? '⬇️' : '→';
    r += `<b>📈 OPEN INTEREST</b>\n`;
    r += `OI Saat Ini : <b>${volStr(oiData.oiValue)}</b>\n`;
    r += `OI Change   : ${oiArrow} <b>${pct(oiData.oiChange)}</b> (1H)\n\n`;
  }

  // Funding Rate
  if (funding !== null) {
    const fIcon = funding < 0 ? '🟢' : funding > 0.05 ? '🔴' : '⚖️';
    r += `<b>💲 FUNDING RATE</b>\n`;
    r += `Rate        : ${fIcon} <b>${funding.toFixed(4)}%</b>\n`;
    if (funding < -0.01) r += `→ Short crowded, squeeze potential\n`;
    else if (funding > 0.05) r += `→ Long crowded, dump risk\n`;
    else r += `→ Normal\n`;
    r += '\n';
  }

  // Long/Short Ratio
  if (lsData) {
    r += `<b>📊 LONG/SHORT RATIO</b>\n`;
    r += `Global      : <b>L ${lsData.longPct.toFixed(1)}% / S ${lsData.shortPct.toFixed(1)}%</b> ${lsIcon(lsData.longPct)}\n`;
    if (lsData.shortPct > 60) r += `→ Short crowded → <b>SQUEEZE POTENTIAL</b>\n`;
    else if (lsData.longPct > 65) r += `→ Long crowded → <b>DUMP RISK</b>\n`;
    else r += `→ Balanced\n`;
    r += '\n';
  }

  // Taker Volume
  if (takerData) {
    const takerLabel = takerData.ratio > 1.1 ? '🟢 Buyer Dominan' :
                       takerData.ratio < 0.9 ? '🔴 Seller Dominan' : '⚖️ Seimbang';
    r += `<b>⚡ TAKER VOLUME</b>\n`;
    r += `Buy         : <b>${takerData.buyPct.toFixed(1)}%</b>\n`;
    r += `Sell        : <b>${takerData.sellPct.toFixed(1)}%</b>\n`;
    r += `→ ${takerLabel}\n\n`;
  }

  // Detection signals
  r += `<b>🔍 SMART MONEY SIGNALS</b>\n`;
  if (detection.signals.length > 0) {
    detection.signals.forEach(s => {
      r += `• ${s}\n`;
    });
  } else {
    r += `• Tidak ada signal signifikan\n`;
  }
  r += '\n';

  // Verdict
  r += `<b>KESIMPULAN:</b>\n`;
  if (detection.type === 'ACCUMULATION') {
    r += `🟢 <b>AKUMULASI TERDETEKSI</b> — Whale/institusi kemungkinan sedang accumulasi.\n`;
    r += `Volume tinggi + OI naik + price flat = smart money masuk perlahan.\n`;
  } else if (detection.type === 'DISTRIBUTION') {
    r += `🔴 <b>DISTRIBUSI TERDETEKSI</b> — Whale/institusi kemungkinan sedang distribusi.\n`;
    r += `Volume tinggi + OI turun + price dump = smart money keluar.\n`;
  } else {
    r += `⚖️ <b>NEUTRAL</b> — Tidak ada sinyal smart money yang kuat.\n`;
    r += `Market dalam kondisi biasa, tunggu signal lebih jelas.\n`;
  }

  r += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  r += `<i>Overview: /smartmoney · Pair lain: /smartmoney ETH</i>`;

  return r;
}

// ─── Main Handlers ────────────────────────────────────────────────────────────

async function runSmartMoneyOverview(bot, chatId) {
  await bot.sendMessage(chatId, `⏳ Mendeteksi aktivitas smart money di <b>5 pair utama</b>...`, { parse_mode: 'HTML' });

  const cacheKey = 'smartmoney_overview';
  const results = await cached(cacheKey, 5 * 60 * 1000, async () => {
    const analyzed = await Promise.all(MAJOR_PAIRS.map(s => analyzePair(s)));
    return analyzed.filter(Boolean);
  });

  if (results.length === 0) {
    await bot.sendMessage(chatId, `❌ Gagal mengambil data market. Coba lagi nanti.`, { parse_mode: 'HTML' });
    return;
  }

  const report = buildOverviewReport(results);
  await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
}

async function runSmartMoneyDetail(bot, chatId, rawSymbol) {
  const symbol = rawSymbol.toUpperCase().endsWith('USDT')
    ? rawSymbol.toUpperCase()
    : rawSymbol.toUpperCase() + 'USDT';

  await bot.sendMessage(chatId, `⏳ Mendeteksi aktivitas smart money <b>${symbol.replace('USDT', '/USDT')}</b>...`, { parse_mode: 'HTML' });

  const cacheKey = `smartmoney_${symbol}`;
  const data = await cached(cacheKey, 3 * 60 * 1000, () => analyzePair(symbol));

  if (!data) {
    await bot.sendMessage(chatId,
      `❌ <b>${symbol}</b> tidak tersedia di Binance Futures.\n\nCoba pair lain:\n` +
      `<code>/smartmoney BTC</code>  <code>/smartmoney ETH</code>  <code>/smartmoney SOL</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const report = buildDetailReport(data);
  await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
}

module.exports = { runSmartMoneyOverview, runSmartMoneyDetail };
