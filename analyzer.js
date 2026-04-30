const { scanAllPairs } = require('./scanner');
const { getGlobalSentiment, getTrendingCoins } = require('./coingecko');
const { nowWIB, fmt, getSession } = require('./utils');

function formatSignal(signal) {
  const dateStr = nowWIB();
  
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

  return `Crypto Trade Signal – ${dateStr}

Pair: ${signal.pair}
Tipe: ${signal.direction}

Entry Area: ${fmt(signal.entry, 4)}
Take Profit: ${fmt(signal.tp1, 4)} / ${fmt(signal.tp2, 4)}
Stop Loss: ${fmt(signal.sl, 4)}
Risk Reward Ratio: 1:${fmt(signal.rr, 2)}

Analisis:

Market Structure: ${ms}
Key Level: ${kl}
Konfirmasi: ${conf}
Alasan Entry: ${reason}

Confidence Level: ${confLevel}
Setup Type: ${setupType}

⚠️ Disclaimer: Sinyal ini berbasis analisis probabilitas, bukan jaminan profit. Selalu gunakan manajemen risiko.`;
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

    for (const sig of signals) {
      const text = formatSignal(sig);
      await bot.sendMessage(chatId, text);
    }

  } catch (error) {
    console.error(error);
    if (!isSilent) {
      await bot.sendMessage(chatId, `❌ Terjadi kesalahan saat melakukan analisis: ${error.message}`);
    }
  }
}

module.exports = { formatSignal, runAnalysis };
