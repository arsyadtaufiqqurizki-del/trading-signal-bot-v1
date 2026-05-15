'use strict';
const { fastScan, MINIMUM_SIGNAL_SCORE } = require('./fast-scanner');
const { nowWIB, fmt } = require('./utils');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

/**
 * Verifikasi sinyal menggunakan AI untuk mendapatkan confidence score & pro tip
 */
async function verifySignalWithAI(sig) {
    if (!genAI) return { confidence: 'N/A', tip: 'AI Key not configured' };
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = `You are a Senior Hedge Fund Trader. Analyze this technical setup and provide a confidence score (0-100%) and a one-sentence professional tip.
        
        Setup:
        - Pair: ${sig.pair}
        - Direction: ${sig.direction}
        - Timeframe 1h Trend: ${sig.trend1h}
        - Timeframe 15m Momentum: ${sig.trend15m}
        - RSI 15m: ${fmt(sig.rsi, 1)}
        - Technical Factors: ${sig.factors.join(', ')}
        - Market Condition: ${sig.marketCondition}
        - 24h Change: ${fmt(sig.change24h, 2)}%

        Format response strictly as:
        Confidence: [X]%
        Tip: [Brief professional trading tip in Bahasa Indonesia]`;
        
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        
        const confMatch = text.match(/Confidence:\s*(\d+%)?/);
        const tipMatch = text.match(/Tip:\s*(.*)/);
        
        return {
            confidence: confMatch ? confMatch[1] : 'Medium',
            tip: tipMatch ? tipMatch[1] : 'Gunakan manajemen risiko yang ketat.'
        };
    } catch (e) {
        console.error('[AI Verify] Error:', e);
        return { confidence: 'Technical Only', tip: 'AI Verification failed, relying on technicals.' };
    }
}

/**
 * Format sinyal fast — VIP Pro version
 */
function formatFastSignal(sig, aiResult, rank = 1, total = 1) {
  const dateStr = nowWIB();
  const rankHeader = total > 1 ? `#${rank}/${total}` : '#1';

  // Derive ATR from SL distance (sl = price ± atr * 2.0)
  const atr = Math.abs(sig.price - sig.sl) / 2.0;

  // Entry levels
  const entryAgg  = sig.price;
  const entryCons = sig.direction === 'LONG'
    ? sig.price - atr * 0.3
    : sig.price + atr * 0.3;

  // TP1 partial (57% distance) and TP2 full target
  const tp1 = sig.direction === 'LONG' ? sig.price + atr * 2.0 : sig.price - atr * 2.0;
  const tp2 = sig.tp;

  // RR for each entry
  const rrAgg  = atr > 0 ? ((Math.abs(tp2 - entryAgg)  / Math.abs(entryAgg  - sig.sl)).toFixed(2)) : sig.rr;
  const rrCons = atr > 0 ? ((Math.abs(tp2 - entryCons) / Math.abs(entryCons - sig.sl)).toFixed(2)) : sig.rr;

  // Breakeven — geser SL ke entry saat harga sentuh level ini
  const beLevel = sig.direction === 'LONG' ? sig.price + atr * 1.0 : sig.price - atr * 1.0;

  // Confidence score
  const score  = sig.score || 0;
  const filled = Math.min(10, Math.round((score / 15) * 10));
  const bar    = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const confLevel = score >= 12 ? 'Very High' : score >= 9 ? 'High' : score >= 6 ? 'Medium' : 'Low';

  // Setup type dari factors
  const factorsStr = sig.factors.join(' ');
  let setupType = 'Trend Continuation';
  if (factorsStr.includes('RSI Momentum') && factorsStr.includes('Multi-TF')) setupType = 'Trend Continuation (MTF)';
  else if (factorsStr.includes('Pattern')) setupType = 'Pattern Breakout';
  else if (factorsStr.includes('Oversold') || factorsStr.includes('Overbought')) setupType = 'Mean Reversion';
  else if (factorsStr.includes('RSI Momentum')) setupType = 'Momentum Trade';

  // Risk suggestion berdasarkan score
  const riskSugg = score >= 10 ? '1% per trade (High Conviction)'
    : score >= 7 ? '0.75% per trade'
    : '0.5% per trade (Caution)';

  const leverage = sig.marketCondition === 'Volatile' ? '3x–5x' : '5x–10x';
  const condEmoji = sig.marketCondition === 'Volatile' ? '⚡ Volatile' : '📊 Trending';

  // Reason entry
  const rsiDesc = sig.rsi < 45 ? 'masih memiliki ruang naik' : sig.rsi > 55 ? 'momentum kuat' : 'dalam zona netral-bullish';
  const rsiDescShort = sig.rsi > 55 ? 'masih memiliki ruang turun' : sig.rsi < 45 ? 'momentum bearish kuat' : 'dalam zona netral-bearish';
  const reason = sig.direction === 'LONG'
    ? `Harga berada di atas EMA 200 dengan konfirmasi bullish dari ${sig.factors.length} faktor confluence. RSI 15m di ${fmt(sig.rsi, 1)} ${rsiDesc}, didukung struktur 1H ${sig.trend1h} dan momentum 15m yang searah. SL ditempatkan di bawah level ATR support untuk meminimalisir noise.`
    : `Harga berada di bawah EMA 200 dengan tekanan bearish dari ${sig.factors.length} faktor confluence. RSI 15m di ${fmt(sig.rsi, 1)} ${rsiDescShort}, dikonfirmasi struktur 1H ${sig.trend1h} dan momentum 15m yang searah. SL ditempatkan di atas ATR resistance untuk proteksi optimal.`;

  // Format harga
  const dec = sig.price >= 1000 ? 1 : sig.price >= 1 ? 4 : 6;
  const p = (n) => {
    if (n == null || isNaN(n)) return 'N/A';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };

  const dirEmoji = sig.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT';

  // TradingView link
  const tvSymbol = sig.symbol || sig.pair.replace('/', '');
  const tvLink = `https://www.tradingview.com/chart/?symbol=BINANCE:${tvSymbol}`;

  // Confluence list
  const confluenceList = sig.factors.map(f => `  ✅ ${f}`).join('\n');

  return `⚡ <b>RAPID PRO SIGNAL ${rankHeader}</b>
━━━━━━━━━━━━━━━━━━━━
📅 ${dateStr}

<b>💎 ${sig.pair}</b> | ${dirEmoji}
<b>Setup:</b> ${setupType}
<b>Kondisi Market:</b> ${condEmoji}
<b>AI Confidence:</b> <b>${aiResult.confidence}</b>

<b>📊 CONFLUENCE SCORE:</b>
${bar} ${score}/15 pts (${confLevel})

━━━━━━━━━━━━━━━━━━━━
🎯 <b>ENTRY STRATEGY</b>
• <b>Agresif (Market):</b> ${p(entryAgg)} → RR 1:${rrAgg}
• <b>Konservatif (Limit):</b> ${p(entryCons)} → RR 1:${rrCons}

<b>🛑 Stop Loss:</b> ${p(sig.sl)}
<b>🏁 TP 1 – Partial (50%):</b> ${p(tp1)}
<b>🏁 TP 2 – Full Target:</b> ${p(tp2)}
<b>🔄 Breakeven:</b> Geser SL → Entry jika harga sentuh <b>${p(beLevel)}</b>
<b>❌ Invalidasi:</b> Candle 1H close ${sig.direction === 'LONG' ? 'di bawah' : 'di atas'} <b>${p(sig.sl)}</b>

<b>💰 Risk:</b> ${riskSugg}
<b>🔧 Leverage:</b> ${leverage}

━━━━━━━━━━━━━━━━━━━━
<b>🔗 CONFLUENCE FACTORS (${sig.factors.length} aktif)</b>
${confluenceList}

━━━━━━━━━━━━━━━━━━━━
<b>📈 ANALISIS TEKNIKAL</b>
• <b>Struktur:</b> 1H ${sig.trend1h} | 15m ${sig.trend15m}
• <b>RSI 15m:</b> ${fmt(sig.rsi, 1)}
• <b>24h Change:</b> ${sig.change24h > 0 ? '+' : ''}${fmt(sig.change24h, 2)}%

<b>📝 ALASAN ENTRY:</b>
<i>${reason}</i>

<b>🤖 AI PRO TIP:</b>
<i>${aiResult.tip}</i>

━━━━━━━━━━━━━━━━━━━━
📊 <b><a href="${tvLink}">Buka Chart TradingView → BINANCE:${tvSymbol}</a></b>

⚠️ <i>Sinyal probabilitas tinggi. Selalu gunakan manajemen risiko yang ketat.</i>`;
}

/**
 * Fungsi utama — dipanggil dari webhook saat /fast
 */
async function runFastSignal(bot, chatId) {
  try {
    await bot.sendMessage(chatId, '⚡ <b>Rapid Pro Scan Mode</b>\nMemindai 50 pair & mencari Top 3 setup terbaik... sebentar ya!', { parse_mode: 'HTML' });

    const signals = await fastScan(3);
    const signalList = Array.isArray(signals) ? signals : [signals];

    for (let i = 0; i < signalList.length; i++) {
      const aiResult = await verifySignalWithAI(signalList[i]);
      const text = formatFastSignal(signalList[i], aiResult, i + 1, signalList.length);
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
    }

  } catch (error) {
    console.error('[FastAnalyzer] Error:', error);
    if (error.message === 'NO_QUALITY_SETUP') {
      await bot.sendMessage(chatId, '⚡ <b>Rapid Pro Scan</b>\n\n🚫 <b>No Trade Today</b> — Tidak ada setup berkualitas tinggi saat ini (score < 5). Semua pair tidak memenuhi kriteria confluence minimum.\n\nCoba lagi nanti ketika market memiliki tren yang lebih jelas.', { parse_mode: 'HTML' });
    } else {
      await bot.sendMessage(chatId, `❌ Gagal mengambil sinyal Pro: ${error.message}\nCoba lagi dalam beberapa detik.`);
    }
  }
}

async function runFastSignalPair(bot, chatId, keyword) {
  const { analyzeProAsset, PRO_PAIRS } = require('./fast-scanner');

  const kw = keyword.toUpperCase().replace('/USDT', '').replace(/USDT$/, '');

  // Cari di PRO_PAIRS — name-based agar PEPE cocok ke 1000PEPEUSDT
  let pairConfig = PRO_PAIRS.find(p =>
    p.name.toUpperCase().startsWith(kw + '/') ||
    p.symbol.toUpperCase() === kw + 'USDT' ||
    p.symbol.toUpperCase() === kw
  );

  const isDynamic = !pairConfig;
  if (isDynamic) {
    pairConfig = { symbol: kw + 'USDT', name: kw + '/USDT' };
  }

  await bot.sendMessage(
    chatId,
    `⚡ <b>Rapid Pro Scan — ${pairConfig.name}</b>${isDynamic ? '\n⚠️ <i>Pair custom, threshold minimum score 5</i>' : ''}\nMenganalisis setup... sebentar ya!`,
    { parse_mode: 'HTML' }
  );

  try {
    const signal = await analyzeProAsset(pairConfig);

    if (!signal) {
      const msg = isDynamic
        ? `⚡ <b>Rapid Pro Scan — ${pairConfig.name}</b>\n\n🚫 <b>Tidak ada hasil.</b>\nKemungkinan:\n• Pair tidak tersedia di Binance\n• Tidak ada setup valid (score < ${MINIMUM_SIGNAL_SCORE})\n• Market sedang ranging\n\n💡 Cek nama pair atau coba /fast untuk scan top 3.`
        : `⚡ <b>Rapid Pro Scan — ${pairConfig.name}</b>\n\n🚫 <b>No Trade Today</b> — Tidak ada setup berkualitas saat ini (score < ${MINIMUM_SIGNAL_SCORE}).\n\nCoba lagi nanti ketika market memiliki momentum yang lebih jelas.`;
      await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
      return;
    }

    if (signal.score < MINIMUM_SIGNAL_SCORE) {
      await bot.sendMessage(
        chatId,
        `⚡ <b>Rapid Pro Scan — ${pairConfig.name}</b>\n\n⚠️ <b>Score Terlalu Rendah</b> — Setup ditemukan tapi score ${signal.score}/15 di bawah threshold minimum (${MINIMUM_SIGNAL_SCORE}).\n\nSetup kurang meyakinkan, tidak disarankan untuk entry.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const aiResult = await verifySignalWithAI(signal);
    const text = formatFastSignal(signal, aiResult, 1, 1);
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });

  } catch (e) {
    console.error('[FastAnalyzer Pair] Error:', e);
    await bot.sendMessage(chatId, `❌ Gagal menganalisis ${pairConfig.name}: ${e.message}`);
  }
}

module.exports = { runFastSignal, runFastSignalPair };
