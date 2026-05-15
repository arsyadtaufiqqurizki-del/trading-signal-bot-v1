'use strict';
const { scanAllPairs } = require('./scanner');
const { getGlobalSentiment, getTrendingCoins } = require('./coingecko');
const { nowWIB, fmt, getSession } = require('./utils');
const { saveSignal } = require('./performance');

function formatSignal(signal, rank, total) {
  const dateStr = nowWIB();

  // Confluence progress bar (cap at 20 pts)
  const score  = signal.confluenceScore || 0;
  const filled = Math.min(10, Math.round((score / 20) * 10));
  const bar    = '█'.repeat(filled) + '░'.repeat(10 - filled);

  let confLevel = 'Low';
  if (score >= 10) confLevel = 'Very High ⭐';
  else if (score >= 7) confLevel = 'High';
  else if (score >= 5) confLevel = 'Medium';

  // Setup type
  let setupType = 'Trend Continuation';
  if (signal.liquiditySweep)  setupType = 'Liquidity Sweep Reversal 🎯';
  else if (signal.divergence) setupType = 'Divergence Reversal';
  else if (signal.bos)        setupType = 'BOS Breakout';

  // Tier label
  const tierLabel = signal.tier === 4 ? '⚠️ Tier 4 — Volatil'
    : signal.tier === 3 ? '🔶 Tier 3 — Altcoin Established'
    : signal.tier === 2 ? '🔷 Tier 2 — Large Cap'
    : '💎 Tier 1 — Mega Cap';

  // Session warning
  const sessionWarn = signal.sessionInfo && !signal.sessionInfo.optimal
    ? `\n⚠️ <i>Di luar sesi optimal — eksekusi dengan hati-hati!</i>` : '';

  // Liquidity sweep notice
  const sweepLine = signal.liquiditySweep
    ? `\n\n🎯 <b>LIQUIDITY SWEEP DETECTED!</b> Smart money telah sweep ${signal.liquiditySweep === 'BULLISH_SWEEP' ? 'swing low' : 'swing high'} — high-probability reversal.`
    : '';

  // Price formatter
  const dec = signal.entryAggressive >= 1000 ? 1 : signal.entryAggressive >= 1 ? 4 : 6;
  const p = (n) => {
    if (n == null || isNaN(n)) return 'N/A';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };

  // Leverage berdasarkan tier dan market phase
  const isClimax  = signal.marketPhase && signal.marketPhase.includes('CLIMAX');
  const leverage  = isClimax ? '2x–3x ⚡ (Hati-hati)'
    : signal.tier === 1 ? '5x–10x'
    : signal.tier === 2 ? '5x–8x'
    : '3x–5x';

  // Entry reason narrative
  const rsiPos = signal.direction === 'LONG'
    ? (signal.rsi < 45 ? 'masih memiliki ruang naik' : signal.rsi < 60 ? 'dalam zona neutral-bullish' : 'menunjukkan momentum kuat')
    : (signal.rsi > 55 ? 'masih memiliki ruang turun' : signal.rsi > 40 ? 'dalam zona neutral-bearish' : 'menunjukkan tekanan bearish kuat');

  const reason = signal.direction === 'LONG'
    ? `HTF bias <b>${signal.htfBias}</b> dikonfirmasi ${signal.factors.length} faktor confluence. RSI 1H di ${fmt(signal.rsi, 1)} ${rsiPos}. ADX ${fmt(signal.adx, 1)} mengonfirmasi kekuatan tren. Entry di zona high-probability dengan SL terstruktur di bawah support.`
    : `HTF bias <b>${signal.htfBias}</b> dengan tekanan bearish dari ${signal.factors.length} faktor confluence. RSI 1H di ${fmt(signal.rsi, 1)} ${rsiPos}. ADX ${fmt(signal.adx, 1)} mengonfirmasi dominasi seller. SL ditempatkan di atas resistance struktur.`;

  // Confluence factors list
  const confluenceList = signal.factors.map(f => `  ✅ ${f}`).join('\n');

  // TradingView link
  const tvSymbol = signal.pair.replace('/', '');
  const tvLink   = `https://www.tradingview.com/chart/?symbol=BINANCE:${tvSymbol}`;

  const rankHeader = total > 1 ? `#${rank}/${total}` : `#${rank}`;
  const dirEmoji   = signal.direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT';

  return `💎 <b>HIGH PROBABILITY SIGNAL ${rankHeader}</b>
━━━━━━━━━━━━━━━━━━━━
📅 ${dateStr}

<b>${signal.direction === 'LONG' ? '🟢' : '🔴'} ${signal.pair}</b> | ${dirEmoji}
<b>Kategori:</b> ${tierLabel}
<b>Setup:</b> ${setupType}
<b>Session:</b> ${signal.sessionInfo ? signal.sessionInfo.name : '-'}${sessionWarn}
<b>Market Phase:</b> ${signal.marketPhase || '-'}${sweepLine}

<b>📊 CONFLUENCE SCORE:</b>
${bar} ${score} pts (${confLevel})

━━━━━━━━━━━━━━━━━━━━
🎯 <b>ENTRY STRATEGY</b>
• <b>Agresif (Market):</b> ${p(signal.entryAggressive)} → RR 1:${fmt(signal.rrAgg, 2)}
• <b>Konservatif (Limit):</b> ${p(signal.entryConservative)} → RR 1:${fmt(signal.rrCons, 2)}

<b>🛑 Stop Loss:</b> ${p(signal.sl)}
<b>🏁 TP 1 – Partial (50%):</b> ${p(signal.tp1)}
<b>🏁 TP 2 – Full Target:</b> ${p(signal.tp2)}
<b>🔄 Breakeven:</b> Geser SL → Entry jika harga sentuh <b>${p(signal.beLevel)}</b>
<b>❌ Invalidasi:</b> Setup gagal jika 1H close ${signal.direction === 'LONG' ? 'di bawah' : 'di atas'} <b>${p(signal.invalidationLevel)}</b>

<b>💰 Risk:</b> ${signal.riskSuggestion || '0.5% per trade'}
<b>🔧 Leverage:</b> ${leverage}

━━━━━━━━━━━━━━━━━━━━
<b>🔗 CONFLUENCE FACTORS (${signal.factors.length} aktif)</b>
${confluenceList}

━━━━━━━━━━━━━━━━━━━━
<b>📈 ANALISIS TEKNIKAL</b>
• <b>Struktur:</b> HTF ${signal.htfTrend} | LTF ${signal.ltfTrend}
• <b>HTF Bias:</b> ${signal.htfBias}
• <b>RSI 1H:</b> ${fmt(signal.rsi, 1)}
• <b>ADX:</b> ${fmt(signal.adx, 1)} (Trend Strength)

<b>📝 ALASAN ENTRY:</b>
<i>${reason}</i>

━━━━━━━━━━━━━━━━━━━━
📊 <b><a href="${tvLink}">Buka Chart TradingView → BINANCE:${tvSymbol}</a></b>

⚠️ <i>Sinyal probabilitas tinggi. Selalu gunakan manajemen risiko yang ketat.</i>`;
}

async function runAnalysis(bot, chatId, isSilent = false) {
  try {
    if (!isSilent) {
      await bot.sendMessage(chatId, `🔍 <b>Memulai Analisis Market (Binance & CoinGecko)...</b>\nSesi: ${getSession().name}`, { parse_mode: 'HTML' });

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
        await bot.sendMessage(chatId, cgMsg, { parse_mode: 'HTML' });
      }
    }

    const signals = await scanAllPairs();

    if (!signals || signals.length === 0) {
      await bot.sendMessage(chatId, '📉 <b>No Trade Today</b>\nTidak ada setup valid yang memenuhi kriteria probabilitas tinggi (RR minimal 1:2 dan minimal 3 confluence).', { parse_mode: 'HTML' });
      return;
    }

    const topSignals = signals
      .sort((a, b) => (b.confluenceScore || 0) - (a.confluenceScore || 0))
      .slice(0, 3);

    if (!isSilent) {
      await bot.sendMessage(chatId, `💎 <b>TOP ${topSignals.length} HIGH PROBABILITY SETUPS</b>\nBerikut adalah setup terbaik berdasarkan skor konfluensi tertinggi:`, { parse_mode: 'HTML' });
    }

    for (let i = 0; i < topSignals.length; i++) {
      const text = formatSignal(topSignals[i], i + 1, topSignals.length);
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
      await saveSignal(topSignals[i]);
    }

  } catch (error) {
    console.error(error);
    if (!isSilent) {
      await bot.sendMessage(chatId, `❌ Terjadi kesalahan saat melakukan analisis: ${error.message}`);
    }
  }
}

async function runAnalysisPair(bot, chatId, keyword) {
  const { analyzeAsset, fetchBtcTrends, PAIRS } = require('./scanner');

  // Normalize: uppercase, strip /USDT or trailing USDT
  const kw = keyword.toUpperCase().replace('/USDT', '').replace(/USDT$/, '');

  // Search predefined list — name-first agar PEPE/USDT cocok saat user ketik "PEPE"
  let pairConfig = PAIRS.find(p =>
    p.name.toUpperCase().startsWith(kw + '/') ||
    p.symbol.toUpperCase() === kw + 'USDT' ||
    p.symbol.toUpperCase() === kw
  );

  let isDynamic = false;
  if (!pairConfig) {
    isDynamic = true;
    pairConfig = { symbol: kw + 'USDT', name: kw + '/USDT', htf: '4h', ltf: '1h', exec: '15m', tier: 4 };
  }

  await bot.sendMessage(
    chatId,
    `🔍 <b>Menganalisis ${pairConfig.name}...</b>${isDynamic ? '\n⚠️ <i>Pair custom — threshold Tier 4</i>' : ''}`,
    { parse_mode: 'HTML' }
  );

  try {
    const { btcTrend1h, btcTrend4h } = await fetchBtcTrends();
    const signal = await analyzeAsset(pairConfig, btcTrend1h, btcTrend4h);

    if (!signal) {
      await bot.sendMessage(
        chatId,
        `📉 <b>No Setup — ${pairConfig.name}</b>\n\nTidak ada setup valid saat ini. Kemungkinan:\n• Market sedang ranging / ADX terlalu rendah\n• Confluence tidak cukup terpenuhi\n• Di luar sesi optimal (Tier 4)\n\nCoba lagi nanti atau gunakan /high untuk scan semua pair.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const text = formatSignal(signal, 1, 1);
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
    await saveSignal(signal);

  } catch (e) {
    const isInvalid = e?.response?.data?.msg?.includes('Invalid symbol') ||
      e?.response?.status === 400 ||
      e?.message?.includes('Invalid symbol');

    if (isInvalid) {
      await bot.sendMessage(
        chatId,
        `❌ <b>Pair tidak ditemukan: ${pairConfig.name}</b>\n\nPair ini tidak tersedia di Binance. Pastikan nama benar.\n\n💡 Contoh valid:\n<code>/high BTC</code> — Bitcoin\n<code>/high ETH</code> — Ethereum\n<code>/high PEPE</code> — PepeCoin\n\nGunakan /high (tanpa argumen) untuk scan top 3 setup terbaik.`,
        { parse_mode: 'HTML' }
      );
    } else {
      await bot.sendMessage(chatId, `❌ Gagal menganalisis ${pairConfig.name}: ${e.message}`);
    }
  }
}

module.exports = { formatSignal, runAnalysis, runAnalysisPair };
