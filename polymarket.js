'use strict';

const axios = require('axios');

const GAMMA = 'https://gamma-api.polymarket.com';
const REQ   = { timeout: 12000 };

// ─── Market Classification Rules ─────────────────────────────────────────────
// direction 'bull' = high YES probability → BULLISH untuk crypto
// direction 'bear' = high YES probability → BEARISH untuk crypto

const MARKET_RULES = [
  // BTC price targets
  { pattern: /bitcoin.*(\$[\d,]+k?|[\d]+k\s*dollar|all.time high|ath)/i, category: 'BTC', direction: 'bull', label: 'BTC Price Target', weight: 1.5 },
  { pattern: /btc.*(\$[\d,]+k?|[\d]+k\s*dollar|all.time high|ath)/i,    category: 'BTC', direction: 'bull', label: 'BTC Price Target', weight: 1.5 },
  { pattern: /will bitcoin (reach|hit|exceed|surpass)/i,                  category: 'BTC', direction: 'bull', label: 'BTC Rally',        weight: 1.5 },

  // ETF
  { pattern: /bitcoin.*etf|spot.*bitcoin etf|btc.*spot etf/i,   category: 'BTC',    direction: 'bull', label: 'BTC ETF',       weight: 2   },
  { pattern: /ethereum.*etf|spot.*ethereum etf|eth.*spot etf/i, category: 'ETH',    direction: 'bull', label: 'ETH ETF',       weight: 2   },
  { pattern: /crypto.*etf|altcoin.*etf/i,                       category: 'CRYPTO', direction: 'bull', label: 'Crypto ETF',    weight: 1.5 },

  // Strategic reserve / national bitcoin
  { pattern: /strategic.*bitcoin|bitcoin.*reserve|national.*bitcoin|us.*bitcoin/i, category: 'BTC', direction: 'bull', label: 'BTC Reserve', weight: 2 },

  // Fed / monetary policy – BULLISH
  { pattern: /fed.*rate cut|rate cut.*fed|interest rate cut|fed funds.*cut/i, category: 'MACRO', direction: 'bull', label: 'Fed Rate Cut', weight: 2   },
  { pattern: /fed.*lower|lower.*fed rate|fed.*pause|pause.*hike/i,            category: 'MACRO', direction: 'bull', label: 'Fed Dovish',  weight: 1.5 },
  { pattern: /quantitative easing|qe/i,                                       category: 'MACRO', direction: 'bull', label: 'QE',          weight: 1.5 },

  // Fed / monetary policy – BEARISH
  { pattern: /rate hike|fed.*hike|higher.*fed rate|tightening/i, category: 'MACRO', direction: 'bear', label: 'Rate Hike',    weight: 1.5 },

  // Macro economic risk – BEARISH
  { pattern: /recession/i,                                category: 'MACRO', direction: 'bear', label: 'Recession',    weight: 2   },
  { pattern: /market crash|stock.*crash|crash.*market/i, category: 'MACRO', direction: 'bear', label: 'Market Crash', weight: 1.5 },
  { pattern: /inflation.*persist|inflation.*high|cpi.*above/i, category: 'MACRO', direction: 'bear', label: 'High Inflation', weight: 1 },

  // Regulation – BEARISH
  { pattern: /crypto.*ban|ban.*crypto/i,              category: 'REG', direction: 'bear', label: 'Crypto Ban',    weight: 2   },
  { pattern: /sec.*crypto|crypto.*sec|sec.*lawsuit/i, category: 'REG', direction: 'bear', label: 'SEC Action',   weight: 1.5 },
  { pattern: /crypto.*regulation|regulation.*crypto/i,category: 'REG', direction: 'bear', label: 'Regulation',   weight: 1   },

  // Crypto bullish catalysts
  { pattern: /bitcoin.*halving|halving.*bitcoin/i,          category: 'BTC',    direction: 'bull', label: 'BTC Halving',  weight: 1.5 },
  { pattern: /altcoin.*season|alt.*season/i,                category: 'CRYPTO', direction: 'bull', label: 'Alt Season',   weight: 1   },
  { pattern: /crypto.*adoption|institutional.*crypto/i,     category: 'CRYPTO', direction: 'bull', label: 'Adoption',     weight: 1   },
  { pattern: /crypto.*crash|crypto.*bear|crypto.*collapse/i,category: 'CRYPTO', direction: 'bear', label: 'Crypto Crash', weight: 1.5 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseYesProb(outcomePrices) {
  try {
    const arr = typeof outcomePrices === 'string' ? JSON.parse(outcomePrices) : outcomePrices;
    if (!arr || !arr[0]) return null;
    const p = parseFloat(arr[0]);
    return isNaN(p) ? null : +(p * 100).toFixed(1);
  } catch { return null; }
}

function classifyMarket(question) {
  for (const rule of MARKET_RULES) {
    if (rule.pattern.test(question)) return rule;
  }
  return null;
}

function fmtVol(v) {
  if (!v || isNaN(v)) return 'N/A';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return null; }
}

function probBar(p) {
  const filled = Math.min(10, Math.max(0, Math.round(p / 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function signalFromScore(score) {
  if (score >= 0.35)  return { label: 'BULLISH KUAT',    emoji: '🟢' };
  if (score >= 0.10)  return { label: 'BULLISH MODERAT', emoji: '📈' };
  if (score <= -0.35) return { label: 'BEARISH KUAT',    emoji: '🔴' };
  if (score <= -0.10) return { label: 'BEARISH MODERAT', emoji: '📉' };
  return                     { label: 'NETRAL / WAIT',   emoji: '⚪' };
}

// ─── API Fetcher ──────────────────────────────────────────────────────────────

async function fetchMarkets(limit = 250) {
  try {
    const { data } = await axios.get(`${GAMMA}/markets`, {
      params: { active: true, closed: false, limit, order: 'volume24hr', ascending: false },
      ...REQ
    });
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(`[Polymarket] fetchMarkets error: ${e.message}`);
    return [];
  }
}

// ─── Analysis Engine ──────────────────────────────────────────────────────────

function analyzeMarkets(markets) {
  const relevant = [];
  let weightedScore = 0;
  let totalWeight   = 0;

  for (const m of markets) {
    const rule = classifyMarket(m.question || '');
    if (!rule) continue;

    const prob = parseYesProb(m.outcomePrices);
    if (prob === null) continue;

    // normalized: -1 (prob=0%) to +1 (prob=100%), center at 50%
    const normalized   = (prob - 50) / 50;
    const contribution = rule.direction === 'bull' ? normalized : -normalized;

    weightedScore += contribution * rule.weight;
    totalWeight   += rule.weight;

    relevant.push({
      question:     m.question,
      prob,
      vol24h:       +(m.volume24hr || 0),
      vol:          +(m.volume     || 0),
      endDate:      m.endDate,
      category:     rule.category,
      direction:    rule.direction,
      label:        rule.label,
      weight:       rule.weight,
      contribution,
    });
  }

  const compositeScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
  return { relevant, compositeScore };
}

// ─── Report Builder ───────────────────────────────────────────────────────────

function buildReport(markets, compositeScore, subtitle) {
  const sig     = signalFromScore(compositeScore);
  const now     = new Date();
  const dateStr = now.toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

  let msg = `<b>POLYMARKET SIGNAL INTEL</b>\n`;
  msg += `<i>${subtitle}</i>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `${dateStr}  ·  ${timeStr} WIB\n`;
  msg += `Markets dipantau: <b>${markets.length}</b>\n\n`;

  msg += `<b>SINYAL KOMPOSIT: ${sig.emoji} ${sig.label}</b>\n`;
  msg += `Score: <code>${compositeScore >= 0 ? '+' : ''}${compositeScore.toFixed(3)}</code>`;
  msg += `  |  Range: <code>-1.0 bearish → +1.0 bullish</code>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (!markets.length) {
    msg += `Tidak ada market relevan ditemukan saat ini.\n`;
    msg += `<i>Coba lagi nanti atau gunakan /poly hot</i>`;
    return msg;
  }

  const sorted = [...markets].sort((a, b) => b.vol24h - a.vol24h);

  msg += `<b>TOP MARKETS</b>\n`;
  msg += `─────────────────────────\n`;

  sorted.slice(0, 6).forEach((m, i) => {
    const dirEmoji    = m.direction === 'bull' ? '📈' : '📉';
    const impactEmoji = m.contribution > 0.15 ? '🟢' : m.contribution < -0.15 ? '🔴' : '⚪';

    const qShort = m.question.length > 58 ? m.question.substring(0, 55) + '...' : m.question;
    const deadline = fmtDate(m.endDate);

    let impactText;
    if (m.direction === 'bull' && m.prob >= 60) impactText = 'Bullish untuk crypto';
    else if (m.direction === 'bull' && m.prob >= 40) impactText = 'Sedikit bullish';
    else if (m.direction === 'bull') impactText = 'Potensi bullish rendah';
    else if (m.direction === 'bear' && m.prob >= 60) impactText = 'Bearish untuk crypto';
    else if (m.direction === 'bear' && m.prob >= 40) impactText = 'Sedikit bearish';
    else impactText = 'Tekanan bearish rendah';

    msg += `<b>${i + 1}. ${m.label.toUpperCase()}</b> ${dirEmoji}\n`;
    msg += `<i>${qShort}</i>\n`;
    msg += `YES: <b>${m.prob.toFixed(1)}%</b>  <code>${probBar(m.prob)}</code>\n`;
    msg += `Vol 24h: ${fmtVol(m.vol24h)}  |  Total: ${fmtVol(m.vol)}\n`;
    if (deadline) msg += `Resolusi: ${deadline}\n`;
    msg += `${impactEmoji} ${impactText}\n\n`;
  });

  // Trading recommendation
  const scoreAbs = Math.abs(compositeScore);
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `<b>REKOMENDASI TRADING</b>\n`;

  if (compositeScore >= 0.35) {
    msg += `Sentimen prediction market <b>mendukung LONG</b>. Cari konfirmasi teknikal di /high sebelum entry.`;
  } else if (compositeScore >= 0.10) {
    msg += `Bias bullish moderat dari pasar prediksi. Konfirmasi teknikal tetap wajib sebelum entry.`;
  } else if (compositeScore <= -0.35) {
    msg += `Tekanan bearish signifikan. Prioritaskan <b>manajemen risiko</b> dan hindari over-leverage.`;
  } else if (compositeScore <= -0.10) {
    msg += `Sedikit tekanan bearish macro. Kurangi eksposur hingga sinyal lebih jelas.`;
  } else {
    msg += `Belum ada sinyal jelas dari pasar prediksi. Tunggu momentum atau konfirmasi teknikal via /high.`;
  }

  msg += `\n\n<i>Sumber: Polymarket · Global Prediction Market</i>\n`;
  msg += `<i>Filter: /poly btc · /poly eth · /poly macro · /poly hot</i>`;

  return msg;
}

// ─── Public Runners ───────────────────────────────────────────────────────────

async function runPolyOverview(bot, chatId) {
  await bot.sendMessage(chatId, `⏳ Mengambil data Polymarket...`, { parse_mode: 'HTML' });

  const markets = await fetchMarkets(250);
  if (!markets.length) {
    await bot.sendMessage(chatId, `❌ <b>Gagal mengambil data Polymarket.</b>\nCoba lagi nanti.`, { parse_mode: 'HTML' });
    return;
  }

  const { relevant, compositeScore } = analyzeMarkets(markets);
  const msg = buildReport(relevant, compositeScore, 'Prediction Market Sentiment · Crypto &amp; Macro');
  await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
}

async function runPolyCategory(bot, chatId, category) {
  const catNames = { btc: 'Bitcoin', eth: 'Ethereum', macro: 'Macro &amp; Fed', hot: 'Hot Markets (24h Volume)' };
  await bot.sendMessage(chatId, `⏳ Mengambil data Polymarket [${catNames[category] || category}]...`, { parse_mode: 'HTML' });

  const markets = await fetchMarkets(300);
  if (!markets.length) {
    await bot.sendMessage(chatId, `❌ <b>Gagal mengambil data Polymarket.</b>\nCoba lagi nanti.`, { parse_mode: 'HTML' });
    return;
  }

  const { relevant } = analyzeMarkets(markets);

  let filtered;
  if (category === 'btc') {
    filtered = relevant.filter(m => m.category === 'BTC');
  } else if (category === 'eth') {
    filtered = relevant.filter(m => m.category === 'ETH');
  } else if (category === 'macro') {
    filtered = relevant.filter(m => m.category === 'MACRO');
  } else if (category === 'hot') {
    filtered = [...relevant].sort((a, b) => b.vol24h - a.vol24h).slice(0, 12);
  } else {
    filtered = relevant;
  }

  if (!filtered.length) {
    await bot.sendMessage(chatId,
      `ℹ️ Tidak ada market aktif untuk kategori <b>${(catNames[category] || category).toUpperCase()}</b> saat ini.\n\n` +
      `Coba <code>/poly hot</code> untuk melihat market dengan volume tertinggi.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Recalculate composite score for filtered set
  let ws = 0, tw = 0;
  filtered.forEach(m => { ws += m.contribution * m.weight; tw += m.weight; });
  const compScore = tw > 0 ? ws / tw : 0;

  const subtitles = {
    btc:   'Bitcoin Signal · Polymarket',
    eth:   'Ethereum Signal · Polymarket',
    macro: 'Macro Signal · Fed &amp; Economy',
    hot:   'Hot Markets · Aktivitas 24h Tertinggi',
  };

  const msg = buildReport(filtered, compScore, subtitles[category] || 'Polymarket Signal');
  await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
}

module.exports = { runPolyOverview, runPolyCategory };
