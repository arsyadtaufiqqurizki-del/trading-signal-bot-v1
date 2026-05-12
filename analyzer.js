const { scanAllPairs } = require('./scanner');
const { getGlobalSentiment, getTrendingCoins } = require('./coingecko');
const { nowWIB, fmt, getSession } = require('./utils');

function formatSignal(signal, rank) {
  const dateStr = nowWIB();
  
  // Progress Bar for Confidence
  const maxScore = 10;
  const score = signal.confluenceScore || 0;
  const filledLength = Math.round((score / maxScore) * 10);
  const emptyLength = maxScore - filledLength;
  const progressBar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
  
  const ms = `HTF: ${signal.htfTrend}, LTF: ${signal.ltfTrend}`;
  const kl = signal.nearLevel 
    ? `${signal.nearLevel.type} @ ${fmt(signal.nearLevel.price)}` 
    : 'Menunggu konfirmasi liquidity grab di level terdekat';
  const conf = signal.factors.join(', ');

  let reason = '';
  if (signal.direction === 'LONG') {
    reason = `Harga bertahan pada zona support HTF dengan momentum pergeseran ke bullish pada LTF (RSI ${fmt(signal.rsi,1)}). Terdapat konfirmasi technical confluence yang kuat, risk dijaga aman di bawah ATR support level.`;
  } else {
    reason = `Harga mengalami rejection kuat pada area resisten HTF, momentum seller mulai mendominasi (RSI ${fmt(signal.rsi,1)}). Entry point optimal dengan rasio risk/reward sehat, SL di atas ATR resisten level.`;
  }

  let confLevel = 'Medium';
  if (signal.confluenceScore >= 5) confLevel = 'High';
  else if (signal.confluenceScore <= 3) confLevel = 'Low';

  let setupType = 'Trend Continuation';
  if (signal.divergence) setupType = 'Reversal';
  else if (signal.bos) setupType = 'Breakout';

  const tvLink = `https://www.tradingview.com/chart/?symbol=BINANCE:${signal.pair}`;

  return `🏆 <b>RANK #${rank} | ${signal.pair}</b>
────────────────────
<b>Tipe:</b> ${signal.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT'}
<b>Setup:</b> ${setupType}
<b>Confidence:</b> ${progressBar} ${score}/10 (${confLevel})

<b>🎯 ENTRY AREA:</b> ${fmt(signal.entry, 4)}
<b>🏁 TAKE PROFIT:</b> ${fmt(signal.tp1, 4)} / ${fmt(signal.tp2, 4)}
<b>🛑 STOP LOSS:</b> ${fmt(signal.sl, 4)}
<b>⚖️ RISK REWARD:</b> 1:${fmt(signal.rr, 2)}

<b>📝 ANALISIS:</b>
• Market Structure: ${ms}
• Key Level: ${kl}
• Konfirmasi: ${conf}
• Alasan: ${reason}

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
