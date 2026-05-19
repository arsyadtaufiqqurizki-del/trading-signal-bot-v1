'use strict';

const axios = require('axios');
const { fmt, pct } = require('./utils');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const FAPI  = 'https://fapi.binance.com/fapi/v1';
const FDATA = 'https://fapi.binance.com/futures/data';
const REQ   = { timeout: 10000 };

// ─── Data Fetchers ────────────────────────────────────────────────────────────

async function fetchFearGreed() {
  try {
    const { data } = await axios.get('https://api.alternative.me/fng/?limit=2', REQ);
    const [curr, prev] = data.data;
    return { value: +curr.value, label: curr.value_classification, prevValue: +prev.value };
  } catch { return null; }
}

async function fetchGlobal() {
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
}

async function fetchBtcData() {
  try {
    const { data } = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_7d_change=true',
      REQ
    );
    const p = data.bitcoin;
    return { price: p.usd, change24h: p.usd_24h_change, change7d: p.usd_7d_change || null };
  } catch { return null; }
}

async function fetchBtcLSR() {
  try {
    const { data } = await axios.get(`${FDATA}/globalLongShortAccountRatio`, {
      params: { symbol: 'BTCUSDT', period: '1h', limit: 1 }, ...REQ
    });
    if (!data?.[0]) return null;
    return {
      longPct:  +data[0].longAccount  * 100,
      shortPct: +data[0].shortAccount * 100,
      ratio:    +data[0].longShortRatio
    };
  } catch { return null; }
}

async function fetchBtcOI() {
  try {
    const { data } = await axios.get(`${FDATA}/openInterestHist`, {
      params: { symbol: 'BTCUSDT', period: '1h', limit: 2 }, ...REQ
    });
    if (!data || data.length < 2) return null;
    const curr = data[data.length - 1];
    const prev = data[data.length - 2];
    const change = ((+curr.sumOpenInterestValue - +prev.sumOpenInterestValue) / +prev.sumOpenInterestValue) * 100;
    return { oiValue: +curr.sumOpenInterestValue, oiChange: change };
  } catch { return null; }
}

async function fetchBtcFunding() {
  try {
    const { data } = await axios.get(`${FAPI}/fundingRate`, {
      params: { symbol: 'BTCUSDT', limit: 1 }, ...REQ
    });
    return data?.[0] ? parseFloat(data[0].fundingRate) * 100 : null;
  } catch { return null; }
}

async function fetchPolyScore() {
  const RULES = [
    { pattern: /bitcoin.*(\$[\d,]+k?|all.time high|ath)/i,           direction: 'bull', weight: 1.5 },
    { pattern: /btc.*(\$[\d,]+k?|all.time high|ath)/i,               direction: 'bull', weight: 1.5 },
    { pattern: /will bitcoin (reach|hit|exceed|surpass)/i,            direction: 'bull', weight: 1.5 },
    { pattern: /bitcoin.*etf|spot.*bitcoin etf/i,                     direction: 'bull', weight: 2   },
    { pattern: /strategic.*bitcoin|bitcoin.*reserve/i,                direction: 'bull', weight: 2   },
    { pattern: /fed.*rate cut|interest rate cut/i,                    direction: 'bull', weight: 2   },
    { pattern: /quantitative easing|qe\b/i,                          direction: 'bull', weight: 1.5 },
    { pattern: /rate hike|fed.*hike|tightening/i,                    direction: 'bear', weight: 1.5 },
    { pattern: /recession/i,                                          direction: 'bear', weight: 2   },
    { pattern: /market crash|stock.*crash/i,                          direction: 'bear', weight: 1.5 },
    { pattern: /crypto.*ban|ban.*crypto/i,                           direction: 'bear', weight: 2   },
    { pattern: /sec.*crypto|crypto.*sec|sec.*lawsuit/i,              direction: 'bear', weight: 1.5 },
    { pattern: /crypto.*regulation/i,                                direction: 'bear', weight: 1   },
    { pattern: /altcoin.*season|alt.*season/i,                       direction: 'bull', weight: 1   },
    { pattern: /crypto.*crash|crypto.*collapse/i,                    direction: 'bear', weight: 1.5 },
  ];

  try {
    const { data } = await axios.get('https://gamma-api.polymarket.com/markets', {
      params: { limit: 100, active: true, closed: false }, timeout: 12000
    });
    if (!Array.isArray(data)) return null;

    let totalWeight = 0, weightedScore = 0;
    for (const market of data) {
      if (!market.question || !market.outcomePrices) continue;
      for (const rule of RULES) {
        if (!rule.pattern.test(market.question)) continue;
        const prices = typeof market.outcomePrices === 'string'
          ? JSON.parse(market.outcomePrices) : market.outcomePrices;
        const yesProb = prices?.[0] ? parseFloat(prices[0]) : null;
        if (yesProb === null) break;
        weightedScore += (rule.direction === 'bull' ? yesProb : -yesProb) * rule.weight;
        totalWeight   += rule.weight;
        break;
      }
    }
    return totalWeight > 0 ? +(weightedScore / totalWeight).toFixed(3) : null;
  } catch { return null; }
}

async function fetchUpcomingEvents() {
  try {
    const { getUpcomingEvents } = require('./economic-calendar');
    return await getUpcomingEvents(168); // 7 days
  } catch { return []; }
}

// ─── Composite Bias Score (-10 to +10) ───────────────────────────────────────

function computeBiasScore({ fg, global, btc, lsr, oi, funding, polyScore }) {
  let score = 0;
  const signals = [];

  // Fear & Greed (weight ±2)
  if (fg) {
    if (fg.value >= 80)      { score -= 2;    signals.push({ icon: '🔴', label: `Fear &amp; Greed ${fg.value} (Extreme Greed) — risiko koreksi besar`, type: 'bear' }); }
    else if (fg.value >= 65) { score -= 1;    signals.push({ icon: '🟠', label: `Fear &amp; Greed ${fg.value} (Greed) — mulai overheated`, type: 'bear' }); }
    else if (fg.value >= 50) { score += 1;    signals.push({ icon: '🟢', label: `Fear &amp; Greed ${fg.value} (Neutral-Greed) — sentimen positif`, type: 'bull' }); }
    else if (fg.value >= 35) { score += 0;    signals.push({ icon: '🟡', label: `Fear &amp; Greed ${fg.value} (Fear) — kehati-hatian`, type: 'neutral' }); }
    else if (fg.value >= 20) { score += 1.5;  signals.push({ icon: '🟢', label: `Fear &amp; Greed ${fg.value} (Extreme Fear) — zona akumulasi historis`, type: 'bull' }); }
    else                     { score += 2;    signals.push({ icon: '🟢', label: `Fear &amp; Greed ${fg.value} (Max Fear) — potensi bottom lokal`, type: 'bull' }); }
  }

  // BTC 7d price momentum (weight ±2)
  if (btc?.change7d != null) {
    if      (btc.change7d > 15)  { score += 2;   signals.push({ icon: '🟢', label: `BTC ${pct(btc.change7d)} (7d) — momentum sangat kuat`, type: 'bull' }); }
    else if (btc.change7d > 5)   { score += 1;   signals.push({ icon: '🟢', label: `BTC ${pct(btc.change7d)} (7d) — bullish moderat`, type: 'bull' }); }
    else if (btc.change7d > -5)  { score += 0.5; signals.push({ icon: '🟡', label: `BTC ${pct(btc.change7d)} (7d) — stabil/ranging`, type: 'neutral' }); }
    else if (btc.change7d > -15) { score -= 1;   signals.push({ icon: '🔴', label: `BTC ${pct(btc.change7d)} (7d) — tekanan jual`, type: 'bear' }); }
    else                         { score -= 2;   signals.push({ icon: '🔴', label: `BTC ${pct(btc.change7d)} (7d) — downtrend kuat`, type: 'bear' }); }
  }

  // BTC Dominance (weight ±1.5)
  if (global?.btcDom != null) {
    if      (global.btcDom < 44) { score += 1.5; signals.push({ icon: '🟢', label: `BTC Dom ${fmt(global.btcDom, 1)}% — alt season aktif`, type: 'bull' }); }
    else if (global.btcDom < 50) { score += 0.5; signals.push({ icon: '🟡', label: `BTC Dom ${fmt(global.btcDom, 1)}% — transisi ke altcoin`, type: 'neutral' }); }
    else if (global.btcDom < 58) { score += 0;   signals.push({ icon: '🟡', label: `BTC Dom ${fmt(global.btcDom, 1)}% — BTC season, altcoin lagging`, type: 'neutral' }); }
    else                         { score -= 1;   signals.push({ icon: '🔴', label: `BTC Dom ${fmt(global.btcDom, 1)}% — altcoin underperform signifikan`, type: 'bear' }); }
  }

  // Stablecoin dominance (weight ±1 — high stablecoin = fear/sidelines)
  if (global?.stableDom != null) {
    if      (global.stableDom > 14) { score -= 1;   signals.push({ icon: '🔴', label: `Stablecoin Dom ${fmt(global.stableDom, 1)}% — banyak capital di sidelines`, type: 'bear' }); }
    else if (global.stableDom > 10) { score -= 0.5; signals.push({ icon: '🟡', label: `Stablecoin Dom ${fmt(global.stableDom, 1)}% — sedikit elevated`, type: 'neutral' }); }
    else                            { score += 0.5; signals.push({ icon: '🟢', label: `Stablecoin Dom ${fmt(global.stableDom, 1)}% — capital sudah deployed`, type: 'bull' }); }
  }

  // Long/Short Ratio (weight ±1.5 — contrarian indicator)
  if (lsr?.ratio != null) {
    if      (lsr.ratio > 2.2) { score -= 1.5; signals.push({ icon: '🔴', label: `LSR BTC ${fmt(lsr.ratio, 2)} — crowded long, squeeze risk tinggi`, type: 'bear' }); }
    else if (lsr.ratio > 1.5) { score -= 0.5; signals.push({ icon: '🟠', label: `LSR BTC ${fmt(lsr.ratio, 2)} — long-heavy, waspada reversal`, type: 'bear' }); }
    else if (lsr.ratio < 0.7) { score += 1.5; signals.push({ icon: '🟢', label: `LSR BTC ${fmt(lsr.ratio, 2)} — short-heavy, potensi short squeeze`, type: 'bull' }); }
    else if (lsr.ratio < 0.9) { score += 0.5; signals.push({ icon: '🟢', label: `LSR BTC ${fmt(lsr.ratio, 2)} — slightly short-biased`, type: 'bull' }); }
    else                      { score += 0;   signals.push({ icon: '🟡', label: `LSR BTC ${fmt(lsr.ratio, 2)} — positioning balanced`, type: 'neutral' }); }
  }

  // Funding Rate (weight ±1 — negative = healthy, very positive = danger)
  if (funding != null) {
    if      (funding > 0.08)  { score -= 1;   signals.push({ icon: '🔴', label: `Funding Rate ${fmt(funding, 4)}% — longs terlalu dominan, overheated`, type: 'bear' }); }
    else if (funding > 0.03)  { score -= 0.5; signals.push({ icon: '🟠', label: `Funding Rate ${fmt(funding, 4)}% — long-biased, monitor closely`, type: 'bear' }); }
    else if (funding < -0.03) { score += 1;   signals.push({ icon: '🟢', label: `Funding Rate ${fmt(funding, 4)}% — shorts bayar longs, bullish lean`, type: 'bull' }); }
    else                      { score += 0.5; signals.push({ icon: '🟢', label: `Funding Rate ${fmt(funding, 4)}% — netral dan sehat`, type: 'bull' }); }
  }

  // Polymarket composite (weight ±2)
  if (polyScore != null) {
    if      (polyScore >=  0.35) { score += 2;   signals.push({ icon: '🟢', label: `Polymarket ${fmt(polyScore, 2)} — prediksi global sangat bullish`, type: 'bull' }); }
    else if (polyScore >=  0.10) { score += 1;   signals.push({ icon: '🟢', label: `Polymarket ${fmt(polyScore, 2)} — prediksi bullish moderat`, type: 'bull' }); }
    else if (polyScore <= -0.35) { score -= 2;   signals.push({ icon: '🔴', label: `Polymarket ${fmt(polyScore, 2)} — prediksi global sangat bearish`, type: 'bear' }); }
    else if (polyScore <= -0.10) { score -= 1;   signals.push({ icon: '🔴', label: `Polymarket ${fmt(polyScore, 2)} — prediksi bearish moderat`, type: 'bear' }); }
    else                         { score += 0;   signals.push({ icon: '🟡', label: `Polymarket ${fmt(polyScore, 2)} — pasar prediksi netral`, type: 'neutral' }); }
  }

  score = Math.max(-10, Math.min(10, Math.round(score * 10) / 10));

  const bullCount    = signals.filter(s => s.type === 'bull').length;
  const bearCount    = signals.filter(s => s.type === 'bear').length;
  const neutralCount = signals.filter(s => s.type === 'neutral').length;

  return { score, signals, bullCount, bearCount, neutralCount };
}

// ─── Bias Label & Bar ─────────────────────────────────────────────────────────

function getBiasLabel(score) {
  if      (score >= 7)  return 'SANGAT BULLISH 🚀';
  else if (score >= 4)  return 'BULLISH 🟢';
  else if (score >= 1)  return 'SEDIKIT BULLISH 🟡';
  else if (score >= -1) return 'NETRAL ⚖️';
  else if (score >= -4) return 'SEDIKIT BEARISH 🟠';
  else if (score >= -7) return 'BEARISH 🔴';
  else                  return 'SANGAT BEARISH ⛔';
}

function buildBiasBar(score) {
  // Maps -10..+10 → 0..10 filled chars
  const filled = Math.round((score + 10) / 20 * 10);
  const safe   = Math.max(0, Math.min(10, filled));
  return '█'.repeat(safe) + '░'.repeat(10 - safe);
}

// ─── Cycle Phase Detection ────────────────────────────────────────────────────

function detectCyclePhase({ fg, global, score }) {
  const fgV    = fg?.value ?? 50;
  const btcDom = global?.btcDom ?? 50;

  if (score >= 6 && fgV >= 70) return { phase: 'Late Bull / Distribution',   emoji: '⚠️', advice: 'Pertimbangkan partial profit taking, risiko koreksi meningkat' };
  if (score >= 4 && fgV >= 55) return { phase: 'Mid Bull',                   emoji: '🟢', advice: 'Trend kuat — kelola risk dengan trailing SL, jangan overleveraged' };
  if (score >= 1 && fgV >= 40) return { phase: 'Early Bull / Recovery',      emoji: '🟢', advice: 'Momentum mulai membangun — zona ideal untuk akumulasi bertahap' };
  if (score >= -2 && fgV >= 30) return { phase: 'Accumulation / Sideways',   emoji: '🟡', advice: 'Market ranging — DCA strategy, hindari FOMO dan leverage besar' };
  if (score < -2 && fgV <= 30) return { phase: 'Capitulation / Extreme Fear',emoji: '🔴', advice: 'Zona potensi bottom historis — akumulasi kecil, tunggu konfirmasi' };
  if (score < -5) return { phase: 'Bear Market',                              emoji: '⛔', advice: 'Fokus capital preservation — kurangi exposure, hindari leverage' };
  return { phase: 'Transisi / Tidak Jelas',                                   emoji: '🟡', advice: 'Arah market belum clear — kurangi size, tunggu sinyal konfirmasi' };
}

// ─── 3-Scenario Framework ─────────────────────────────────────────────────────

function buildScenarios({ score, btc }) {
  const p = btc?.price ?? 0;

  let bullProb, baseProb, bearProb;
  if      (score >= 6)  { bullProb = 55; baseProb = 33; bearProb = 12; }
  else if (score >= 3)  { bullProb = 40; baseProb = 42; bearProb = 18; }
  else if (score >= 0)  { bullProb = 28; baseProb = 45; bearProb = 27; }
  else if (score >= -3) { bullProb = 20; baseProb = 40; bearProb = 40; }
  else                  { bullProb = 12; baseProb = 30; bearProb = 58; }

  const fmtP = (n) => p > 0 ? '$' + Math.round(n).toLocaleString('en-US') : 'N/A';

  return [
    {
      emoji: '🐂', label: 'BULL CASE', prob: bullProb,
      target:    p > 0 ? `BTC breakout ke ${fmtP(p * 1.12)}` : 'Breakout ke resistance baru',
      condition: score >= 3 ? 'Momentum kuat berlanjut, ETF inflow, data macro supportive' : 'Butuh catalyst: data macro positif atau news bull besar',
      action:    'Long di area support kuat, target TP2 dengan trailing SL'
    },
    {
      emoji: '📊', label: 'BASE CASE', prob: baseProb,
      target:    p > 0 ? `BTC konsolidasi ${fmtP(p * 0.95)}–${fmtP(p * 1.05)}` : 'Ranging di level saat ini',
      condition: 'Tidak ada catalyst besar, market menunggu data ekonomi berikutnya',
      action:    'Scalp di batas range, avoid hold besar, size kecil'
    },
    {
      emoji: '🐻', label: 'BEAR CASE', prob: bearProb,
      target:    p > 0 ? `BTC koreksi ke ${fmtP(p * 0.88)}` : 'Retest support major',
      condition: score <= -3 ? 'Macro memburuk, liquidation cascade, bad news' : 'Trigger: data CPI buruk atau stop hunt besar di bawah support',
      action:    'Kurangi leverage, pasang SL ketat, ambil profit sebelum event risiko'
    }
  ];
}

// ─── AI Narrative ─────────────────────────────────────────────────────────────

async function generateNarrative({ score, biasLabel, fg, btc, global, lsr, funding, cyclePhase, events }) {
  if (!genAI) return null;
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const eventsText = events.length > 0
      ? events.slice(0, 3).map(e => e.event).join(', ')
      : 'Tidak ada event besar';

    const prompt = `Kamu adalah analis crypto senior dari hedge fund. Berdasarkan data berikut, tulis outlook pasar crypto dalam 2-3 kalimat yang tajam dan actionable dalam Bahasa Indonesia. Jangan gunakan bullet point.

Data:
- Bias Score: ${score > 0 ? '+' : ''}${score}/10 (${biasLabel})
- Fear & Greed: ${fg?.value ?? 'N/A'} (${fg?.label ?? 'N/A'})
- BTC: $${btc?.price?.toLocaleString('en-US') ?? 'N/A'} | 7d: ${btc?.change7d != null ? pct(btc.change7d) : 'N/A'}
- BTC Dominance: ${fmt(global?.btcDom, 1)}%
- Market Cap: ${global ? '$' + (global.totalMcap / 1e12).toFixed(2) + 'T (24h: ' + pct(global.mcapChange24h) + ')' : 'N/A'}
- LSR BTC: ${lsr ? fmt(lsr.ratio, 2) : 'N/A'}
- Funding Rate BTC: ${funding != null ? fmt(funding, 4) + '%' : 'N/A'}
- Fase Siklus: ${cyclePhase}
- Event Minggu Ini: ${eventsText}

Fokus: bias arah, risiko utama, dan satu advice konkret untuk trader.`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch { return null; }
}

// ─── Report Builder ───────────────────────────────────────────────────────────

function buildReport({ score, signals, scenarios, cycleInfo, events, btc, global, fg, lsr, oi, funding, narrative, bullCount, bearCount }) {
  const dateStr = new Date().toLocaleString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta'
  });
  const timeStr = new Date().toLocaleString('id-ID', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
  });

  const label = getBiasLabel(score);
  const bar   = buildBiasBar(score);
  const scoreStr = (score > 0 ? '+' : '') + score;

  let r = '';

  // ── Header ──
  r += `<b>🔭 MARKET OUTLOOK</b>\n`;
  r += `<i>7-Day Forward View · ${dateStr} · ${timeStr} WIB</i>\n`;
  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // ── Composite Bias ──
  r += `<b>COMPOSITE MARKET BIAS</b>\n`;
  r += `<code>${bar}</code>  <b>${scoreStr}/10</b>\n`;
  r += `Bias: <b>${label}</b>\n`;
  r += `Sinyal: ${bullCount} Bullish · ${bearCount} Bearish\n\n`;

  // ── Snapshot ──
  r += `<b>MARKET SNAPSHOT</b>\n`;
  if (btc) {
    r += `BTC : <b>$${btc.price?.toLocaleString('en-US') ?? 'N/A'}</b>`;
    r += `  24h ${pct(btc.change24h)}`;
    if (btc.change7d != null) r += `  7d ${pct(btc.change7d)}`;
    r += '\n';
  }
  if (global) {
    const mcapStr = global.totalMcap >= 1e12
      ? `$${(global.totalMcap / 1e12).toFixed(2)}T`
      : `$${(global.totalMcap / 1e9).toFixed(0)}B`;
    r += `MCap: <b>${mcapStr}</b>  (24h: ${pct(global.mcapChange24h)})\n`;
    const domNote = global.btcDom < 45 ? '← Alt Season 🔥' : global.btcDom > 58 ? '← BTC Season' : '';
    r += `BTC Dom: <b>${fmt(global.btcDom, 1)}%</b>  ${domNote}\n`;
  }
  if (fg) {
    const fgEmoji = fg.value >= 75 ? '😱' : fg.value >= 55 ? '😊' : fg.value >= 40 ? '😐' : fg.value >= 25 ? '😰' : '🤯';
    r += `F&amp;G: <b>${fg.value} — ${fg.label}</b> ${fgEmoji}\n`;
  }
  r += '\n';

  // ── Cycle Phase ──
  r += `<b>CYCLE PHASE</b>\n`;
  r += `${cycleInfo.emoji} <b>${cycleInfo.phase}</b>\n`;
  r += `<i>${cycleInfo.advice}</i>\n\n`;

  // ── Futures Sentiment ──
  if (lsr || oi || funding != null) {
    r += `<b>FUTURES SENTIMENT</b>\n`;
    if (lsr) {
      const lsrEmoji = lsr.ratio > 2.0 ? '⚠️' : lsr.ratio < 0.8 ? '🟢' : '⚖️';
      r += `LSR BTC : ${lsrEmoji} <b>${fmt(lsr.ratio, 2)}</b>  (Long ${fmt(lsr.longPct, 1)}% / Short ${fmt(lsr.shortPct, 1)}%)\n`;
    }
    if (oi) {
      const oiEmoji = oi.oiChange > 3 ? '📈' : oi.oiChange < -3 ? '📉' : '↔️';
      r += `OI BTC  : ${oiEmoji} ${oi.oiChange > 0 ? '+' : ''}${fmt(oi.oiChange, 2)}% (1h)\n`;
    }
    if (funding != null) {
      const fEmoji = funding > 0.06 ? '🔴' : funding < -0.02 ? '🟢' : '✅';
      const fNote  = funding > 0.06 ? '← longs overheated' : funding < 0 ? '← shorts bayar longs' : '← sehat';
      r += `Funding : ${fEmoji} <b>${fmt(funding, 4)}%</b>  ${fNote}\n`;
    }
    r += '\n';
  }

  // ── Signal Confluence ──
  r += `<b>SIGNAL CONFLUENCE</b>\n`;
  signals.forEach(s => { r += `${s.icon} ${s.label}\n`; });
  r += '\n';

  // ── 3-Scenario ──
  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  r += `<b>3-SCENARIO (7-Day)</b>\n`;
  for (const sc of scenarios) {
    r += `\n${sc.emoji} <b>${sc.label} — ${sc.prob}%</b>\n`;
    r += `   📍 ${sc.target}\n`;
    r += `   📋 <i>${sc.condition}</i>\n`;
    r += `   ⚡ ${sc.action}\n`;
  }

  // ── Upcoming Events ──
  if (events.length > 0) {
    r += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    r += `<b>📅 EVENT KALENDER MINGGU INI</b>\n`;
    for (const ev of events.slice(0, 5)) {
      const evDate = ev.timestamp
        ? ev.timestamp.toLocaleString('id-ID', {
            weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
          })
        : 'TBD';
      const impEmoji = (ev.impact || '').toLowerCase() === 'high' ? '🔴' : '🟡';
      r += `\n${impEmoji} <b>${ev.event}</b>  (${ev.country || 'Global'})\n`;
      r += `   📆 ${evDate} WIB\n`;
      if (ev.expected != null) r += `   Est: ${ev.expected}${ev.unit || ''}\n`;
    }
    r += `\n⚠️ <i>Kurangi leverage menjelang event di atas.</i>\n`;
  }

  // ── AI Narrative ──
  if (narrative) {
    r += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    r += `<b>🤖 AI MARKET INTELLIGENCE</b>\n`;
    r += `<i>${narrative}</i>\n`;
  }

  r += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  r += `<i>Sumber: Binance · CoinGecko · Fear&amp;Greed · Polymarket · Finnhub</i>\n`;
  r += `<i>Sub-command: /outlook macro · /outlook scenario</i>`;

  return r;
}

// ─── Sub-command: Macro Only ──────────────────────────────────────────────────

async function buildMacroReport({ fg, global, btc, lsr, oi, funding, events }) {
  const dateStr = new Date().toLocaleString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta'
  });
  const timeStr = new Date().toLocaleString('id-ID', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
  });

  let r = `<b>🌐 MACRO OUTLOOK</b>\n`;
  r += `<i>Dampak Ekonomi Global → Crypto · ${dateStr} · ${timeStr} WIB</i>\n`;
  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (global) {
    const mcapStr = global.totalMcap >= 1e12
      ? `$${(global.totalMcap / 1e12).toFixed(2)}T`
      : `$${(global.totalMcap / 1e9).toFixed(0)}B`;
    r += `<b>MARKET GLOBAL</b>\n`;
    r += `Total Market Cap: <b>${mcapStr}</b>  (24h: ${pct(global.mcapChange24h)})\n`;
    r += `BTC Dom: <b>${fmt(global.btcDom, 1)}%</b>  ETH Dom: <b>${fmt(global.ethDom, 1)}%</b>\n`;
    r += `Stablecoin Dom: <b>${fmt(global.stableDom, 1)}%</b>  ${global.stableDom > 12 ? '🔴 Elevated' : '🟢 Normal'}\n\n`;
  }

  if (events.length > 0) {
    r += `<b>📅 KALENDER EVENT MINGGU INI</b>\n`;
    const EVENT_IMPACT = {
      'Fed Funds Rate': { emoji: '🏛️', impact: 'Sangat Tinggi' },
      'Interest Rate':  { emoji: '🏛️', impact: 'Sangat Tinggi' },
      'CPI':            { emoji: '📊', impact: 'Tinggi — inverse BTC' },
      'PPI':            { emoji: '📊', impact: 'Tinggi' },
      'Non-Farm':       { emoji: '💼', impact: 'Tinggi' },
      'Nonfarm':        { emoji: '💼', impact: 'Tinggi' },
      'ECB':            { emoji: '🇪🇺', impact: 'Tinggi' },
      'BOJ':            { emoji: '🇯🇵', impact: 'Sedang-Tinggi' },
      'Unemployment':   { emoji: '💼', impact: 'Sedang' },
      'Retail Sales':   { emoji: '🛒', impact: 'Sedang' },
    };

    for (const ev of events.slice(0, 8)) {
      const evDate = ev.timestamp
        ? ev.timestamp.toLocaleString('id-ID', {
            weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
          })
        : 'TBD';
      const impEmoji  = (ev.impact || '').toLowerCase() === 'high' ? '🔴' : '🟡';
      const eventMeta = Object.entries(EVENT_IMPACT).find(([k]) => ev.event?.includes(k));
      const impactNote = eventMeta ? `  ← ${eventMeta[1].impact}` : '';

      r += `\n${impEmoji} <b>${ev.event}</b>${impactNote}\n`;
      r += `   ${ev.country || 'Global'} · ${evDate} WIB\n`;
      if (ev.previous != null) r += `   Prev: ${ev.previous}  `;
      if (ev.expected != null) r += `Est: ${ev.expected}`;
      if (ev.previous != null || ev.expected != null) r += '\n';
    }
  } else {
    r += `<b>📅 KALENDER EVENT</b>\n`;
    r += `Tidak ada event besar minggu ini (atau data tidak tersedia).\n`;
  }

  r += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  r += `<b>PANDUAN RISK MINGGU INI</b>\n`;
  const riskLevel = events.filter(e => (e.impact || '').toLowerCase() === 'high').length;
  if      (riskLevel >= 3) r += `🔴 <b>HIGH RISK WEEK</b> — Kurangi leverage, siapkan SL ketat\n`;
  else if (riskLevel >= 1) r += `🟡 <b>MODERATE RISK</b> — Hati-hati di sekitar waktu event\n`;
  else                     r += `🟢 <b>LOW RISK WEEK</b> — Market lebih bebas bergerak teknikal\n`;

  r += `\n<i>Detail sinyal: /outlook · Sinyal teknikal: /high · /fast</i>`;
  return r;
}

// ─── Sub-command: Scenario Only ───────────────────────────────────────────────

function buildScenarioReport({ score, scenarios, btc, fg }) {
  const label = getBiasLabel(score);
  const scoreStr = (score > 0 ? '+' : '') + score;

  let r = `<b>📐 SCENARIO ANALYSIS</b>\n`;
  r += `<i>3-Scenario Framework · 7-Day Horizon</i>\n`;
  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  r += `Bias Saat Ini: <b>${scoreStr}/10 — ${label}</b>\n`;
  if (btc) r += `BTC: <b>$${btc.price?.toLocaleString('en-US') ?? 'N/A'}</b>  7d: ${pct(btc.change7d)}\n`;
  if (fg)  r += `Fear &amp; Greed: <b>${fg.value} (${fg.label})</b>\n`;
  r += '\n';

  for (const sc of scenarios) {
    r += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    r += `${sc.emoji} <b>${sc.label} — ${sc.prob}% Probabilitas</b>\n\n`;
    r += `📍 <b>Target:</b> ${sc.target}\n\n`;
    r += `📋 <b>Kondisi:</b>\n<i>${sc.condition}</i>\n\n`;
    r += `⚡ <b>Action:</b>\n${sc.action}\n\n`;
  }

  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  r += `💡 <i>Probabilitas dihitung dari composite bias score, bukan jaminan arah. Selalu gunakan SL.</i>\n\n`;
  r += `<i>Outlook lengkap: /outlook · Macro view: /outlook macro</i>`;
  return r;
}

// ─── Pair Outlook — Fetchers ──────────────────────────────────────────────────

function resolvePairSymbol(keyword) {
  const { PAIRS } = require('./scanner');
  const kw = keyword.toUpperCase().replace('/USDT', '').replace(/USDT$/, '');
  const found = PAIRS.find(p =>
    p.name.toUpperCase().startsWith(kw + '/') ||
    p.symbol.toUpperCase() === kw + 'USDT' ||
    p.symbol.toUpperCase() === kw
  );
  return found
    ? { symbol: found.symbol, name: found.name, tier: found.tier }
    : { symbol: kw + 'USDT', name: kw + '/USDT', tier: null };
}

async function fetchPairLSR(symbol) {
  try {
    const { data } = await axios.get(`${FDATA}/globalLongShortAccountRatio`, {
      params: { symbol: symbol.toUpperCase(), period: '1h', limit: 1 }, ...REQ
    });
    if (!data?.[0]) return null;
    return { longPct: +data[0].longAccount * 100, shortPct: +data[0].shortAccount * 100, ratio: +data[0].longShortRatio };
  } catch { return null; }
}

async function fetchPairOIChange(symbol) {
  try {
    const { data } = await axios.get(`${FDATA}/openInterestHist`, {
      params: { symbol: symbol.toUpperCase(), period: '1h', limit: 2 }, ...REQ
    });
    if (!data || data.length < 2) return null;
    const curr = data[data.length - 1];
    const prev = data[data.length - 2];
    return {
      oiValue:  +curr.sumOpenInterestValue,
      oiChange: ((+curr.sumOpenInterestValue - +prev.sumOpenInterestValue) / +prev.sumOpenInterestValue) * 100
    };
  } catch { return null; }
}

// ─── Pair Bias Score ──────────────────────────────────────────────────────────

function computePairBiasScore({ htfBias, ltfStruct, ltfBos, ltfRsi, ltfAdx, execTrend, funding, lsr, change24h, btcBias4h, btcBias1h }) {
  let score = 0;
  const signals = [];

  // BTC macro correlation (weight ±2.5)
  if      (btcBias4h === 'BULLISH') { score += 1.5; signals.push({ icon: '🟢', label: 'BTC 4H Bullish — macro supportive', type: 'bull' }); }
  else if (btcBias4h === 'BEARISH') { score -= 1.5; signals.push({ icon: '🔴', label: 'BTC 4H Bearish — macro headwind', type: 'bear' }); }

  if      (btcBias1h === 'BULLISH') { score += 1;   signals.push({ icon: '🟢', label: 'BTC 1H Bullish — intraday momentum', type: 'bull' }); }
  else if (btcBias1h === 'BEARISH') { score -= 1;   signals.push({ icon: '🔴', label: 'BTC 1H Bearish — intraday tekanan', type: 'bear' }); }

  // 4H structure bias (weight ±2)
  if      (htfBias === 'BULLISH') { score += 2;   signals.push({ icon: '🟢', label: '4H Struktur Bullish — trend jangka menengah naik', type: 'bull' }); }
  else if (htfBias === 'BEARISH') { score -= 2;   signals.push({ icon: '🔴', label: '4H Struktur Bearish — trend jangka menengah turun', type: 'bear' }); }
  else                            { score += 0;   signals.push({ icon: '🟡', label: '4H Struktur Ranging — belum ada arah jelas', type: 'neutral' }); }

  // 1H trend (weight ±1.5)
  if      (ltfStruct?.trend === 'UPTREND')   { score += 1.5; signals.push({ icon: '🟢', label: '1H UPTREND — HH &amp; HL terbentuk', type: 'bull' }); }
  else if (ltfStruct?.trend === 'DOWNTREND') { score -= 1.5; signals.push({ icon: '🔴', label: '1H DOWNTREND — LH &amp; LL terbentuk', type: 'bear' }); }
  else                                       { score += 0;   signals.push({ icon: '🟡', label: '1H RANGING — konsolidasi, tunggu breakout', type: 'neutral' }); }

  // BOS 1H (weight ±1.5)
  if      (ltfBos === 'BULLISH_BOS') { score += 1.5; signals.push({ icon: '🟢', label: '1H Bullish BOS — struktur break ke atas', type: 'bull' }); }
  else if (ltfBos === 'BEARISH_BOS') { score -= 1.5; signals.push({ icon: '🔴', label: '1H Bearish BOS — struktur break ke bawah', type: 'bear' }); }

  // RSI 1H (weight ±1)
  if      (ltfRsi < 40) { score += 1;   signals.push({ icon: '🟢', label: `RSI 1H ${fmt(ltfRsi, 1)} — oversold, ruang naik tersedia`, type: 'bull' }); }
  else if (ltfRsi > 70) { score -= 1;   signals.push({ icon: '🔴', label: `RSI 1H ${fmt(ltfRsi, 1)} — overbought, waspada koreksi`, type: 'bear' }); }
  else                  { score += 0;   signals.push({ icon: '🟡', label: `RSI 1H ${fmt(ltfRsi, 1)} — zona netral`, type: 'neutral' }); }

  // ADX 1H (weight ±0.5)
  if      (ltfAdx > 25) { score += 0.5;  signals.push({ icon: '🟢', label: `ADX 1H ${fmt(ltfAdx, 1)} — trend kuat`, type: 'bull' }); }
  else if (ltfAdx < 15) { score -= 0.5;  signals.push({ icon: '🟡', label: `ADX 1H ${fmt(ltfAdx, 1)} — trend lemah/ranging`, type: 'neutral' }); }

  // 15m execution (weight ±0.5)
  if      (execTrend === 'UPTREND')   { score += 0.5; signals.push({ icon: '🟢', label: '15m Uptrend — momentum eksekusi bullish', type: 'bull' }); }
  else if (execTrend === 'DOWNTREND') { score -= 0.5; signals.push({ icon: '🔴', label: '15m Downtrend — momentum eksekusi bearish', type: 'bear' }); }

  // Funding rate (weight ±1)
  if (funding != null) {
    if      (funding > 0.08)  { score -= 1;   signals.push({ icon: '🔴', label: `Funding ${fmt(funding, 4)}% — longs dominan, overheated`, type: 'bear' }); }
    else if (funding > 0.03)  { score -= 0.5; signals.push({ icon: '🟠', label: `Funding ${fmt(funding, 4)}% — long-biased`, type: 'bear' }); }
    else if (funding < -0.02) { score += 1;   signals.push({ icon: '🟢', label: `Funding ${fmt(funding, 4)}% — shorts bayar longs`, type: 'bull' }); }
    else                      { score += 0.5; signals.push({ icon: '🟢', label: `Funding ${fmt(funding, 4)}% — sehat/netral`, type: 'bull' }); }
  }

  // LSR contrarian (weight ±1)
  if (lsr?.ratio != null) {
    if      (lsr.ratio > 2.2) { score -= 1;   signals.push({ icon: '🔴', label: `LSR ${fmt(lsr.ratio, 2)} — crowded long, squeeze risk`, type: 'bear' }); }
    else if (lsr.ratio < 0.7) { score += 1;   signals.push({ icon: '🟢', label: `LSR ${fmt(lsr.ratio, 2)} — short-heavy, potensi squeeze`, type: 'bull' }); }
    else                      { score += 0;   signals.push({ icon: '🟡', label: `LSR ${fmt(lsr.ratio, 2)} — positioning balanced`, type: 'neutral' }); }
  }

  // 24h price change (weight ±0.5)
  if (change24h != null) {
    if      (change24h > 5)  { score += 0.5; signals.push({ icon: '🟢', label: `24h ${pct(change24h)} — momentum harian positif`, type: 'bull' }); }
    else if (change24h < -5) { score -= 0.5; signals.push({ icon: '🔴', label: `24h ${pct(change24h)} — tekanan jual harian`, type: 'bear' }); }
  }

  score = Math.max(-10, Math.min(10, Math.round(score * 10) / 10));
  return {
    score,
    signals,
    bullCount:    signals.filter(s => s.type === 'bull').length,
    bearCount:    signals.filter(s => s.type === 'bear').length
  };
}

// ─── Pair Scenarios ───────────────────────────────────────────────────────────

function buildPairScenarios({ score, price }) {
  let bullProb, baseProb, bearProb;
  if      (score >= 6)  { bullProb = 55; baseProb = 33; bearProb = 12; }
  else if (score >= 3)  { bullProb = 40; baseProb = 42; bearProb = 18; }
  else if (score >= 0)  { bullProb = 28; baseProb = 45; bearProb = 27; }
  else if (score >= -3) { bullProb = 20; baseProb = 40; bearProb = 40; }
  else                  { bullProb = 12; baseProb = 30; bearProb = 58; }

  const dec  = price >= 1000 ? 1 : price >= 1 ? 3 : 6;
  const fmtP = (n) => price > 0
    ? '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : 'N/A';

  return [
    {
      emoji: '🐂', label: 'BULL CASE', prob: bullProb,
      target:    price > 0 ? `Rally ke ${fmtP(price * 1.15)}` : 'Breakout ke resistance baru',
      condition: score >= 3 ? 'Momentum berlanjut, BTC support, volume naik' : 'Butuh catalyst: BTC pump atau news positif sektoral',
      action:    'Long di support kuat, TP bertahap, SL di bawah struktur'
    },
    {
      emoji: '📊', label: 'BASE CASE', prob: baseProb,
      target:    price > 0 ? `Konsolidasi ${fmtP(price * 0.95)}–${fmtP(price * 1.05)}` : 'Ranging di level saat ini',
      condition: 'Market menunggu direction dari BTC atau data macro berikutnya',
      action:    'Scalp di batas range, ukuran posisi kecil'
    },
    {
      emoji: '🐻', label: 'BEAR CASE', prob: bearProb,
      target:    price > 0 ? `Koreksi ke ${fmtP(price * 0.85)}` : 'Retest support major',
      condition: score <= -3 ? 'Macro bearish, BTC dump, atau liquidation cascade' : 'Trigger: BTC breakdown atau bad news sektoral',
      action:    'Hindari buy, pasang SL ketat pada posisi open'
    }
  ];
}

// ─── Pair AI Narrative ────────────────────────────────────────────────────────

async function generatePairNarrative({ pairName, score, biasLabel, price, change24h, htfBias, ltfTrend, ltfRsi, ltfAdx, lsr, funding, btcBias4h, nearResistance, nearSupport }) {
  if (!genAI) return null;
  try {
    const model  = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Kamu adalah analis crypto senior. Tulis outlook pair ${pairName} dalam 2-3 kalimat yang tajam dan actionable dalam Bahasa Indonesia. Jangan gunakan bullet point.

Data:
- Harga: $${price?.toLocaleString('en-US') ?? 'N/A'} | 24h: ${change24h != null ? pct(change24h) : 'N/A'}
- Bias Score: ${score > 0 ? '+' : ''}${score}/10 (${biasLabel})
- 4H Bias: ${htfBias} | 1H Trend: ${ltfTrend}
- RSI 1H: ${ltfRsi != null ? fmt(ltfRsi, 1) : 'N/A'} | ADX 1H: ${ltfAdx != null ? fmt(ltfAdx, 1) : 'N/A'}
- BTC 4H: ${btcBias4h} | LSR: ${lsr ? fmt(lsr.ratio, 2) : 'N/A'}
- Funding: ${funding != null ? fmt(funding, 4) + '%' : 'N/A'}
- Resistance terdekat: ${nearResistance ?? 'N/A'} | Support terdekat: ${nearSupport ?? 'N/A'}

Fokus: bias arah pair ini, level kritis yang perlu diperhatikan, satu advice konkret.`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch { return null; }
}

// ─── Pair Report Builder ──────────────────────────────────────────────────────

function buildPairReport({ pairName, score, signals, scenarios, price, change24h, volume, htfBias, ltfStruct, ltfBos, ltfRsi, ltfAdx, execTrend, lsr, oi, funding, keyLevels, bullCount, bearCount, btcBias4h, narrative }) {
  const dateStr = new Date().toLocaleString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta'
  });
  const timeStr = new Date().toLocaleString('id-ID', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
  });

  const label    = getBiasLabel(score);
  const bar      = buildBiasBar(score);
  const scoreStr = (score > 0 ? '+' : '') + score;
  const dec      = price >= 1000 ? 1 : price >= 1 ? 4 : 6;
  const fmtPrice = (n) => n != null
    ? '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : 'N/A';

  const resistances = (keyLevels ?? []).filter(l => l.type === 'RESISTANCE' && l.price > price).sort((a, b) => a.price - b.price);
  const supports    = (keyLevels ?? []).filter(l => l.type === 'SUPPORT'    && l.price < price).sort((a, b) => b.price - a.price);

  const tvSymbol = pairName.replace('/', '');
  const tvLink   = `https://www.tradingview.com/chart/?symbol=BINANCE:${tvSymbol}`;
  const baseCoin = pairName.split('/')[0];

  const trendIcon = (t) => t === 'UPTREND' ? '📈' : t === 'DOWNTREND' ? '📉' : '↔️';
  const biasIcon  = (b) => b === 'BULLISH' ? '🟢' : b === 'BEARISH' ? '🔴' : '🟡';

  const volStr = volume >= 1e9 ? `$${(volume / 1e9).toFixed(2)}B` : volume >= 1e6 ? `$${(volume / 1e6).toFixed(0)}M` : volume ? `$${Math.round(volume)}` : 'N/A';

  let r = '';

  r += `<b>🔭 OUTLOOK ${pairName}</b>\n`;
  r += `<i>7-Day Pair View · ${dateStr} · ${timeStr} WIB</i>\n`;
  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  r += `<b>PAIR BIAS SCORE</b>\n`;
  r += `<code>${bar}</code>  <b>${scoreStr}/10</b>\n`;
  r += `Bias: <b>${label}</b>  |  ${bullCount} Bullish · ${bearCount} Bearish\n\n`;

  r += `<b>SNAPSHOT</b>\n`;
  r += `Harga   : <b>${fmtPrice(price)}</b>\n`;
  r += `24h     : <b>${pct(change24h)}</b>\n`;
  r += `Vol 24h : <b>${volStr}</b>\n\n`;

  r += `<b>MULTI-TIMEFRAME ANALYSIS</b>\n`;
  r += `4H Bias  : ${biasIcon(htfBias)} <b>${htfBias}</b>`;
  if (btcBias4h !== 'NEUTRAL') r += `  |  BTC 4H: ${biasIcon(btcBias4h)} ${btcBias4h}`;
  r += '\n';
  r += `1H Trend : ${trendIcon(ltfStruct?.trend)} <b>${ltfStruct?.trend ?? 'N/A'}</b>`;
  if (ltfBos) r += `  |  BOS: ${ltfBos === 'BULLISH_BOS' ? '🟢 BULL' : '🔴 BEAR'}`;
  r += '\n';
  r += `15m Exec : ${trendIcon(execTrend)} <b>${execTrend ?? 'N/A'}</b>\n`;
  r += `RSI 1H   : <b>${ltfRsi != null ? fmt(ltfRsi, 1) : 'N/A'}</b>`;
  if (ltfAdx != null) r += `  |  ADX 1H: <b>${fmt(ltfAdx, 1)}</b> ${ltfAdx > 25 ? '(Trending)' : ltfAdx < 15 ? '(Ranging)' : '(Transisi)'}`;
  r += '\n\n';

  if (resistances.length > 0 || supports.length > 0) {
    r += `<b>KEY LEVELS</b>\n`;
    resistances.slice(0, 2).forEach((lvl, i) => { r += `🔴 R${i + 1}: <b>${fmtPrice(lvl.price)}</b>\n`; });
    supports.slice(0, 2).forEach((lvl, i)    => { r += `🟢 S${i + 1}: <b>${fmtPrice(lvl.price)}</b>\n`; });
    r += '\n';
  }

  if (lsr || oi || funding != null) {
    r += `<b>FUTURES SENTIMENT</b>\n`;
    if (lsr) {
      const lsrEmoji = lsr.ratio > 2.0 ? '⚠️' : lsr.ratio < 0.8 ? '🟢' : '⚖️';
      r += `LSR     : ${lsrEmoji} <b>${fmt(lsr.ratio, 2)}</b>  (Long ${fmt(lsr.longPct, 1)}% / Short ${fmt(lsr.shortPct, 1)}%)\n`;
    }
    if (oi) {
      const oiEmoji = oi.oiChange > 3 ? '📈' : oi.oiChange < -3 ? '📉' : '↔️';
      r += `OI (1h) : ${oiEmoji} ${oi.oiChange > 0 ? '+' : ''}${fmt(oi.oiChange, 2)}%\n`;
    }
    if (funding != null) {
      const fEmoji = funding > 0.06 ? '🔴' : funding < -0.02 ? '🟢' : '✅';
      const fNote  = funding > 0.06 ? '← overheated' : funding < 0 ? '← shorts bayar' : '← sehat';
      r += `Funding : ${fEmoji} <b>${fmt(funding, 4)}%</b>  ${fNote}\n`;
    }
    r += '\n';
  }

  r += `<b>SIGNAL CONFLUENCE</b>\n`;
  signals.forEach(s => { r += `${s.icon} ${s.label}\n`; });

  r += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  r += `<b>3-SCENARIO (7-Day)</b>\n`;
  for (const sc of scenarios) {
    r += `\n${sc.emoji} <b>${sc.label} — ${sc.prob}%</b>\n`;
    r += `   📍 ${sc.target}\n`;
    r += `   📋 <i>${sc.condition}</i>\n`;
    r += `   ⚡ ${sc.action}\n`;
  }

  if (narrative) {
    r += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    r += `<b>🤖 AI PAIR INTELLIGENCE</b>\n`;
    r += `<i>${narrative}</i>\n`;
  }

  r += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  r += `📊 <b><a href="${tvLink}">Chart TradingView → BINANCE:${tvSymbol}</a></b>\n`;
  r += `<i>Sinyal teknikal: /fast ${baseCoin} · /high ${baseCoin} · Outlook global: /outlook</i>`;

  return r;
}

// ─── Main Export: Pair ────────────────────────────────────────────────────────

async function runOutlookPair(bot, chatId, keyword) {
  const { symbol, name: pairName } = resolvePairSymbol(keyword);

  await bot.sendMessage(chatId,
    `🔭 <b>Outlook ${pairName}</b>\nMenganalisis multi-timeframe &amp; futures data...`,
    { parse_mode: 'HTML' }
  );

  try {
    const { getKlines, getTicker, getFundingRate }                   = require('./binance');
    const { calcEMA, calcRSI, calcADX, detectStructure, detectBOS, findKeyLevels } = require('./indicators');

    const [htfCandles, ltfCandles, execCandles, btcHtfCandles, btcLtfCandles, ticker, funding, pairLsr, pairOi] = await Promise.all([
      getKlines(symbol,    '4h',  200),
      getKlines(symbol,    '1h',  200),
      getKlines(symbol,    '15m', 100),
      getKlines('BTCUSDT', '4h',  100),
      getKlines('BTCUSDT', '1h',  100),
      getTicker(symbol),
      getFundingRate(symbol),
      fetchPairLSR(symbol),
      fetchPairOIChange(symbol)
    ]);

    if (!htfCandles.length || !ltfCandles.length) {
      await bot.sendMessage(chatId,
        `❌ <b>Data tidak tersedia untuk ${pairName}.</b>\nPastikan pair ini tersedia di Binance Futures.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // ── Indicators ──
    const htfCloses = htfCandles.map(c => c.close);
    const ltfCloses = ltfCandles.map(c => c.close);

    const htfEma50  = calcEMA(htfCloses, 50);
    const htfEma200 = calcEMA(htfCloses, 200);
    const ltfRsiArr = calcRSI(ltfCloses, 14);
    const ltfAdxVal = calcADX(ltfCandles, 14);

    const htfStruct  = detectStructure(htfCandles);
    const ltfStruct  = detectStructure(ltfCandles);
    const ltfBos     = detectBOS(ltfCandles, ltfStruct);
    const execStruct = detectStructure(execCandles);
    const keyLevels  = findKeyLevels(htfCandles, 5);

    const price      = ltfCandles[ltfCandles.length - 1].close;
    const curHtfE50  = htfEma50[htfEma50.length - 1];
    const curHtfE200 = htfEma200[htfEma200.length - 1];
    const ltfRsi     = ltfRsiArr[ltfRsiArr.length - 1] ?? 50;

    let htfBias = 'NEUTRAL';
    if (curHtfE50 > curHtfE200 && htfStruct.trend !== 'DOWNTREND') htfBias = 'BULLISH';
    if (curHtfE50 < curHtfE200 && htfStruct.trend !== 'UPTREND')   htfBias = 'BEARISH';

    // ── BTC correlation ──
    const btcHtfCloses = btcHtfCandles.map(c => c.close);
    const btcHtfE50    = calcEMA(btcHtfCloses, 50);
    const btcHtfE200   = calcEMA(btcHtfCloses, 200);
    const btcLtfStruct = detectStructure(btcLtfCandles);

    let btcBias4h = 'NEUTRAL';
    if (btcHtfE50[btcHtfE50.length - 1] > btcHtfE200[btcHtfE200.length - 1]) btcBias4h = 'BULLISH';
    if (btcHtfE50[btcHtfE50.length - 1] < btcHtfE200[btcHtfE200.length - 1]) btcBias4h = 'BEARISH';

    let btcBias1h = 'NEUTRAL';
    if (btcLtfStruct.trend === 'UPTREND')   btcBias1h = 'BULLISH';
    if (btcLtfStruct.trend === 'DOWNTREND') btcBias1h = 'BEARISH';

    // ── Compute bias ──
    const { score, signals, bullCount, bearCount } = computePairBiasScore({
      htfBias, ltfStruct, ltfBos,
      ltfRsi, ltfAdx: ltfAdxVal,
      execTrend: execStruct.trend,
      funding, lsr: pairLsr,
      change24h: ticker.change24h,
      btcBias4h, btcBias1h
    });

    const biasLabel = getBiasLabel(score);
    const scenarios = buildPairScenarios({ score, price });

    // Nearest R/S for narrative
    const dec  = price >= 1000 ? 1 : price >= 1 ? 4 : 6;
    const rFmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const nearR = keyLevels.filter(l => l.type === 'RESISTANCE' && l.price > price).sort((a, b) => a.price - b.price)[0]?.price;
    const nearS = keyLevels.filter(l => l.type === 'SUPPORT'    && l.price < price).sort((a, b) => b.price - a.price)[0]?.price;

    const narrative = await generatePairNarrative({
      pairName, score, biasLabel, price,
      change24h: ticker.change24h,
      htfBias, ltfTrend: ltfStruct.trend,
      ltfRsi, ltfAdx: ltfAdxVal,
      lsr: pairLsr, funding, btcBias4h,
      nearResistance: nearR ? rFmt(nearR) : null,
      nearSupport:    nearS ? rFmt(nearS) : null
    });

    const report = buildPairReport({
      pairName, score, signals, scenarios,
      price, change24h: ticker.change24h, volume: ticker.volume,
      htfBias, ltfStruct, ltfBos,
      ltfRsi, ltfAdx: ltfAdxVal,
      execTrend: execStruct.trend,
      lsr: pairLsr, oi: pairOi, funding,
      keyLevels, bullCount, bearCount,
      btcBias4h, narrative
    });

    await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });

  } catch (e) {
    console.error('[OutlookPair]', e.message);
    await bot.sendMessage(chatId,
      `❌ <b>Gagal menganalisis ${pairName}:</b>\n<code>${e.message}</code>`,
      { parse_mode: 'HTML' }
    );
  }
}

// ─── Main Exports ─────────────────────────────────────────────────────────────

async function runOutlook(bot, chatId) {
  await bot.sendMessage(chatId,
    `🔭 <b>Market Outlook</b>\nMengumpulkan data dari semua sumber... sebentar!`,
    { parse_mode: 'HTML' }
  );

  const [fg, global, btc, lsr, oi, funding, polyScore, events] = await Promise.all([
    fetchFearGreed(),
    fetchGlobal(),
    fetchBtcData(),
    fetchBtcLSR(),
    fetchBtcOI(),
    fetchBtcFunding(),
    fetchPolyScore(),
    fetchUpcomingEvents()
  ]);

  const { score, signals, bullCount, bearCount } = computeBiasScore({ fg, global, btc, lsr, oi, funding, polyScore });
  const cycleInfo = detectCyclePhase({ fg, global, score });
  const scenarios = buildScenarios({ score, btc });
  const biasLabel = getBiasLabel(score);

  const narrative = await generateNarrative({
    score, biasLabel, fg, btc, global, lsr, funding, cyclePhase: cycleInfo.phase, events
  });

  const report = buildReport({
    score, signals, scenarios, cycleInfo, events,
    btc, global, fg, lsr, oi, funding,
    narrative, bullCount, bearCount
  });

  await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
}

async function runOutlookMacro(bot, chatId) {
  await bot.sendMessage(chatId, `🌐 <b>Macro Outlook</b>\nMengambil data ekonomi global...`, { parse_mode: 'HTML' });

  const [fg, global, btc, lsr, oi, funding, events] = await Promise.all([
    fetchFearGreed(),
    fetchGlobal(),
    fetchBtcData(),
    fetchBtcLSR(),
    fetchBtcOI(),
    fetchBtcFunding(),
    fetchUpcomingEvents()
  ]);

  const report = await buildMacroReport({ fg, global, btc, lsr, oi, funding, events });
  await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
}

async function runOutlookScenario(bot, chatId) {
  await bot.sendMessage(chatId, `📐 <b>Scenario Analysis</b>\nMenghitung skenario...`, { parse_mode: 'HTML' });

  const [fg, global, btc, lsr, oi, funding, polyScore] = await Promise.all([
    fetchFearGreed(),
    fetchGlobal(),
    fetchBtcData(),
    fetchBtcLSR(),
    fetchBtcOI(),
    fetchBtcFunding(),
    fetchPolyScore()
  ]);

  const { score } = computeBiasScore({ fg, global, btc, lsr, oi, funding, polyScore });
  const scenarios = buildScenarios({ score, btc });

  const report = buildScenarioReport({ score, scenarios, btc, fg });
  await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
}

module.exports = { runOutlook, runOutlookMacro, runOutlookScenario, runOutlookPair };
