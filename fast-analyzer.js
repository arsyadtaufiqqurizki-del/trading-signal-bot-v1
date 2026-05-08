'use strict';
const { fastScan } = require('./fast-scanner');
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
 * Format sinyal fast — Pro version
 */
function formatFastSignal(sig, aiResult) {
  const dateStr = nowWIB();

  // Alignment Status
  const alignment = (sig.trend1h !== 'RANGING' && sig.trend1h === (sig.direction === 'LONG' ? 'UPTREND' : 'DOWNTREND')) 
    ? '✅ Synced' 
    : '⚠️ Partial';

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
    ? '5x–10x (high volatility)'
    : '10x–15x (stable trend)';

  return `⚡ Rapid Pro Scan – ${dateStr}

Pair: ${sig.pair}
Tipe: ${dirEmoji}
Confidence: <b>${aiResult.confidence}</b>

Entry: ${priceStr(sig.price)}
Take Profit: ${priceStr(sig.tp)}
Stop Loss: ${priceStr(sig.sl)}
RR: 1:${fmt(sig.rr, 2)}
Leverage: ${leverageSuggestion}

Analysis:
- TF Alignment: ${alignment} (1h: ${sig.trend1h} | 15m: ${sig.trend15m})
- RSI 15m: ${fmt(sig.rsi, 1)}
- Condition: ${conditionEmoji} ${sig.marketCondition}
- Factors: ${sig.factors.slice(0, 2).join(' & ')}

🤖 <b>AI Pro Tip:</b>
<i>${aiResult.tip}</i>

⚠️ High-frequency signal. Risk management is mandatory.`;
}

/**
 * Fungsi utama — dipanggil dari webhook saat /fast
 */
async function runFastSignal(bot, chatId) {
  try {
    await bot.sendMessage(chatId, '⚡ <b>Rapid Pro Scan Mode</b>\nMemindai 50 koin volume tertinggi & Verifikasi AI... sebentar ya!', { parse_mode: 'HTML' });

    const signal = await fastScan();
    const aiResult = await verifySignalWithAI(signal);

    const text = formatFastSignal(signal, aiResult);
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });

  } catch (error) {
    console.error('[FastAnalyzer] Error:', error);
    await bot.sendMessage(chatId, `❌ Gagal mengambil sinyal Pro: ${error.message}\nCoba lagi dalam beberapa detik.`);
  }
}

module.exports = { runFastSignal };
