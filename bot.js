'use strict';

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { scanAllPairs } = require('./scanner');
const { getGlobalSentiment, getTrendingCoins } = require('./coingecko');
const { nowWIB, fmt, getSession } = require('./utils');

const token = process.env.TELEGRAM_BOT_TOKEN;
const defaultChatId = process.env.TELEGRAM_CHAT_ID;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN tidak ditemukan di .env");
  process.exit(1);
}

// ==========================================
// DUMMY WEB SERVER UNTUK RENDER DEPLOYMENT
// Render mewajibkan 'Web Service' menggunakan PORT
// ==========================================
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('AI Trading Bot is Running 24/7!');
});

app.listen(port, () => {
  console.log(`Web server berjalan pada port ${port} (Memenuhi syarat Render)`);
});
// ==========================================

// Inisialisasi bot dengan polling
const bot = new TelegramBot(token, { polling: true });

console.log(`[${nowWIB()}] AI Trading Bot Assistant telah aktif dan mendengarkan pesan Telegram...`);

// Format Signal Function
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

// Main logic untuk scanning
async function runAnalysis(chatId, isSilent = false) {
  try {
    if (!isSilent) {
      bot.sendMessage(chatId, `🔍 <b>Memulai Analisis Market (Binance & CoinGecko)...</b>\nSesi: ${getSession().name}`, { parse_mode: "HTML" });
      
      // Fetch CoinGecko
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
        bot.sendMessage(chatId, '📉 <b>No Trade Today</b>\nTidak ada setup valid yang memenuhi kriteria probabilitas tinggi (RR minimal 1:2 dan minimal 3 confluence).', { parse_mode: "HTML" });
      }
      return;
    }

    // Jika ada sinyal, kirim (baik mode manual maupun silent)
    for (const sig of signals) {
      const text = formatSignal(sig);
      await bot.sendMessage(chatId, text);
    }

  } catch (error) {
    console.error(error);
    if (!isSilent) {
      bot.sendMessage(chatId, `❌ Terjadi kesalahan saat melakukan analisis: ${error.message}`);
    }
  }
}

// Perintah /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `Halo! Saya adalah <b>AI Trading Assistant</b> Anda.\n\nSaya dirancang untuk mendeteksi *High-Probability Setups* dengan Risk/Reward minimal 1:2.\n\nGunakan perintah berikut:\n/scan - Untuk melakukan scanning koin sekarang\n/status - Untuk melihat status bot`, { parse_mode: "HTML" });
});

// Perintah /scan
bot.onText(/\/scan/, async (msg) => {
  const chatId = msg.chat.id;
  await runAnalysis(chatId, false);
});

// Perintah /status
bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id, `✅ <b>Bot Active & Running</b>\nSistem siap menganalisis market kapan saja Anda mengetik /scan. Otomatis scan setiap 1 jam berjalan di latar belakang.`, { parse_mode: "HTML" });
});

// Auto-scan scheduler logic (runs every 1 hour silently)
setInterval(() => {
  if (defaultChatId) {
    console.log(`[${nowWIB()}] Menjalankan auto-scan terjadwal (Silent Mode)...`);
    runAnalysis(defaultChatId, true);
  }
}, 1 * 60 * 60 * 1000); // Setiap 1 jam
