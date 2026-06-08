'use strict';

const axios = require('axios');
const { fmt, pct } = require('./utils');

const DERIBIT_API = 'https://www.deribit.com/api/v2/public';
const REQ = { timeout: 15000 };

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

// ─── Data Fetchers ───────────────────────────────────────────────────────────

function fetchBookSummary(currency = 'BTC') {
  return cached(`deribit_book_${currency}`, 10 * 60_000, async () => {
    try {
      const { data } = await axios.get(`${DERIBIT_API}/get_book_summary_by_currency`, {
        params: { currency, kind: 'option' }, ...REQ
      });
      return Array.isArray(data.result) ? data.result : [];
    } catch { return []; }
  });
}

function fetchIndexPrice(currency = 'BTC') {
  return cached(`deribit_index_${currency}`, 5 * 60_000, async () => {
    try {
      const { data } = await axios.get(`${DERIBIT_API}/get_index_price`, {
        params: { index_name: currency.toLowerCase() + '_usd' }, ...REQ
      });
      return data.result?.index_price || null;
    } catch { return null; }
  });
}

function fetchInstruments(currency = 'BTC') {
  return cached(`deribit_instruments_${currency}`, 60 * 60_000, async () => {
    try {
      const { data } = await axios.get(`${DERIBIT_API}/get_instruments`, {
        params: { currency, kind: 'option', expired: false }, ...REQ
      });
      return Array.isArray(data.result) ? data.result : [];
    } catch { return []; }
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseInstrumentName(name) {
  // Format: BTC-28MAR25-65000-P
  const parts = name.split('-');
  if (parts.length < 4) return null;
  const strike = parseFloat(parts[2]);
  const optionType = parts[3].toLowerCase() === 'p' ? 'put' : 'call';
  const expiryStr = parts[1]; // e.g. 28MAR25
  return { strike, optionType, expiryStr, currency: parts[0] };
}

function parseExpiryDate(expiryStr) {
  // 28MAR25 → Date
  const months = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  const day = parseInt(expiryStr.slice(0, 2));
  const monthStr = expiryStr.slice(2, 5);
  const year = 2000 + parseInt(expiryStr.slice(5, 7));
  const month = months[monthStr];
  if (month == null) return null;
  return new Date(year, month, day);
}

function daysToExpiry(expiryDate) {
  const now = new Date();
  return Math.max(0, (expiryDate - now) / (1000 * 60 * 60 * 24));
}

// ─── Calculations ────────────────────────────────────────────────────────────

function calcPCR(options) {
  if (!options || options.length === 0) return null;

  let putVolume = 0, callVolume = 0;
  let putOI = 0, callOI = 0;

  for (const opt of options) {
    const parsed = parseInstrumentName(opt.instrument_name);
    if (!parsed) continue;

    const vol = opt.volume || 0;
    const oi = opt.open_interest || 0;

    if (parsed.optionType === 'put') {
      putVolume += vol;
      putOI += oi;
    } else {
      callVolume += vol;
      callOI += oi;
    }
  }

  const volumePCR = callVolume > 0 ? putVolume / callVolume : null;
  const oiPCR = callOI > 0 ? putOI / callOI : null;

  let sentiment = 'Netral';
  if (volumePCR != null) {
    if (volumePCR >= 1.3) sentiment = 'Sangat Bearish';
    else if (volumePCR >= 1.1) sentiment = 'Bearish';
    else if (volumePCR >= 0.9) sentiment = 'Netral';
    else if (volumePCR >= 0.7) sentiment = 'Slightly Bullish';
    else sentiment = 'Bullish';
  }

  return {
    volumePCR: volumePCR != null ? +volumePCR.toFixed(3) : null,
    oiPCR: oiPCR != null ? +oiPCR.toFixed(3) : null,
    putVolume, callVolume, putOI, callOI,
    sentiment
  };
}

function calcMaxPain(options, spotPrice) {
  if (!options || options.length === 0 || !spotPrice) return null;

  const strikes = new Set();
  const calls = [];
  const puts = [];

  for (const opt of options) {
    const parsed = parseInstrumentName(opt.instrument_name);
    if (!parsed) continue;
    strikes.add(parsed.strike);
    if (parsed.optionType === 'call') {
      calls.push({ strike: parsed.strike, oi: opt.open_interest || 0 });
    } else {
      puts.push({ strike: parsed.strike, oi: opt.open_interest || 0 });
    }
  }

  const sortedStrikes = [...strikes].sort((a, b) => a - b);
  if (sortedStrikes.length === 0) return null;

  let maxPainStrike = sortedStrikes[0];
  let minPain = Infinity;

  for (const testStrike of sortedStrikes) {
    let totalPain = 0;

    for (const call of calls) {
      if (testStrike > call.strike) {
        totalPain += (testStrike - call.strike) * call.oi;
      }
    }

    for (const put of puts) {
      if (testStrike < put.strike) {
        totalPain += (put.strike - testStrike) * put.oi;
      }
    }

    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = testStrike;
    }
  }

  const diffFromSpot = ((maxPainStrike - spotPrice) / spotPrice) * 100;
  let bias = 'Netral';
  if (diffFromSpot > 3) bias = 'Bullish (magnet di atas)';
  else if (diffFromSpot > 1) bias = 'Slightly Bullish';
  else if (diffFromSpot < -3) bias = 'Bearish (magnet di bawah)';
  else if (diffFromSpot < -1) bias = 'Slightly Bearish';
  else bias = 'Netral (dekat spot)';

  return {
    maxPain: maxPainStrike,
    diffFromSpot: +diffFromSpot.toFixed(2),
    bias
  };
}

function calcIVMetrics(options) {
  if (!options || options.length === 0) return null;

  const ivs = [];
  for (const opt of options) {
    if (opt.mark_iv && opt.mark_iv > 0 && opt.mark_iv < 500) {
      ivs.push(opt.mark_iv);
    }
  }

  if (ivs.length === 0) return null;

  ivs.sort((a, b) => a - b);
  const currentIV = ivs.reduce((s, v) => s + v, 0) / ivs.length;
  const minIV = ivs[Math.floor(ivs.length * 0.05)] || ivs[0];
  const maxIV = ivs[Math.floor(ivs.length * 0.95)] || ivs[ivs.length - 1];

  const ivRank = maxIV > minIV ? ((currentIV - minIV) / (maxIV - minIV)) * 100 : 50;

  let ivLabel = 'Moderate';
  if (ivRank >= 80) ivLabel = 'Sangat Tinggi (Squeeze)';
  else if (ivRank >= 60) ivLabel = 'Tinggi';
  else if (ivRank >= 40) ivLabel = 'Moderate';
  else if (ivRank >= 20) ivLabel = 'Rendah';
  else ivLabel = 'Sangat Rendah (Calm)';

  return {
    currentIV: +currentIV.toFixed(2),
    ivRank: +ivRank.toFixed(1),
    ivLabel,
    minIV: +minIV.toFixed(2),
    maxIV: +maxIV.toFixed(2)
  };
}

function detectUnusualActivity(options, spotPrice) {
  if (!options || options.length === 0) return [];

  const unusual = [];

  // Calculate average volume per strike
  const strikeMap = new Map();
  for (const opt of options) {
    const parsed = parseInstrumentName(opt.instrument_name);
    if (!parsed) continue;

    const key = `${parsed.strike}-${parsed.optionType}`;
    if (!strikeMap.has(key)) {
      strikeMap.set(key, { strike: parsed.strike, type: parsed.optionType, volume: 0, oi: 0 });
    }
    const entry = strikeMap.get(key);
    entry.volume += opt.volume || 0;
    entry.oi += opt.open_interest || 0;
  }

  const allVols = [...strikeMap.values()].map(e => e.volume).filter(v => v > 0);
  if (allVols.length === 0) return [];

  const avgVol = allVols.reduce((s, v) => s + v, 0) / allVols.length;
  const stdDev = Math.sqrt(allVols.reduce((s, v) => s + Math.pow(v - avgVol, 2), 0) / allVols.length);
  const threshold = avgVol + (stdDev * 2); // 2 std dev above mean

  for (const [, entry] of strikeMap) {
    if (entry.volume > threshold && entry.volume > 100) {
      const distFromSpot = spotPrice ? ((entry.strike - spotPrice) / spotPrice) * 100 : 0;
      const isNearSpot = Math.abs(distFromSpot) < 5;

      unusual.push({
        strike: entry.strike,
        type: entry.type,
        volume: entry.volume,
        oi: entry.oi,
        distFromSpot: +distFromSpot.toFixed(2),
        nearSpot: isNearSpot,
        severity: entry.volume > threshold * 2 ? 'EXTREME' : 'HIGH',
        msg: `${entry.type === 'call' ? '📞' : '📱'} Heavy ${entry.type} @ $${entry.strike.toLocaleString()} (${entry.volume} vol, ${distFromSpot > 0 ? '+' : ''}${distFromSpot.toFixed(1)}% dari spot)`
      });
    }
  }

  // Sort by volume desc
  unusual.sort((a, b) => b.volume - a.volume);
  return unusual.slice(0, 5);
}

function calcGEX(options, spotPrice) {
  if (!options || options.length === 0 || !spotPrice) return null;

  let totalGEX = 0;

  for (const opt of options) {
    const parsed = parseInstrumentName(opt.instrument_name);
    if (!parsed) continue;

    const oi = opt.open_interest || 0;
    if (oi === 0) continue;

    // Simplified GEX: gamma * OI * spot^2 / 10^7
    // Gamma approximation: near ATM options have highest gamma
    const distFromSpot = Math.abs(parsed.strike - spotPrice) / spotPrice;
    const gammaApprox = Math.exp(-distFromSpot * 10); // crude approximation

    // Calls have positive gamma for dealers (long gamma), puts have negative
    const sign = parsed.optionType === 'call' ? 1 : -1;
    totalGEX += sign * gammaApprox * oi;
  }

  const gexSign = totalGEX >= 0 ? 'Positive' : 'Negative';
  let interpretation;
  if (totalGEX >= 0) {
    interpretation = 'Dealer long gamma → hedging supports mean reversion, suppresses vol';
  } else {
    interpretation = 'Dealer short gamma → hedging amplifies moves, vol expansion risk';
  }

  // Normalize to a readable scale
  const normalized = totalGEX >= 0 ? Math.min(100, Math.log10(Math.abs(totalGEX) + 1) * 20) : -Math.min(100, Math.log10(Math.abs(totalGEX) + 1) * 20);

  return {
    gexValue: +totalGEX.toFixed(0),
    gexSign,
    normalizedGEX: +normalized.toFixed(1),
    interpretation
  };
}

// ─── Report Builder ──────────────────────────────────────────────────────────

function buildOptionsReport(options, spotPrice, currency) {
  const pcr = calcPCR(options);
  const maxPain = calcMaxPain(options, spotPrice);
  const iv = calcIVMetrics(options);
  const unusual = detectUnusualActivity(options, spotPrice);
  const gex = calcGEX(options, spotPrice);

  const dateStr = new Date().toLocaleString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta'
  });
  const timeStr = new Date().toLocaleString('id-ID', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
  });

  let r = `<b>📊 OPTIONS FLOW ANALYSIS (${currency})</b>\n`;
  r += `<i>Deribit Options Market · ${dateStr} · ${timeStr} WIB</i>\n`;
  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Spot price
  if (spotPrice) {
    r += `<b>Spot Price:</b> $${spotPrice.toLocaleString('en-US')}\n\n`;
  }

  // PCR
  r += `<b>📉 PUT/CALL RATIO</b>\n`;
  if (pcr) {
    const pcrBar = pcr.volumePCR >= 1 ? '█'.repeat(Math.min(10, Math.round(pcr.volumePCR * 5))) : '█'.repeat(Math.max(1, Math.round(pcr.volumePCR * 10)));
    r += `Volume PCR : <b>${pcr.volumePCR}</b> — ${pcr.sentiment}\n`;
    r += `OI PCR     : <b>${pcr.oiPCR}</b>\n`;
    r += `Put Vol    : ${pcr.putVolume.toLocaleString()} | Call Vol : ${pcr.callVolume.toLocaleString()}\n`;
    r += `Put OI     : ${pcr.putOI.toLocaleString()} | Call OI  : ${pcr.callOI.toLocaleString()}\n`;
  } else {
    r += `Data tidak tersedia\n`;
  }
  r += '\n';

  // Max Pain
  r += `<b>🎯 MAX PAIN</b>\n`;
  if (maxPain) {
    r += `Max Pain  : <b>$${maxPain.maxPain.toLocaleString('en-US')}</b>\n`;
    r += `vs Spot   : ${maxPain.diffFromSpot > 0 ? '+' : ''}${maxPain.diffFromSpot}%\n`;
    r += `Bias      : ${maxPain.bias}\n`;
  } else {
    r += `Data tidak tersedia\n`;
  }
  r += '\n';

  // IV Metrics
  r += `<b>🌡️ IMPLIED VOLATILITY</b>\n`;
  if (iv) {
    const ivBar = '█'.repeat(Math.round(iv.ivRank / 10)) + '░'.repeat(10 - Math.round(iv.ivRank / 10));
    r += `IV Rank   : <code>${ivBar}</code> <b>${iv.ivRank}%</b>\n`;
    r += `Label     : ${iv.ivLabel}\n`;
    r += `Avg IV    : ${iv.currentIV}% (Range: ${iv.minIV}% - ${iv.maxIV}%)\n`;
  } else {
    r += `Data tidak tersedia\n`;
  }
  r += '\n';

  // Unusual Activity
  r += `<b>⚠️ UNUSUAL OPTIONS ACTIVITY</b>\n`;
  if (unusual.length > 0) {
    for (const u of unusual) {
      const sevEmoji = u.severity === 'EXTREME' ? '🔴' : '🟠';
      r += `${sevEmoji} ${u.msg}\n`;
    }
  } else {
    r += `✅ Tidak ada aktivitas tidak biasa terdeteksi\n`;
  }
  r += '\n';

  // GEX
  r += `<b>🔬 GAMMA EXPOSURE (GEX)</b>\n`;
  if (gex) {
    const gexEmoji = gex.gexSign === 'Positive' ? '🟢' : '🔴';
    r += `GEX       : ${gexEmoji} <b>${gex.gexSign}</b> (${gex.gexValue})\n`;
    r += `<i>${gex.interpretation}</i>\n`;
  } else {
    r += `Data tidak tersedia\n`;
  }

  r += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  r += `<i>Sumber: Deribit Public API · Data 24h rolling</i>\n`;
  r += `<i>Sub-command: /options unusual · /options ETH</i>`;

  return r;
}

// ─── Compact Sentiment for Outlook Integration ───────────────────────────────

function buildOptionsSentimentBlock(options, spotPrice) {
  const pcr = calcPCR(options);
  const maxPain = calcMaxPain(options, spotPrice);
  const iv = calcIVMetrics(options);
  const unusual = detectUnusualActivity(options, spotPrice);
  const gex = calcGEX(options, spotPrice);

  let r = `<b>OPTIONS SENTIMENT</b>\n`;

  if (pcr) {
    const pcrEmoji = pcr.volumePCR >= 1.1 ? '🔴' : pcr.volumePCR <= 0.7 ? '🟢' : '⚖️';
    r += `PCR       : ${pcrEmoji} <b>${pcr.volumePCR}</b> (${pcr.sentiment})\n`;
  }
  if (maxPain) {
    r += `Max Pain  : <b>$${maxPain.maxPain.toLocaleString('en-US')}</b> (${maxPain.diffFromSpot > 0 ? '+' : ''}${maxPain.diffFromSpot}%)\n`;
  }
  if (iv) {
    const ivEmoji = iv.ivRank >= 70 ? '🔥' : iv.ivRank <= 30 ? '😴' : '⚖️';
    r += `IV Rank   : ${ivEmoji} <b>${iv.ivRank}%</b> (${iv.ivLabel})\n`;
  }
  if (unusual.length > 0) {
    r += `Unusual   : ⚠️ ${unusual[0].msg}\n`;
    if (unusual.length > 1) r += `            +${unusual.length - 1} lainnya\n`;
  }
  if (gex) {
    const gexEmoji = gex.gexSign === 'Positive' ? '🟢' : '🔴';
    r += `GEX       : ${gexEmoji} <b>${gex.gexSign}</b> — ${gex.gexSign === 'Positive' ? 'mean reversion' : 'vol expansion'}\n`;
  }

  return r;
}

// ─── Options Bias Score for Outlook ──────────────────────────────────────────

function computeOptionsBias(options, spotPrice) {
  if (!options || options.length === 0) return { score: 0, signals: [] };

  let score = 0;
  const signals = [];

  const pcr = calcPCR(options);
  const maxPain = calcMaxPain(options, spotPrice);
  const iv = calcIVMetrics(options);
  const gex = calcGEX(options, spotPrice);
  const unusual = detectUnusualActivity(options, spotPrice);

  // PCR bias (weight ±1.5)
  if (pcr?.volumePCR != null) {
    if (pcr.volumePCR >= 1.3) {
      score += 1.5;
      signals.push({ icon: '🟢', label: `Options PCR ${pcr.volumePCR} — heavy put buying, potensi contrarian bullish`, type: 'bull' });
    } else if (pcr.volumePCR >= 1.1) {
      score += 0.5;
      signals.push({ icon: '🟡', label: `Options PCR ${pcr.volumePCR} — bearish leaning`, type: 'neutral' });
    } else if (pcr.volumePCR <= 0.6) {
      score -= 1;
      signals.push({ icon: '🔴', label: `Options PCR ${pcr.volumePCR} — heavy call buying, complacency risk`, type: 'bear' });
    } else if (pcr.volumePCR <= 0.8) {
      score -= 0.5;
      signals.push({ icon: '🟡', label: `Options PCR ${pcr.volumePCR} — slightly bullish`, type: 'neutral' });
    }
  }

  // Max Pain pull (weight ±1)
  if (maxPain && spotPrice) {
    const diff = maxPain.diffFromSpot;
    if (diff > 5) {
      score += 1;
      signals.push({ icon: '🟢', label: `Max Pain $${maxPain.maxPain.toLocaleString()} (+${diff}%) — magnet atas`, type: 'bull' });
    } else if (diff < -5) {
      score -= 1;
      signals.push({ icon: '🔴', label: `Max Pain $${maxPain.maxPain.toLocaleString()} (${diff}%) — magnet bawah`, type: 'bear' });
    }
  }

  // GEX (weight ±1)
  if (gex) {
    if (gex.gexSign === 'Negative') {
      score -= 1;
      signals.push({ icon: '🔴', label: `GEX Negative — dealer short gamma, vol expansion risk`, type: 'bear' });
    } else {
      score += 0.5;
      signals.push({ icon: '🟢', label: `GEX Positive — dealer long gamma, mean reversion`, type: 'bull' });
    }
  }

  return { score: Math.max(-3, Math.min(3, Math.round(score * 10) / 10)), signals };
}

// ─── Main Handlers ───────────────────────────────────────────────────────────

async function runOptions(bot, chatId, currency = 'BTC') {
  await bot.sendMessage(chatId, `📊 Mengambil data options ${currency} dari Deribit...`, { parse_mode: 'HTML' });

  const [options, spotPrice] = await Promise.all([
    fetchBookSummary(currency),
    fetchIndexPrice(currency)
  ]);

  if (!options || options.length === 0) {
    await bot.sendMessage(chatId, `❌ Data options ${currency} tidak tersedia dari Deribit.`, { parse_mode: 'HTML' });
    return;
  }

  const report = buildOptionsReport(options, spotPrice, currency);
  await bot.sendMessage(chatId, report, { parse_mode: 'HTML', disable_web_page_preview: true });
}

async function runOptionsUnusual(bot, chatId, currency = 'BTC') {
  await bot.sendMessage(chatId, `🔍 Scanning unusual options activity ${currency}...`, { parse_mode: 'HTML' });

  const [options, spotPrice] = await Promise.all([
    fetchBookSummary(currency),
    fetchIndexPrice(currency)
  ]);

  if (!options || options.length === 0) {
    await bot.sendMessage(chatId, `❌ Data options ${currency} tidak tersedia.`, { parse_mode: 'HTML' });
    return;
  }

  const unusual = detectUnusualActivity(options, spotPrice);
  const pcr = calcPCR(options);
  const gex = calcGEX(options, spotPrice);

  let r = `<b>⚠️ UNUSUAL OPTIONS ACTIVITY (${currency})</b>\n`;
  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (pcr) {
    r += `<b>Quick PCR:</b> ${pcr.volumePCR} (${pcr.sentiment})\n`;
    if (gex) r += `<b>GEX:</b> ${gex.gexSign}\n`;
    r += '\n';
  }

  if (unusual.length > 0) {
    r += `<b>🚨 DETECTED (${unusual.length})</b>\n\n`;
    for (const u of unusual) {
      const sevEmoji = u.severity === 'EXTREME' ? '🔴 EXTREME' : '🟠 HIGH';
      r += `${sevEmoji}\n`;
      r += `Strike: <b>$${u.strike.toLocaleString()}</b> (${u.type.toUpperCase()})\n`;
      r += `Volume: ${u.volume.toLocaleString()} | OI: ${u.oi.toLocaleString()}\n`;
      r += `vs Spot: ${u.distFromSpot > 0 ? '+' : ''}${u.distFromSpot}%\n\n`;
    }
  } else {
    r += `✅ Tidak ada aktivitas tidak biasa terdeteksi\n`;
    r += `Semua volume options dalam range normal.\n`;
  }

  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  r += `<i>Full analysis: /options ${currency}</i>`;

  await bot.sendMessage(chatId, r, { parse_mode: 'HTML', disable_web_page_preview: true });
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  runOptions,
  runOptionsUnusual,
  fetchBookSummary,
  fetchIndexPrice,
  buildOptionsSentimentBlock,
  computeOptionsBias
};
