'use strict';
const { fastScan } = require('./fast-scanner');
const { nowWIB, fmt } = require('./utils');

/**
 * Format sinyal fast — singkat, langsung ke inti, eksekusi-focused
 */
function formatFastSignal(sig) {
  const dateStr = nowWIB();

  // Alasan singkat (1-2 kalimat)
  const mainReason = sig.factors.slice(0, 2).join(' + ');
  let alasan = '';
  if (sig.direction === 'LONG') {
    alasan = `Setup bullish: ${mainReason}.`;
  } else {
    alasan = `Setup bearish: ${mainReason}.`;
  }

  // Format harga sesuai magnitude
  const decimals = sig.price >= 1000 ? 1 : sig.price >= 1 ? 4 : 6;

  const priceStr = (n) => {
    if (n == null || isNaN(n)) return 'N/A';
    return '$' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const dirEmoji = sig.direction === 'LONG' ? '📈 LONG' : '📉 SHORT';
  const conditionEmoji =
    sig.marketCondition === 'Trending' ? '📊' :
    sig.marketCondition === 'Volatile' ? '⚡' : '↔️';

  const leverageSuggestion = sig.marketCondition === 'Volatile'
    ? '5x–10x (hati-hati volatilitas tinggi)'
    : '10x–15x (manajemen risiko ketat)';

  return `⚡ Crypto Futures Signal – ${dateStr}

Pair: ${sig.pair}
Tipe: ${dirEmoji}

Entry: ${priceStr(sig.price)}
Take Profit: ${priceStr(sig.tp)}
Stop Loss: ${priceStr(sig.sl)}
RR: 1:${fmt(sig.rr, 2)}
Leverage Suggestion: ${leverageSuggestion}

Alasan Singkat:
${alasan}

${conditionEmoji} Market Condition: ${sig.marketCondition}${sig.rsi != null ? ` | RSI: ${fmt(sig.rsi, 1)}` : ''}${sig.trend !== 'RANGING' ? ` | Trend: ${sig.trend}` : ''}

⚠️ Ini adalah sinyal cepat berbasis analisis sederhana, risiko lebih tinggi dibanding setup konfirmasi penuh. Gunakan manajemen risiko.`;
}

/**
 * Fungsi utama — dipanggil dari webhook saat /fast
 */
async function runFastSignal(bot, chatId) {
  try {
    await bot.sendMessage(chatId, '⚡ <b>Fast Signal Mode</b>\nMengambil data real-time... sebentar ya!', { parse_mode: 'HTML' });

    const signal = await fastScan();

    const text = formatFastSignal(signal);
    await bot.sendMessage(chatId, text);

  } catch (error) {
    console.error('[FastAnalyzer] Error:', error);
    await bot.sendMessage(chatId, `❌ Gagal mengambil sinyal: ${error.message}\nCoba lagi dalam beberapa detik.`);
  }
}

module.exports = { runFastSignal };
