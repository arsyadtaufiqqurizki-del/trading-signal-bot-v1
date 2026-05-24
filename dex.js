'use strict';

const axios = require('axios');

// ─── HELPER: Escape HTML untuk keamanan Telegram parse_mode HTML ──────────────
function esc(str) {
  if (!str && str !== 0) return '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── CHAIN CONFIG ────────────────────────────────────────────────────────────
const CHAIN_CONFIG = {
  sol:  { id: 'solana',  label: 'Solana',    emoji: '◎',  dex: 'Raydium/Jupiter',   color: '🟣' },
  bnb:  { id: 'bsc',     label: 'BNB Chain', emoji: '🟡', dex: 'PancakeSwap',        color: '🟡' },
  eth:  { id: 'ethereum',label: 'Ethereum',  emoji: '🔷', dex: 'Uniswap',            color: '🔵' },
  base: { id: 'base',    label: 'Base',      emoji: '🔵', dex: 'Uniswap/Aerodrome', color: '🔵' },
};

const DEXSCREENER_BASE = 'https://api.dexscreener.com';

// ─── HELPER: Format angka ────────────────────────────────────────────────────
function fmtNum(n) {
  if (!n || isNaN(n)) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(4)}`;
}

function fmtPrice(p) {
  if (!p || isNaN(p)) return '—';
  if (p >= 1000)  return `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (p >= 1)     return `$${p.toFixed(4)}`;
  if (p >= 0.001) return `$${p.toFixed(6)}`;
  return `$${p.toExponential(4)}`;
}

function fmtAge(createdAt) {
  if (!createdAt) return '—';
  const diff = Date.now() - createdAt;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0)  return `${d}h ${h % 24}j`;
  if (h > 0)  return `${h}j ${m % 60}m`;
  return `${m}m`;
}

function fmtChange(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return '—';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function changeEmoji(pct) {
  if (!pct || isNaN(pct)) return '➖';
  if (pct >= 100) return '🚀';
  if (pct >= 50)  return '🔥';
  if (pct >= 20)  return '📈';
  if (pct >= 0)   return '🟢';
  if (pct >= -20) return '🔴';
  return '💀';
}

// ─── RISK SCORE ENGINE ───────────────────────────────────────────────────────
function getRiskScore(pair) {
  let riskPoints = 0;
  const warnings = [];

  const liq     = pair.liquidity?.usd || 0;
  const vol24h  = pair.volume?.h24 || 0;
  const mcap    = pair.marketCap || pair.fdv || 0;
  const txns    = (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0);
  const ch1h    = pair.priceChange?.h1 || 0;
  const ch6h    = pair.priceChange?.h6 || 0;

  // Cek liquidity
  if (liq < 10_000)  { riskPoints += 3; warnings.push('Likuiditas sangat rendah'); }
  else if (liq < 30_000) { riskPoints += 2; warnings.push('Likuiditas rendah'); }
  else if (liq < 50_000) { riskPoints += 1; }

  // Cek volume vs liquidity ratio (pump & dump signal)
  if (liq > 0 && vol24h / liq > 50) { riskPoints += 2; warnings.push('Volume/Liq ratio ekstrem'); }

  // Cek transaksi
  if (txns < 20)  { riskPoints += 2; warnings.push('Aktivitas transaksi sangat sedikit'); }
  else if (txns < 50) { riskPoints += 1; }

  // Cek pump ekstrem
  if (ch1h > 500)  { riskPoints += 2; warnings.push('Pump ekstrem 1h (>500%)'); }
  if (ch6h > 1000) { riskPoints += 2; warnings.push('Pump ekstrem 6h (>1000%)'); }

  // Cek market cap vs liquidity (honeypot signal)
  if (mcap > 0 && liq > 0 && mcap / liq > 100) {
    riskPoints += 2; warnings.push('MCap/Liq ratio abnormal (potensi honeypot)');
  }

  // Sell pressure check
  const buys  = pair.txns?.h24?.buys  || 0;
  const sells = pair.txns?.h24?.sells || 0;
  if (buys + sells > 0 && sells / (buys + sells) > 0.7) {
    riskPoints += 2; warnings.push('Tekanan jual dominan (>70%)');
  }

  // Tentukan level risk
  let level, emoji, label;
  if (riskPoints <= 1) {
    level = 'LOW'; emoji = '🟢'; label = 'LOW RISK';
  } else if (riskPoints <= 4) {
    level = 'MEDIUM'; emoji = '🟡'; label = 'CAUTION';
  } else {
    level = 'HIGH'; emoji = '🔴'; label = 'HIGH RISK';
  }

  return { level, emoji, label, riskPoints, warnings };
}

// ─── FETCH: Token baru per chain dari DexScreener ────────────────────────────
async function fetchNewTokens(chainId, minLiq = 50_000, minVol = 100_000, maxAgeHours = 24) {
  try {
    // Ambil token baru dari DexScreener — endpoint latest token profiles
    const { data } = await axios.get(
      `${DEXSCREENER_BASE}/token-profiles/latest/v1`,
      {
        headers: { 'Accept': 'application/json' },
        timeout: 15_000,
      }
    );

    // Filter berdasarkan chain
    const profiles = (Array.isArray(data) ? data : [])
      .filter(p => p.chainId === chainId)
      .slice(0, 30); // ambil 30 profil teratas

    if (!profiles.length) return [];

    // Ambil detail pair untuk setiap token
    const results = [];
    for (const profile of profiles.slice(0, 15)) {
      try {
        const addr = profile.tokenAddress;
        const { data: pairData } = await axios.get(
          `${DEXSCREENER_BASE}/latest/dex/tokens/${addr}`,
          { timeout: 8_000 }
        );

        const pairs = pairData?.pairs || [];
        if (!pairs.length) continue;

        // Ambil pair dengan volume tertinggi
        const bestPair = pairs
          .filter(p => p.chainId === chainId)
          .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))[0];

        if (!bestPair) continue;

        const liq    = bestPair.liquidity?.usd || 0;
        const vol24h = bestPair.volume?.h24 || 0;
        const age    = bestPair.pairCreatedAt;

        // Filter kriteria
        if (liq < minLiq) continue;
        if (vol24h < minVol) continue;

        // Filter max age
        if (age) {
          const ageHours = (Date.now() - age) / 3_600_000;
          if (ageHours > maxAgeHours) continue;
        }

        results.push({
          ...bestPair,
          profileUrl: profile.url,
          profileIcon: profile.icon,
        });
      } catch {
        // skip token yang gagal
      }
    }

    return results.sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
  } catch (e) {
    console.error(`[DEX] fetchNewTokens error (${chainId}):`, e.message);
    return [];
  }
}

// ─── FETCH: Token yang sedang trending/boosted (hot) ─────────────────────────
async function fetchBoostedTokens() {
  try {
    const { data } = await axios.get(
      `${DEXSCREENER_BASE}/token-boosts/top/v1`,
      { timeout: 12_000 }
    );
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('[DEX] fetchBoostedTokens error:', e.message);
    return [];
  }
}

// ─── FETCH: Detail pair dari address ────────────────────────────────────────
async function fetchPairsByChain(chainId) {
  try {
    const boosted = await fetchBoostedTokens();
    const chainBoosted = boosted.filter(b => b.chainId === chainId).slice(0, 10);

    if (!chainBoosted.length) return [];

    const results = [];
    for (const token of chainBoosted) {
      try {
        const { data } = await axios.get(
          `${DEXSCREENER_BASE}/latest/dex/tokens/${token.tokenAddress}`,
          { timeout: 8_000 }
        );

        const pairs = (data?.pairs || [])
          .filter(p => p.chainId === chainId)
          .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));

        if (pairs[0]) {
          results.push({
            ...pairs[0],
            boostAmount: token.amount || 0,
            profileUrl: token.url,
          });
        }
      } catch {
        // skip
      }
    }

    return results.sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
  } catch (e) {
    console.error('[DEX] fetchPairsByChain error:', e.message);
    return [];
  }
}

// ─── FORMAT: Kartu token tunggal ─────────────────────────────────────────────
function formatTokenCard(pair, chainCfg, index) {
  const risk     = getRiskScore(pair);
  const name     = esc(pair.baseToken?.name  || 'Unknown');
  const symbol   = esc(pair.baseToken?.symbol || '???');
  const price    = esc(fmtPrice(parseFloat(pair.priceUsd || 0)));
  const liq      = esc(fmtNum(pair.liquidity?.usd));
  const vol24h   = esc(fmtNum(pair.volume?.h24));
  const mcap     = esc(fmtNum(pair.marketCap || pair.fdv));
  const age      = esc(fmtAge(pair.pairCreatedAt));
  const dexName  = esc(pair.dexId?.replace(/-/g, ' ').toUpperCase() || chainCfg.dex);

  const ch5m  = esc(fmtChange(pair.priceChange?.m5));
  const ch1h  = esc(fmtChange(pair.priceChange?.h1));
  const ch6h  = esc(fmtChange(pair.priceChange?.h6));
  const ch24h = esc(fmtChange(pair.priceChange?.h24));

  const hotEmoji = changeEmoji(pair.priceChange?.h1);

  const buys  = pair.txns?.h24?.buys  || 0;
  const sells = pair.txns?.h24?.sells || 0;

  // URL tidak di-escape agar tetap valid sebagai href
  const chartUrl = pair.url || `https://dexscreener.com/${chainCfg.id}/${pair.pairAddress}`;

  const warnStr = risk.warnings.length > 0
    ? risk.warnings.slice(0, 2).map(w => `   ⚠️ ${esc(w)}`).join('\n')
    : '   ✅ Tidak ada red flag terdeteksi';

  return (
    `${hotEmoji} <b>${index}. ${name} (${symbol})</b>\n` +
    `📍 ${esc(chainCfg.label)} · ${dexName}\n` +
    `⏰ Usia: <b>${age}</b>\n\n` +
    `💰 Harga: <b>${price}</b>\n` +
    `📊 5m: <code>${ch5m}</code>  1h: <code>${ch1h}</code>  6h: <code>${ch6h}</code>  24h: <code>${ch24h}</code>\n\n` +
    `💎 MCap: <b>${mcap}</b>\n` +
    `🔒 Liquidity: <b>${liq}</b>\n` +
    `📈 Volume 24h: <b>${vol24h}</b>\n` +
    `🔄 Txns: <b>${buys + sells}</b>  (Beli: ${buys} · Jual: ${sells})\n\n` +
    `🛡️ Risk: ${risk.emoji} <b>${risk.label}</b>\n` +
    `${warnStr}\n\n` +
    `🔗 <a href="${chartUrl}">Lihat Chart DexScreener</a>`
  );
}

// ─── FORMAT: Header chain ───────────────────────────────────────────────────
function buildHeader(chainCfg, count, mode = 'new') {
  const now = new Date().toLocaleString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
  });

  const modeLabel = {
    new:  'Token Baru 24 Jam',
    hot:  'Token Sedang Pump 🔥',
    safe: 'Token Relatif Aman 🟢',
  }[mode] || 'Token';

  return (
    `${chainCfg.emoji} <b>DEX MONITOR — ${chainCfg.label.toUpperCase()}</b>\n` +
    `<i>${modeLabel} · ${chainCfg.dex}</i>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${now} WIB\n` +
    `Ditemukan: <b>${count} token</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n`
  );
}

// ─── MAIN: Run DEX per chain ─────────────────────────────────────────────────
async function runDexChain(bot, chatId, chainKey) {
  const chainCfg = CHAIN_CONFIG[chainKey];
  if (!chainCfg) {
    await bot.sendMessage(chatId,
      `❓ <b>Chain tidak dikenal.</b>\n\nGunakan: <code>sol</code>, <code>bnb</code>, <code>eth</code>, <code>base</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  await bot.sendMessage(chatId,
    `⏳ Memuat token baru di <b>${chainCfg.label}</b>...\n<i>Filter: Liq >$50K, Vol >$100K, Usia <24 jam</i>`,
    { parse_mode: 'HTML' }
  );

  try {
    let tokens = await fetchNewTokens(chainCfg.id);

    // Fallback: jika kurang, ambil dari boosted
    if (tokens.length < 3) {
      tokens = await fetchPairsByChain(chainCfg.id);
    }

    if (!tokens.length) {
      await bot.sendMessage(chatId,
        `📭 <b>Tidak ada token baru ditemukan</b> di ${chainCfg.label} saat ini.\n` +
        `<i>Filter mungkin terlalu ketat atau data belum tersedia. Coba lagi nanti.</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const top = tokens.slice(0, 5);
    const header = buildHeader(chainCfg, top.length, 'new');
    await bot.sendMessage(chatId, header, { parse_mode: 'HTML', disable_web_page_preview: true });

    for (let i = 0; i < top.length; i++) {
      const card = formatTokenCard(top[i], chainCfg, i + 1);
      await bot.sendMessage(chatId, card, { parse_mode: 'HTML', disable_web_page_preview: true });
      await new Promise(r => setTimeout(r, 300));
    }

    await bot.sendMessage(chatId,
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💡 <i>Gunakan /dex hot untuk token yang sedang pump\n` +
      `Gunakan /dex safe untuk token dengan risiko rendah</i>`,
      { parse_mode: 'HTML' }
    );

  } catch (e) {
    console.error('[DEX] runDexChain error:', e.message);
    await bot.sendMessage(chatId,
      `❌ <b>Gagal memuat data DEX.</b>\n<code>${e.message}</code>`,
      { parse_mode: 'HTML' }
    );
  }
}

// ─── MAIN: Overview semua chain ─────────────────────────────────────────────
async function runDexOverview(bot, chatId) {
  await bot.sendMessage(chatId,
    `⏳ <b>Memuat DEX Overview</b> dari semua jaringan...\n<i>SOL · BNB · ETH · BASE</i>`,
    { parse_mode: 'HTML' }
  );

  try {
    const chains = Object.entries(CHAIN_CONFIG);
    const now = new Date().toLocaleString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
    });

    let overview = `🌐 <b>DEX MULTI-CHAIN OVERVIEW</b>\n`;
    overview += `<i>Top token baru per jaringan</i>\n`;
    overview += `━━━━━━━━━━━━━━━━━━━━\n`;
    overview += `${now} WIB\n`;
    overview += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const [key, cfg] of chains) {
      try {
        let tokens = await fetchNewTokens(cfg.id);
        if (tokens.length < 2) tokens = await fetchPairsByChain(cfg.id);

        if (!tokens.length) {
          overview += `${cfg.emoji} <b>${cfg.label}</b> — Tidak ada data\n\n`;
          continue;
        }

        const top1 = tokens[0];
        const risk = getRiskScore(top1);
        const name = esc(top1.baseToken?.name || 'Unknown');
        const sym  = esc(top1.baseToken?.symbol || '???');
        const ch1h = esc(fmtChange(top1.priceChange?.h1));
        const vol  = esc(fmtNum(top1.volume?.h24));
        const liq  = esc(fmtNum(top1.liquidity?.usd));
        const age  = esc(fmtAge(top1.pairCreatedAt));
        const hot  = changeEmoji(top1.priceChange?.h1);

        overview += `${cfg.emoji} <b>${esc(cfg.label)}</b> — ${tokens.length} token baru\n`;
        overview += `${hot} <b>${name} (${sym})</b>\n`;
        overview += `   1h: <code>${ch1h}</code>  Vol: ${vol}  Liq: ${liq}\n`;
        overview += `   Usia: ${age}  Risk: ${risk.emoji} ${risk.label}\n`;
        overview += `   /dex ${key} — lihat semua\n\n`;

      } catch {
        overview += `${cfg.emoji} <b>${cfg.label}</b> — Error memuat data\n\n`;
      }
    }

    overview += `━━━━━━━━━━━━━━━━━━━━\n`;
    overview += `<code>/dex sol</code> · <code>/dex bnb</code> · <code>/dex eth</code> · <code>/dex base</code>\n`;
    overview += `<code>/dex hot</code> · <code>/dex safe</code>`;

    await bot.sendMessage(chatId, overview, { parse_mode: 'HTML', disable_web_page_preview: true });

  } catch (e) {
    console.error('[DEX] runDexOverview error:', e.message);
    await bot.sendMessage(chatId,
      `❌ <b>Gagal memuat DEX Overview.</b>\n<code>${e.message}</code>`,
      { parse_mode: 'HTML' }
    );
  }
}

// ─── MAIN: Token yang sedang pump (semua chain) ──────────────────────────────
async function runDexHot(bot, chatId) {
  await bot.sendMessage(chatId,
    `⏳ Mencari token yang sedang <b>pump</b> di semua chain...`,
    { parse_mode: 'HTML' }
  );

  try {
    const { data } = await axios.get(
      `${DEXSCREENER_BASE}/token-boosts/top/v1`,
      { timeout: 12_000 }
    );

    const boosts = Array.isArray(data) ? data : [];
    const targetChains = Object.values(CHAIN_CONFIG).map(c => c.id);

    // Filter ke chain yang kita pantau
    const filtered = boosts.filter(b => targetChains.includes(b.chainId)).slice(0, 15);

    if (!filtered.length) {
      await bot.sendMessage(chatId,
        `📭 Tidak ada token boosted ditemukan saat ini.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Ambil detail pair untuk setiap token
    const detailed = [];
    for (const token of filtered.slice(0, 10)) {
      try {
        const { data: pd } = await axios.get(
          `${DEXSCREENER_BASE}/latest/dex/tokens/${token.tokenAddress}`,
          { timeout: 8_000 }
        );
        const pairs = (pd?.pairs || []).sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
        if (pairs[0]) {
          detailed.push({ ...pairs[0], boostAmount: token.amount || 0, profileUrl: token.url });
        }
      } catch { /* skip */ }
    }

    // Sort by 1h price change
    const hot = detailed
      .filter(t => (t.priceChange?.h1 || 0) > 0)
      .sort((a, b) => (b.priceChange?.h1 || 0) - (a.priceChange?.h1 || 0))
      .slice(0, 5);

    if (!hot.length) {
      await bot.sendMessage(chatId,
        `📭 Tidak ada token dengan momentum positif ditemukan saat ini.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const now = new Date().toLocaleString('id-ID', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
    });

    let header = `🔥 <b>DEX HOT TOKENS — SEMUA CHAIN</b>\n`;
    header += `<i>Sorted by 1H Price Change · ${now} WIB</i>\n`;
    header += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    await bot.sendMessage(chatId, header, { parse_mode: 'HTML', disable_web_page_preview: true });

    for (let i = 0; i < hot.length; i++) {
      const t       = hot[i];
      const chainKey= Object.entries(CHAIN_CONFIG).find(([, c]) => c.id === t.chainId)?.[0] || t.chainId;
      const chainCfg= CHAIN_CONFIG[chainKey] || { label: t.chainId, emoji: '🔗', dex: t.dexId };
      const card    = formatTokenCard(t, chainCfg, i + 1);
      await bot.sendMessage(chatId, card, { parse_mode: 'HTML', disable_web_page_preview: true });
      await new Promise(r => setTimeout(r, 300));
    }

    await bot.sendMessage(chatId,
      `━━━━━━━━━━━━━━━━━━━━\n💡 <i>Gunakan /dex [chain] untuk detail per jaringan</i>`,
      { parse_mode: 'HTML' }
    );

  } catch (e) {
    console.error('[DEX] runDexHot error:', e.message);
    await bot.sendMessage(chatId,
      `❌ <b>Gagal memuat data hot tokens.</b>\n<code>${e.message}</code>`,
      { parse_mode: 'HTML' }
    );
  }
}

// ─── MAIN: Token dengan risk rendah saja ────────────────────────────────────
async function runDexSafe(bot, chatId) {
  await bot.sendMessage(chatId,
    `⏳ Mencari token <b>risiko rendah</b> di semua chain...\n<i>Filter ketat: Liq >$100K, Vol >$200K, Risk Score rendah</i>`,
    { parse_mode: 'HTML' }
  );

  try {
    const chains = Object.entries(CHAIN_CONFIG);
    const safeTokens = [];

    for (const [key, cfg] of chains) {
      try {
        // Gunakan filter lebih ketat untuk mode safe
        const tokens = await fetchNewTokens(cfg.id, 100_000, 200_000, 48);
        for (const t of tokens) {
          const risk = getRiskScore(t);
          if (risk.level === 'LOW') {
            safeTokens.push({ ...t, _chainKey: key, _chainCfg: cfg });
          }
        }
      } catch { /* skip */ }
    }

    safeTokens.sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
    const top = safeTokens.slice(0, 5);

    if (!top.length) {
      await bot.sendMessage(chatId,
        `📭 <b>Tidak ada token "low risk" ditemukan</b> saat ini.\n\n` +
        `<i>Semua token baru yang aktif memiliki risiko moderat hingga tinggi. ` +
        `Coba /dex [chain] untuk lihat semua token beserta risk score-nya.</i>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    const now = new Date().toLocaleString('id-ID', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
    });

    let header = `🛡️ <b>DEX SAFE TOKENS — RISIKO RENDAH</b>\n`;
    header += `<i>Liq >$100K · Vol >$200K · ${now} WIB</i>\n`;
    header += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    await bot.sendMessage(chatId, header, { parse_mode: 'HTML', disable_web_page_preview: true });

    for (let i = 0; i < top.length; i++) {
      const t   = top[i];
      const card = formatTokenCard(t, t._chainCfg, i + 1);
      await bot.sendMessage(chatId, card, { parse_mode: 'HTML', disable_web_page_preview: true });
      await new Promise(r => setTimeout(r, 300));
    }

    await bot.sendMessage(chatId,
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🟢 <i>Token di atas memenuhi kriteria likuiditas & volume minimum\n` +
      `dengan risk score terendah. Tetap DYOR sebelum investasi!</i>`,
      { parse_mode: 'HTML' }
    );

  } catch (e) {
    console.error('[DEX] runDexSafe error:', e.message);
    await bot.sendMessage(chatId,
      `❌ <b>Gagal memuat safe tokens.</b>\n<code>${e.message}</code>`,
      { parse_mode: 'HTML' }
    );
  }
}

module.exports = {
  runDexOverview,
  runDexChain,
  runDexHot,
  runDexSafe,
  CHAIN_CONFIG,
};
