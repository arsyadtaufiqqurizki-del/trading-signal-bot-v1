'use strict';

const axios = require('axios');
const { fmt, pct } = require('./utils');

const FAPI  = 'https://fapi.binance.com/fapi/v1';
const FDATA = 'https://fapi.binance.com/futures/data';
const REQ   = { timeout: 10000 };

const MAJOR_PAIRS   = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
const WHALE_THRESHOLD = 100000; // $100K minimum liquidation to qualify as whale

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function fetchForceOrders(startTime, symbol, limit = 1000) {
  try {
    const params = { limit };
    if (startTime) params.startTime = startTime;
    if (symbol)    params.symbol    = symbol.toUpperCase();
    const { data } = await axios.get(`${FAPI}/allForceOrders`, { params, ...REQ });
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function fetchGlobalLSRatio(symbol, period = '1h') {
  try {
    const { data } = await axios.get(`${FDATA}/globalLongShortAccountRatio`, {
      params: { symbol: symbol.toUpperCase(), period, limit: 1 }, ...REQ
    });
    if (!data[0]) return null;
    return {
      longPct:  +data[0].longAccount  * 100,
      shortPct: +data[0].shortAccount * 100,
      ratio:    +data[0].longShortRatio
    };
  } catch { return null; }
}

async function fetchTopAccountRatio(symbol, period = '1h') {
  try {
    const { data } = await axios.get(`${FDATA}/topLongShortAccountRatio`, {
      params: { symbol: symbol.toUpperCase(), period, limit: 1 }, ...REQ
    });
    if (!data[0]) return null;
    return {
      longPct:  +data[0].longAccount  * 100,
      shortPct: +data[0].shortAccount * 100,
      ratio:    +data[0].longShortRatio
    };
  } catch { return null; }
}

async function fetchTopPositionRatio(symbol, period = '1h') {
  try {
    const { data } = await axios.get(`${FDATA}/topLongShortPositionRatio`, {
      params: { symbol: symbol.toUpperCase(), period, limit: 1 }, ...REQ
    });
    if (!data[0]) return null;
    return {
      longPct:  +data[0].longAccount  * 100,
      shortPct: +data[0].shortAccount * 100,
      ratio:    +data[0].longShortRatio
    };
  } catch { return null; }
}

async function fetchOIHistory(symbol, period = '1h') {
  try {
    const { data } = await axios.get(`${FDATA}/openInterestHist`, {
      params: { symbol: symbol.toUpperCase(), period, limit: 2 }, ...REQ
    });
    if (!data || data.length < 2) return null;
    const curr  = data[data.length - 1];
    const prev  = data[data.length - 2];
    const change = ((+curr.sumOpenInterestValue - +prev.sumOpenInterestValue) / +prev.sumOpenInterestValue) * 100;
    return {
      oiValue: +curr.sumOpenInterestValue,
      oiChange: change
    };
  } catch { return null; }
}

async function fetchTakerVolume(symbol, period = '1h') {
  try {
    const { data } = await axios.get(`${FDATA}/takerbuyVolume`, {
      params: { symbol: symbol.toUpperCase(), period, limit: 1 }, ...REQ
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

// side SELL = long position forced to sell = long liquidated
// side BUY  = short position forced to buy = short liquidated
function processLiqs(orders) {
  let longLiq = 0, shortLiq = 0;
  for (const o of orders) {
    const val = +o.executedQty * +o.averagePrice;
    if (o.side === 'SELL') longLiq  += val;
    else                   shortLiq += val;
  }
  return { longLiq, shortLiq, total: longLiq + shortLiq };
}

function volStr(v) {
  if (!v && v !== 0) return 'N/A';
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function lsIcon(longPct) {
  if (longPct > 65 || longPct < 35) return '🔴';
  if (longPct > 55 || longPct < 45) return '🟡';
  return '🟢';
}

function biasLabel(longPct) {
  if (longPct > 65) return 'CROWDED LONG ⚠️';
  if (longPct < 35) return 'CROWDED SHORT ⚠️';
  if (longPct > 55) return 'LONG BIAS';
  if (longPct < 45) return 'SHORT BIAS';
  return 'BALANCED ✓';
}

function squeezeRisk(globalLS, topAccLS, topPosLS, oiChange) {
  let longScore = 0, shortScore = 0;

  if (globalLS) {
    if (globalLS.longPct > 60)  longScore  += 2;
    else if (globalLS.longPct > 55) longScore += 1;
    if (globalLS.shortPct > 60) shortScore += 2;
    else if (globalLS.shortPct > 55) shortScore += 1;
  }
  if (topAccLS) {
    if (topAccLS.longPct > 65)  longScore  += 2;
    else if (topAccLS.longPct > 55) longScore += 1;
    if (topAccLS.shortPct > 65) shortScore += 2;
    else if (topAccLS.shortPct > 55) shortScore += 1;
  }
  if (topPosLS) {
    // Position ratio carries more weight — whale money
    if (topPosLS.longPct > 65)  longScore  += 3;
    else if (topPosLS.longPct > 55) longScore += 1;
    if (topPosLS.shortPct > 65) shortScore += 3;
    else if (topPosLS.shortPct > 55) shortScore += 1;
  }
  if (oiChange > 5) { longScore += 1; shortScore += 1; }

  const label = (s) => {
    if (s >= 6) return ['🔴', 'VERY HIGH'];
    if (s >= 4) return ['🔴', 'HIGH'];
    if (s >= 2) return ['🟡', 'MEDIUM'];
    return ['🟢', 'LOW'];
  };
  return { longRisk: label(longScore), shortRisk: label(shortScore) };
}

function dateHeader() {
  const now = new Date();
  return {
    date: now.toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }),
    time: now.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
  };
}

// ─── Report Builders ─────────────────────────────────────────────────────────

function buildOverviewReport(pairsData, liqOrders) {
  const { date, time } = dateHeader();
  const { longLiq, shortLiq, total } = processLiqs(liqOrders);

  let r = `<b>LIQUIDATION DASHBOARD</b>\n`;
  r += `<i>Futures Market Analytics · ${date} · ${time} WIB</i>\n`;
  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // 24H liquidation summary
  if (total > 0) {
    const longPct  = ((longLiq  / total) * 100).toFixed(1);
    const shortPct = ((shortLiq / total) * 100).toFixed(1);
    const dom      = longLiq > shortLiq ? '🔴 LONG dilikuidasi' : '🟢 SHORT dilikuidasi';
    r += `<b>💥 LIKUIDASI 24H (ALL PAIRS)</b>\n`;
    r += `Total        : <b>${volStr(total)}</b>\n`;
    r += `Long Liq 🔴  : ${volStr(longLiq)} (${longPct}%)\n`;
    r += `Short Liq 🟢 : ${volStr(shortLiq)} (${shortPct}%)\n`;
    r += `Dominan      : <b>${dom}</b>\n\n`;
  } else {
    r += `<b>💥 LIKUIDASI 24H</b>\n`;
    r += `Tidak ada data likuidasi tersedia\n\n`;
  }

  // Per-pair L/S ratio table
  const hasRatio = pairsData.some(p => p.ratio !== null);
  if (hasRatio) {
    r += `<b>📊 LONG/SHORT RATIO (1H)</b>\n`;
    r += `<code>Pair    LONG    SHORT   </code>\n`;
    for (const { symbol, ratio } of pairsData) {
      if (!ratio) continue;
      const sym      = symbol.replace('USDT', '').padEnd(6);
      const longStr  = `${ratio.longPct.toFixed(1)}%`.padEnd(7);
      const shortStr = `${ratio.shortPct.toFixed(1)}%`.padEnd(7);
      const icon     = lsIcon(ratio.longPct);
      r += `<code>${sym} ${longStr} ${shortStr}</code> ${icon}\n`;
    }
    r += '\n';
    r += `🔴 &gt;65% satu sisi = squeeze risk tinggi\n`;
    r += `🟡 55–65% = mild bias\n`;
    r += `🟢 45–55% = balanced\n\n`;
  }

  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  r += `<i>Detail pair  : /liq BTCUSDT  |  /liq ETHUSDT\n`;
  r += `Whale watch  : /liq whale</i>`;

  return r;
}

function buildPairReport(symbol, liq1h, liq24h, globalLS, topAccLS, topPosLS, oiData, takerData) {
  const { time } = dateHeader();
  const sym = symbol.replace('USDT', '/USDT');

  const s1h  = processLiqs(liq1h);
  const s24h = processLiqs(liq24h);

  let r = `🔥 <b>LIQUIDATION REPORT — ${sym}</b>\n`;
  r += `<i>${time} WIB</i>\n`;
  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Long/Short Ratios
  const hasAnyLS = globalLS || topAccLS || topPosLS;
  if (hasAnyLS) {
    r += `<b>📊 LONG/SHORT RATIO (1H)</b>\n`;
    if (globalLS) {
      r += `Global Akun  : <b>L ${globalLS.longPct.toFixed(1)}% / S ${globalLS.shortPct.toFixed(1)}%</b> ${lsIcon(globalLS.longPct)}\n`;
    }
    if (topAccLS) {
      r += `Top Trader   : <b>L ${topAccLS.longPct.toFixed(1)}% / S ${topAccLS.shortPct.toFixed(1)}%</b> ${lsIcon(topAccLS.longPct)}\n`;
    }
    if (topPosLS) {
      r += `Top Posisi   : <b>L ${topPosLS.longPct.toFixed(1)}% / S ${topPosLS.shortPct.toFixed(1)}%</b> ${lsIcon(topPosLS.longPct)}\n`;
    }
    const refLS = globalLS || topAccLS;
    if (refLS) {
      r += `→ Bias : <b>${biasLabel(refLS.longPct)}</b>\n`;
    }
    r += '\n';
  }

  // Liquidations
  r += `<b>💥 LIKUIDASI</b>\n`;
  if (s1h.total > 0) {
    const lp = ((s1h.longLiq  / s1h.total) * 100).toFixed(0);
    const sp = ((s1h.shortLiq / s1h.total) * 100).toFixed(0);
    r += `1H Total    : <b>${volStr(s1h.total)}</b>\n`;
    r += `Long Liq    : ${volStr(s1h.longLiq)} (${lp}%) 🔴\n`;
    r += `Short Liq   : ${volStr(s1h.shortLiq)} (${sp}%) 🟢\n`;
  } else {
    r += `1H          : Tidak ada likuidasi\n`;
  }

  if (s24h.total > 0) {
    const lp = ((s24h.longLiq  / s24h.total) * 100).toFixed(0);
    const sp = ((s24h.shortLiq / s24h.total) * 100).toFixed(0);
    r += `24H Total   : <b>${volStr(s24h.total)}</b>\n`;
    r += `Long Liq    : ${volStr(s24h.longLiq)} (${lp}%) 🔴\n`;
    r += `Short Liq   : ${volStr(s24h.shortLiq)} (${sp}%) 🟢\n`;
  }
  r += '\n';

  // Open Interest
  if (oiData) {
    const oiArrow = oiData.oiChange > 3 ? '⬆️' : oiData.oiChange < -3 ? '⬇️' : '→';
    r += `<b>📈 OPEN INTEREST</b>\n`;
    r += `OI Saat Ini : <b>${volStr(oiData.oiValue)}</b>\n`;
    r += `OI Change   : ${oiArrow} <b>${pct(oiData.oiChange)}</b> (1H)\n\n`;
  }

  // Taker Volume
  if (takerData) {
    const takerLabel = takerData.ratio > 1.1 ? '🟢 Buyer Dominan' :
                       takerData.ratio < 0.9 ? '🔴 Seller Dominan' : '⚖️ Seimbang';
    r += `<b>⚡ TAKER VOLUME (1H)</b>\n`;
    r += `Buy  : <b>${takerData.buyPct.toFixed(1)}%</b>\n`;
    r += `Sell : <b>${takerData.sellPct.toFixed(1)}%</b>\n`;
    r += `→ ${takerLabel}\n\n`;
  }

  // Squeeze Risk
  const { longRisk, shortRisk } = squeezeRisk(globalLS, topAccLS, topPosLS, oiData?.oiChange);
  r += `<b>⚠️ SQUEEZE RISK</b>\n`;
  r += `Long Squeeze  : ${longRisk[0]}  <b>${longRisk[1]}</b>\n`;
  r += `Short Squeeze : ${shortRisk[0]}  <b>${shortRisk[1]}</b>\n\n`;

  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  r += `<i>Overview: /liq  ·  Whale watch: /liq whale</i>`;

  return r;
}

function buildWhaleReport(orders) {
  const { time } = dateHeader();

  const whales = orders
    .map(o => ({ ...o, value: +o.executedQty * +o.averagePrice }))
    .filter(o => o.value >= WHALE_THRESHOLD)
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  let r = `🐋 <b>WHALE LIQUIDATION WATCH</b>\n`;
  r += `<i>Liq &gt; ${volStr(WHALE_THRESHOLD)} · ${time} WIB</i>\n`;
  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (whales.length === 0) {
    r += `✅ Tidak ada whale liquidation dalam 24H terakhir\n`;
    r += `<i>(threshold: ${volStr(WHALE_THRESHOLD)})</i>\n`;
    return r;
  }

  let totalLong = 0, totalShort = 0;
  for (const o of whales) {
    if (o.side === 'SELL') totalLong  += o.value;
    else                   totalShort += o.value;
  }

  r += `<b>💥 TOTAL WHALE LIKUIDASI (24H)</b>\n`;
  r += `Long Liq 🔴  : <b>${volStr(totalLong)}</b>\n`;
  r += `Short Liq 🟢 : <b>${volStr(totalShort)}</b>\n`;
  r += `Events       : <b>${whales.length}</b> transaksi\n\n`;

  r += `<b>🔝 TOP EVENTS</b>\n`;
  whales.slice(0, 10).forEach((o, i) => {
    const side    = o.side === 'SELL' ? '🔴 LONG' : '🟢 SHORT';
    const coinSym = o.symbol.replace('USDT', '').replace('BUSD', '');
    const ts      = new Date(o.time).toLocaleString('id-ID', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
    });
    const priceStr = +o.averagePrice >= 1000
      ? fmt(+o.averagePrice, 0)
      : fmt(+o.averagePrice, 4);
    r += `${i + 1}. ${side} <b>${coinSym}</b> — <b>${volStr(o.value)}</b> @ $${priceStr} [${ts}]\n`;
  });

  r += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  r += `<i>Detail pair: /liq BTCUSDT  ·  Overview: /liq</i>`;

  return r;
}

// ─── Main Handlers ────────────────────────────────────────────────────────────

async function runLiqOverview(bot, chatId) {
  await bot.sendMessage(chatId, `⏳ Memuat data likuidasi pasar...`);

  const since24h = Date.now() - 24 * 60 * 60 * 1000;

  const [liqOrders, ...ratios] = await Promise.all([
    fetchForceOrders(since24h, null, 1000),
    ...MAJOR_PAIRS.map(sym => fetchGlobalLSRatio(sym, '1h'))
  ]);

  const pairsData = MAJOR_PAIRS.map((symbol, i) => ({ symbol, ratio: ratios[i] }));
  const report    = buildOverviewReport(pairsData, liqOrders);
  await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
}

async function runLiqPair(bot, chatId, rawSymbol) {
  const symbol = rawSymbol.toUpperCase().endsWith('USDT')
    ? rawSymbol.toUpperCase()
    : rawSymbol.toUpperCase() + 'USDT';

  await bot.sendMessage(chatId, `⏳ Memuat data likuidasi <b>${symbol.replace('USDT', '/USDT')}</b>...`, { parse_mode: 'HTML' });

  const now      = Date.now();
  const since1h  = now - 60 * 60 * 1000;
  const since24h = now - 24 * 60 * 60 * 1000;

  const [liq1h, liq24h, globalLS, topAccLS, topPosLS, oiData, takerData] = await Promise.all([
    fetchForceOrders(since1h,  symbol, 200),
    fetchForceOrders(since24h, symbol, 1000),
    fetchGlobalLSRatio(symbol,    '1h'),
    fetchTopAccountRatio(symbol,  '1h'),
    fetchTopPositionRatio(symbol, '1h'),
    fetchOIHistory(symbol,        '1h'),
    fetchTakerVolume(symbol,      '1h')
  ]);

  // If all data is null, the pair probably isn't on Binance Futures
  if (!globalLS && !topAccLS && liq24h.length === 0 && !oiData) {
    await bot.sendMessage(chatId,
      `❌ <b>${symbol}</b> tidak tersedia di Binance Futures.\n\nCoba pair lain seperti:\n` +
      `<code>/liq BTCUSDT</code>  <code>/liq ETHUSDT</code>  <code>/liq SOLUSDT</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const report = buildPairReport(symbol, liq1h, liq24h, globalLS, topAccLS, topPosLS, oiData, takerData);
  await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
}

async function runLiqWhale(bot, chatId) {
  await bot.sendMessage(chatId, `⏳ Mencari whale liquidation 24H...`);

  const since24h = Date.now() - 24 * 60 * 60 * 1000;
  const orders   = await fetchForceOrders(since24h, null, 1000);
  const report   = buildWhaleReport(orders);
  await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
}

module.exports = { runLiqOverview, runLiqPair, runLiqWhale };
