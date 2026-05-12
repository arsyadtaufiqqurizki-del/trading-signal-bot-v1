const { scanAllPairs } = require('./scanner');
const { getGlobalSentiment, getTrendingCoins } = require('./coingecko');
const { nowWIB, fmt, getSession } = require('./utils');

function formatSignal(signal, rank) {
  const dateStr = nowWIB();

  // Progress bar — cap visual at 20 points as "perfect signal" baseline
  const score = signal.confluenceScore || 0;
  const filled = Math.min(10, Math.round((score / 20) * 10));
  const progressBar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  const ms  = `HTF: ${signal.htfTrend}, LTF: ${signal.ltfTrend}`;
  const kl  = signal.nearLevel
    ? `${signal.nearLevel.type} @ ${fmt(signal.nearLevel.price)}`
    : 'Menunggu konfirmasi liquidity grab di level terdekat';
  const conf = signal.factors.join(', ');

  let confLevel = 'Low';
  if (score >= 10) confLevel = 'Very High';
  else if (score >= 7) confLevel = 'High';
  else if (score >= 5) confLevel = 'Medium';

  let setupType = 'Trend Continuation';
  if (signal.liquiditySweep) setupType = 'Liquidity Sweep Reversal 🎯';
  else if (signal.divergence) setupType = 'Divergence Reversal';
  else if (signal.bos)        setupType = 'BOS Breakout';

  const sessionWarn = signal.sessionInfo && !signal.sessionInfo.optimal
    ? `\n⚠️ <i>Di luar sesi optimal — eksekusi dengan hati-hati!</i>` : '';

  const sweepLine = signal.liquiditySweep
    ? `\n🎯 <b>LIQUIDITY SWEEP TERDETEKSI!</b> Smart money telah sweep ${signal.liquiditySweep === 'BULLISH_SWEEP' ? 'swing low' : 'swing high'} → high-probability reversal.`
    : '';

  const tvLink = `https://www.tradingview.com/chart/?symbol=BINANCE:${signal.pair.replace('/', '')}`;

  return `🏆 <b>RANK #${rank} | ${signal.pair}</b>
────────────────────
<b>Tipe:</b> ${signal.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT'}
<b>Setup:</b> ${setupType}
<b>Session:</b> ${signal.sessionInfo ? signal.sessionInfo.name : '-'}${sessionWarn}
<b>Market Phase:</b> ${signal.marketPhase || '-'}
<b>ADX:</b> ${signal.adx ? fmt(signal.adx, 1) : '-'} (Trend Strength)
<b>Confidence:</b> ${progressBar} ${score} pts (${confLevel})
${sweepLine}
🎯 <b>ENTRY STRATEGY:</b>
• <b>Aggressive:</b> ${fmt(signal.entryAggressive, 4)} (Market) → RR 1:${fmt(signal.rrAgg, 2)}
• <b>Conservative:</b> ${fmt(signal.entryConservative, 4)} (Limit) → RR 1:${fmt(signal.rrCons, 2)}

<b>🛑 STOP LOSS:</b> ${fmt(signal.sl, 4)}
<b>🏁 TAKE PROFIT:</b> ${fmt(signal.tp1, 4)} / ${fmt(signal.tp2, 4)}
<b>❌ INVALIDASI:</b> Setup gagal jika 1H close ${signal.direction === 'LONG' ? 'di bawah' : 'di atas'} <b>${fmt(signal.invalidationLevel, 4)}</b>

<b>💰 RISK SUGGESTION:</b> ${signal.riskSuggestion || '0.5% per trade'}

<b>📝 ANALISIS:</b>
• Market Structure: ${ms}
• Key Level: ${kl}
• Konfirmasi: ${conf}

📈 <b><a href="${tvLink}">Buka Chart TradingView</a></b>

⚠️ <i>Disclaimer: Sinyal probabilitas. Gunakan manajemen risiko.</i>`;
}

async function runAnalysis(bot, chatId, isSilent = false) {
  try {
    if (!isSilent) {
      await bot.sendMessage(chatId, `🔍 <b>Memulai Analisis Market (Binance & CoinGecko)...</b>\nSesi: ${getSession().name}`, { parse_mode: "HTML" });
      
      const sentiment = await getGlobalSentiment();
      let cgMsg = '';
      if (sentiment) {
        cgMsg += `🌍 Global Market: <b>${sentiment.marketCondition}</b> (BTC Dom: ${sentiment.btcDominance.toFixed(1)}%)\n`;
      }
      const trending = await getTrendingCoins();
      if (trending.length) {
        cgMsg += `🔥 Trending CoinGecko: ${trending.join(', ')}`;
      }
      
      if (cgMsg) {
        await bot.sendMessage(chatId, cgMsg, { parse_mode: "HTML" });
      }
    }

    const signals = await scanAllPairs();

    if (!signals || signals.length === 0) {
      if (!isSilent) {
        await bot.sendMessage(chatId, '📉 <b>No Trade Today</b>\nTidak ada setup valid yang memenuhi kriteria probabilitas tinggi (RR minimal 1:2 dan minimal 3 confluence).', { parse_mode: "HTML" });
      }
      return;
    }

    // Sort by confluenceScore descending and take top 3
    const topSignals = signals
      .sort((a, b) => (b.confluenceScore || 0) - (a.confluenceScore || 0))
      .slice(0, 3);

    if (!isSilent) {
      await bot.sendMessage(chatId, `💎 <b>TOP ${topSignals.length} HIGH PROBABILITY SETUPS</b>\nBerikut adalah setup terbaik berdasarkan skor konfluensi tertinggi:`, { parse_mode: "HTML" });
    }

    for (let i = 0; i < topSignals.length; i++) {
      const text = formatSignal(topSignals[i], i + 1);
      await bot.sendMessage(chatId, text, { parse_mode: "HTML" });
    }

  } catch (error) {
    console.error(error);
    if (!isSilent) {
      await bot.sendMessage(chatId, `❌ Terjadi kesalahan saat melakukan analisis: ${error.message}`);
    }
  }
}

module.exports = { formatSignal, runAnalysis };
