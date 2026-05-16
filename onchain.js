'use strict';

const axios = require('axios');
const { fmt, pct } = require('./utils');

const REQ = { timeout: 10000 };

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function fetchFearGreed() {
  try {
    const { data } = await axios.get('https://api.alternative.me/fng/?limit=2', REQ);
    const [curr, prev] = data.data;
    return {
      value: +curr.value,
      label: curr.value_classification,
      prevValue: +prev.value,
      prevLabel: prev.value_classification
    };
  } catch { return null; }
}

async function fetchGlobal() {
  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/global', REQ);
    const d = data.data;
    return {
      totalMcap: d.total_market_cap.usd,
      btcDom: d.market_cap_percentage.btc,
      ethDom: d.market_cap_percentage.eth,
      stableDom: (d.market_cap_percentage.usdt || 0) + (d.market_cap_percentage.usdc || 0),
      mcapChange24h: d.market_cap_change_percentage_24h_usd
    };
  } catch { return null; }
}

// BTC: network stats (blockchain.info) + price (CoinGecko)
async function fetchBtcStats() {
  try {
    const [statsRes, priceRes] = await Promise.all([
      axios.get('https://blockchain.info/stats?format=json', { timeout: 10000 }),
      axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_7d_change=true', REQ)
    ]);

    const s = statsRes.data;
    const p = priceRes.data.bitcoin;

    return {
      hashEhs: s.hash_rate / 1e9,                     // GH/s → EH/s
      blockTimeMins: s.minutes_between_blocks,
      txCount24h: s.n_tx,
      txVolumeUsd: s.estimated_transaction_volume_usd,
      difficulty: s.difficulty,
      price: p.usd,
      change24h: p.usd_24h_change,
      change7d: p.usd_7d_change || null
    };
  } catch { return null; }
}

// DeFi: total TVL + 7d change (historical) + top chains
async function fetchDefi() {
  try {
    const [histRes, chainsRes] = await Promise.all([
      axios.get('https://api.llama.fi/v2/historicalChainTvl', { timeout: 12000 }),
      axios.get('https://api.llama.fi/v2/chains', { timeout: 10000 })
    ]);

    // Total TVL + 7d change from history
    const hist = histRes.data;
    const latest = hist[hist.length - 1];
    const week   = hist[hist.length - 8] || hist[0];
    const change7d = ((latest.tvl - week.tvl) / week.tvl) * 100;

    // Top 5 chains
    const top5 = [...chainsRes.data]
      .filter(c => c.tvl > 1e6)
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 5);

    return {
      totalTvl: latest.tvl,
      change7d,
      chains: top5.map(c => ({ name: c.name, tvl: c.tvl }))
    };
  } catch { return null; }
}

// ETH: price + Lido liquid staking TVL (largest ETH staking protocol)
async function fetchEthData() {
  try {
    const [priceRes, lidoRes] = await Promise.all([
      axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true&include_7d_change=true', REQ),
      axios.get('https://api.llama.fi/protocol/lido', { timeout: 10000 })
    ]);

    const p = priceRes.data.ethereum;
    const lidoTvlUsd = lidoRes.data.currentChainTvls?.Ethereum || 0;
    const ethStakedLido = p.usd > 0 ? lidoTvlUsd / p.usd : 0;

    return {
      price: p.usd,
      change24h: p.usd_24h_change,
      change7d: p.usd_7d_change || null,
      lidoTvlUsd,
      ethStakedLido
    };
  } catch { return null; }
}

// ─── Signal helpers ───────────────────────────────────────────────────────────

function fgIcon(v) {
  if (v >= 75) return '🟢';
  if (v >= 55) return '🟡';
  if (v >= 45) return '🟠';
  return '🔴';
}

function hashRateLabel(ehs) {
  if (!ehs) return ['⚪', 'N/A'];
  if (ehs > 800) return ['🟢', 'ATH Zone — miner sangat percaya diri'];
  if (ehs > 600) return ['🟢', 'Sangat kuat'];
  if (ehs > 400) return ['🟡', 'Normal'];
  return ['🟠', 'Melemah'];
}

function blockTimeLabel(mins) {
  if (!mins) return ['⚪', 'N/A'];
  if (mins < 8)   return ['🟢', 'Sangat cepat — demand tinggi'];
  if (mins < 11)  return ['🟢', 'Normal (target 10 min)'];
  if (mins < 14)  return ['🟡', 'Sedikit lambat'];
  return ['🟠', 'Lambat'];
}

function tvlStr(n) {
  if (!n) return 'N/A';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

function volStr(n) {
  if (!n) return 'N/A';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

// ─── Report builder ───────────────────────────────────────────────────────────

function buildReport(target, fg, global, btc, defi, eth) {
  const now     = new Date();
  const dateStr = now.toLocaleString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: 'Asia/Jakarta'
  });
  const timeStr = now.toLocaleString('id-ID', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
  });

  let r = `<b>ON-CHAIN INTELLIGENCE</b>\n`;
  r += `<i>Blockchain Analytics · ${dateStr} · ${timeStr} WIB</i>\n`;
  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // ── Fear & Greed ──
  if (fg) {
    const arrow = fg.value > fg.prevValue ? '↑' : fg.value < fg.prevValue ? '↓' : '→';
    r += `<b>FEAR &amp; GREED INDEX</b>\n`;
    r += `${fgIcon(fg.value)} <b>${fg.value} — ${fg.label}</b>\n`;
    r += `Kemarin: ${fg.prevValue} (${fg.prevLabel}) ${arrow}\n\n`;
  }

  // ── Global Market ──
  if (global && (target === 'all' || target === 'btc' || target === 'eth')) {
    const mcapStr    = global.totalMcap >= 1e12
      ? `$${(global.totalMcap / 1e12).toFixed(2)}T`
      : `$${(global.totalMcap / 1e9).toFixed(0)}B`;
    const stableIcon = global.stableDom > 12 ? '🔴' : global.stableDom > 9 ? '🟡' : '🟢';

    r += `<b>MARKET GLOBAL</b>\n`;
    r += `Total Market Cap : <b>${mcapStr}</b> (${pct(global.mcapChange24h)})\n`;
    r += `BTC Dominance    : <b>${fmt(global.btcDom, 1)}%</b>  ${global.btcDom > 50 ? '← BTC Season' : '← Alt Season potensial'}\n`;
    r += `Stablecoin Dom   : ${stableIcon} ${fmt(global.stableDom, 1)}%  ${global.stableDom > 12 ? '← Fear tinggi' : '← Normal'}\n\n`;
  }

  // ── BTC Network ──
  if (btc && (target === 'all' || target === 'btc')) {
    const [hrIcon, hrText]  = hashRateLabel(btc.hashEhs);
    const [btIcon, btText]  = blockTimeLabel(btc.blockTimeMins);
    const priceChg7d = btc.change7d !== null ? `  /  7d: ${pct(btc.change7d)}` : '';

    r += `<b>BTC NETWORK</b>\n`;
    r += `Harga       : <b>$${btc.price ? btc.price.toLocaleString('en-US') : 'N/A'}</b>  (24h: ${pct(btc.change24h)}${priceChg7d})\n`;
    r += `Hash Rate   : <b>${btc.hashEhs ? fmt(btc.hashEhs, 0) : 'N/A'} EH/s</b>  ${hrIcon} ${hrText}\n`;
    r += `Block Time  : <b>${btc.blockTimeMins ? fmt(btc.blockTimeMins, 1) : 'N/A'} menit</b>  ${btIcon} ${btText}\n`;
    r += `Tx/24h      : ${btc.txCount24h ? btc.txCount24h.toLocaleString('en-US') : 'N/A'} transaksi\n`;
    r += `Volume Tx   : ${volStr(btc.txVolumeUsd)} /24h\n\n`;
  }

  // ── ETH & Liquid Staking ──
  if (eth && (target === 'all' || target === 'eth')) {
    const priceChg7d = eth.change7d !== null ? `  /  7d: ${pct(eth.change7d)}` : '';
    const lidoEthStr = eth.ethStakedLido > 0
      ? `${(eth.ethStakedLido / 1e6).toFixed(2)}M ETH  (${tvlStr(eth.lidoTvlUsd)})`
      : 'N/A';

    r += `<b>ETH &amp; LIQUID STAKING</b>\n`;
    r += `Harga ETH       : <b>$${eth.price ? eth.price.toLocaleString('en-US') : 'N/A'}</b>  (24h: ${pct(eth.change24h)}${priceChg7d})\n`;
    r += `Lido Staked ETH : <b>${lidoEthStr}</b>\n`;
    r += `<i>(Lido = protokol liquid staking terbesar, ~30% total staked ETH)</i>\n\n`;
  }

  // ── DeFi TVL ──
  if (defi && (target === 'all' || target === 'defi' || target === 'eth')) {
    const chg7Icon = defi.change7d > 5 ? '🟢' : defi.change7d < -5 ? '🔴' : '🟡';

    r += `<b>DEFI TVL</b>\n`;
    r += `Total TVL  : <b>${tvlStr(defi.totalTvl)}</b>  ${chg7Icon} 7d: ${pct(defi.change7d)}\n`;
    r += `\n<b>Top Chains:</b>\n`;
    defi.chains.forEach((c, i) => {
      r += `${i + 1}. <code>${c.name.substring(0, 10).padEnd(10)}</code>  ${tvlStr(c.tvl)}\n`;
    });
    r += '\n';
  }

  // ── Signal synthesis ──
  const signals = [];

  if (fg) {
    if (fg.value >= 70)       signals.push(['🔴', `Fear &amp; Greed ${fg.value} — <i>terlalu greedy</i>, risiko koreksi`]);
    else if (fg.value >= 50)  signals.push(['🟢', `Fear &amp; Greed ${fg.value} — sentimen positif`]);
    else if (fg.value <= 25)  signals.push(['🟢', `Fear &amp; Greed ${fg.value} — zona akumulasi historis`]);
    else                      signals.push(['🟡', `Fear &amp; Greed ${fg.value} — netral/fear`]);
  }

  if (btc) {
    const [hrIcon] = hashRateLabel(btc.hashEhs);
    signals.push([hrIcon, `Hash Rate ${fmt(btc.hashEhs, 0)} EH/s — ${hashRateLabel(btc.hashEhs)[1]}`]);
    if (btc.change7d !== null) {
      if (btc.change7d > 10)        signals.push(['🟢', `BTC +${fmt(btc.change7d, 1)}% (7d) — momentum kuat`]);
      else if (btc.change7d < -10)  signals.push(['🔴', `BTC ${fmt(btc.change7d, 1)}% (7d) — tekanan jual`]);
    }
  }

  if (defi?.change7d != null) {
    if (defi.change7d > 3)       signals.push(['🟢', `DeFi TVL +${fmt(defi.change7d, 1)}% (7d) — capital inflow`]);
    else if (defi.change7d < -3) signals.push(['🔴', `DeFi TVL ${fmt(defi.change7d, 1)}% (7d) — capital outflow`]);
    else                         signals.push(['🟡', `DeFi TVL stabil (7d: ${pct(defi.change7d)})`]);
  }

  if (global) {
    if (global.btcDom > 55)      signals.push(['🟡', `BTC Dom ${fmt(global.btcDom, 1)}% — altcoin underperform`]);
    else if (global.btcDom < 45) signals.push(['🟢', `BTC Dom ${fmt(global.btcDom, 1)}% — potensi alt season`]);
  }

  if (signals.length > 0) {
    r += `<b>SINYAL ON-CHAIN</b>\n`;
    signals.forEach(([icon, text]) => { r += `${icon} ${text}\n`; });
    r += '\n';
  }

  // ── Kesimpulan ──
  const bullish = signals.filter(([icon]) => icon === '🟢').length;
  const bearish = signals.filter(([icon]) => icon === '🔴').length;
  let conclusion;
  if (bullish > bearish + 1)  conclusion = `Data on-chain mendukung bias <b>BULLISH</b> jangka menengah.`;
  else if (bearish > bullish) conclusion = `Data on-chain menunjukkan tekanan <b>BEARISH</b> — waspadai distribusi.`;
  else                        conclusion = `Data on-chain <b>MIXED</b> — tunggu konfirmasi tambahan.`;

  r += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  r += `<b>KESIMPULAN:</b> ${conclusion}\n\n`;
  r += `<i>Filter: /onchain btc · /onchain eth · /onchain defi</i>`;

  return r;
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function runOnchainAnalysis(bot, chatId, target = 'all') {
  await bot.sendMessage(chatId, `⏳ Memuat data on-chain${target !== 'all' ? ` [${target.toUpperCase()}]` : ''}...`);

  const needBtc  = target === 'all' || target === 'btc';
  const needDefi = target === 'all' || target === 'defi' || target === 'eth';
  const needEth  = target === 'all' || target === 'eth';

  const [fg, global, btc, defi, eth] = await Promise.all([
    fetchFearGreed(),
    fetchGlobal(),
    needBtc  ? fetchBtcStats()  : Promise.resolve(null),
    needDefi ? fetchDefi()      : Promise.resolve(null),
    needEth  ? fetchEthData()   : Promise.resolve(null)
  ]);

  const report = buildReport(target, fg, global, btc, defi, eth);
  await bot.sendMessage(chatId, report, { parse_mode: 'HTML' });
}

module.exports = { runOnchainAnalysis };
