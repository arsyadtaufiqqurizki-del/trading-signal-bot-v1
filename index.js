'use strict';

require('dotenv').config();
const { scanAllPairs } = require('./scanner');
const { getGlobalSentiment, getTrendingCoins } = require('./coingecko');
const { nowWIB, fmt, getSession } = require('./utils');
const TelegramBot = require('node-telegram-bot-api');

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const bot = botToken ? new TelegramBot(botToken, { polling: false }) : null;

function formatSignal(signal) {
  const dateStr = nowWIB();
  
  // Market Structure
  const ms = `HTF: ${signal.htfTrend}, LTF: ${signal.ltfTrend}`;
  
  // Key Level
  const kl = signal.nearLevel 
    ? `${signal.nearLevel.type} @ ${fmt(signal.nearLevel.price)}` 
    : 'Menunggu konfirmasi liquidity grab di level terdekat';

  // Konfirmasi
  const conf = signal.factors.join(', ');

  // Alasan Entry
  let reason = '';
  if (signal.direction === 'LONG') {
    reason = `Harga bertahan pada zona support HTF dengan momentum pergeseran ke bullish pada LTF (RSI ${fmt(signal.rsi,1)}). Terdapat konfirmasi technical confluence yang kuat, risk dijaga aman di bawah ATR support level.`;
  } else {
    reason = `Harga mengalami rejection kuat pada area resisten HTF, momentum seller mulai mendominasi (RSI ${fmt(signal.rsi,1)}). Entry point optimal dengan rasio risk/reward sehat, SL di atas ATR resisten level.`;
  }

  // Confidence Level
  let confLevel = 'Medium';
  if (signal.confluenceScore >= 5) confLevel = 'High';
  else if (signal.confluenceScore <= 3) confLevel = 'Low';

  // Setup Type
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

async function main() {
  console.log(`[${nowWIB()}] Menjalankan analisis market (Binance & CoinGecko)...`);
  
  const session = getSession();
  console.log(`Current Session: ${session.name}`);

  // Fetch from CoinGecko
  const sentiment = await getGlobalSentiment();
  if (sentiment) {
    console.log(`Global Market: ${sentiment.marketCondition} (BTC Dom: ${sentiment.btcDominance.toFixed(1)}%)`);
  }

  const trending = await getTrendingCoins();
  if (trending.length) {
    console.log(`Trending di CoinGecko: ${trending.join(', ')}`);
  }

  console.log('Mencari setup high-probability...');
  const signals = await scanAllPairs();
  
  if (!signals || signals.length === 0) {
    const noTradeMsg = 'No Trade Today - Tidak ada setup valid yang memenuhi kriteria risk/reward dan konfirmasi.';
    console.log('\n' + noTradeMsg);
    if (bot && chatId) {
      await bot.sendMessage(chatId, noTradeMsg);
    }
    return;
  }

  for (const sig of signals) {
    const text = formatSignal(sig);
    console.log('\n' + text);
    console.log('--------------------------------------------------');
    
    if (bot && chatId) {
      try {
        await bot.sendMessage(chatId, text);
        console.log(`[Success] Signal ${sig.pair} dikirim ke Telegram.`);
      } catch (e) {
        console.error(`[Error] Gagal mengirim Telegram: ${e.message}`);
      }
    }
  }
}

main().catch(console.error);
