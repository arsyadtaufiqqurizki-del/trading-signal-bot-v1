'use strict';

const axios = require('axios');

// ============================================================
// CACHE (pola dari instruction.md)
// ============================================================
const _store = new Map();
async function cached(key, ttlMs, fn) {
  const hit = _store.get(key);
  if (hit && Date.now() < hit.exp) return hit.val;
  if (hit) _store.delete(key);
  const result = await fn();
  if (result != null) _store.set(key, { val: result, exp: Date.now() + ttlMs });
  return result;
}

// ============================================================
// CONSTANTS
// ============================================================
const BASE_URL  = 'https://api.football-data.org/v4';
const COMP_CODE = 'WC';
const TTL = {
  TODAY    : 5  * 60 * 1000,  // 5 menit  — match hari ini (live)
  UPCOMING : 30 * 60 * 1000,  // 30 menit — jadwal
  RESULTS  : 10 * 60 * 1000,  // 10 menit — hasil terbaru
  STANDINGS: 15 * 60 * 1000,  // 15 menit — klasemen
  PREDICT  : 60 * 60 * 1000,  // 60 menit — prediksi AI
  H2H      : 24 * 60 * 60 * 1000, // 24 jam — head to head
};

function getHeaders() {
  return {
    'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN || '',
  };
}

const REQ = { timeout: 12000 };

// ============================================================
// FLAG EMOJI MAP — 48 tim WC 2026
// ============================================================
const FLAG = {
  // === GRUP A ===
  'Mexico'              : '🇲🇽', 'Korea Republic'    : '🇰🇷', 'South Korea'      : '🇰🇷',
  'Czechia'             : '🇨🇿', 'Czech Republic'    : '🇨🇿', 'South Africa'     : '🇿🇦',
  // === GRUP B ===
  'Argentina'           : '🇦🇷', 'Iraq'              : '🇮🇶', 'Qatar'            : '🇶🇦',
  'Bosnia-H.'           : '🇧🇦', 'Bosnia and Herzegovina': '🇧🇦', 'Bosnia Herzegovina': '🇧🇦',
  'Bosnia-Herzegovina'  : '🇧🇦', 'Bosnia &amp; Herzegovina': '🇧🇦',
  'Switzerland'         : '🇨🇭', 'Canada'            : '🇨🇦',
  // === GRUP C ===
  'Scotland'            : '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Morocco'           : '🇲🇦', 'Brazil'           : '🇧🇷',
  'Haiti'               : '🇭🇹',
  // === GRUP D ===
  'USA'                 : '🇺🇸', 'United States'     : '🇺🇸', 'Australia'        : '🇦🇺',
  'Turkey'              : '🇹🇷', 'Türkiye'           : '🇹🇷', 'Paraguay'         : '🇵🇾',
  // === GRUP E ===
  'Germany'             : '🇩🇪', 'Ivory Coast'       : '🇨🇮', "Cote d'Ivoire"    : '🇨🇮',
  'Ecuador'             : '🇪🇨', 'Curaçao'           : '🇨🇼', 'Curacao'          : '🇨🇼',
  // === GRUP F ===
  'Sweden'              : '🇸🇪', 'Japan'             : '🇯🇵', 'Netherlands'      : '🇳🇱',
  'Tunisia'             : '🇹🇳',
  // === GRUP G ===
  'Belgium'             : '🇧🇪', 'Egypt'             : '🇪🇬', 'Iran'             : '🇮🇷',
  'New Zealand'         : '🇳🇿',
  // === GRUP H ===
  'Spain'               : '🇪🇸', 'Cape Verde'        : '🇨🇻', 'Cape Verde Islands': '🇨🇻',
  'Saudi Arabia'        : '🇸🇦', 'Uruguay'           : '🇺🇾',
  // === GRUP I ===
  'France'              : '🇫🇷', 'Senegal'           : '🇸🇳', 'Iraq'             : '🇮🇶',
  'Norway'              : '🇳🇴',
  // === GRUP J ===
  'Algeria'             : '🇩🇿', 'Argentina'         : '🇦🇷', 'Jordan'           : '🇯🇴',
  'Austria'             : '🇦🇹',
  // === GRUP K ===
  'Portugal'            : '🇵🇹', 'Colombia'          : '🇨🇴', 'Uzbekistan'       : '🇺🇿',
  'Congo DR'            : '🇨🇩', 'DR Congo'          : '🇨🇩', 'Congo, DR'        : '🇨🇩',
  // === GRUP L ===
  'England'             : '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Ghana'             : '🇬🇭', 'Croatia'          : '🇭🇷',
  'Panama'              : '🇵🇦',
  // === TAMBAHAN / ALIAS ===
  'Poland'              : '🇵🇱', 'Serbia'            : '🇷🇸', 'Nigeria'          : '🇳🇬',
  'Indonesia'           : '🇮🇩', 'Chile'             : '🇨🇱', 'Tanzania'         : '🇹🇿',
  'Angola'              : '🇦🇴', 'Slovakia'          : '🇸🇰', 'Bahrain'          : '🇧🇭',
  'Cameroon'            : '🇨🇲', 'Romania'           : '🇷🇴', 'Albania'          : '🇦🇱',
  'Senegal'             : '🇸🇳',
};

function getFlag(teamName) {
  return FLAG[teamName] || '🏳️';
}

// ============================================================
// HELPER — Konversi UTC ke WIB (UTC+7)
// ============================================================
function toWIB(utcDateStr) {
  const d = new Date(utcDateStr);
  d.setHours(d.getHours() + 7);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} WIB`;
}

function toWIBDate(utcDateStr) {
  const d = new Date(utcDateStr);
  d.setHours(d.getHours() + 7);
  const days   = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} WIB`;
}

function todayRange() {
  // Hari ini UTC (karena API pakai UTC)
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function groupLabel(raw) {
  // 'GROUP_A' → 'Grup A'
  if (!raw) return '';
  return raw.replace('GROUP_', 'Grup ');
}

function stageLabel(stage) {
  const map = {
    GROUP_STAGE       : 'Fase Grup',
    LAST_16           : 'Babak 16 Besar',
    QUARTER_FINALS    : 'Perempat Final',
    SEMI_FINALS       : 'Semi Final',
    THIRD_PLACE_MATCH : 'Perebutan Tempat 3',
    FINAL             : 'FINAL 🏆',
  };
  return map[stage] || stage;
}

function statusIcon(status) {
  const map = {
    SCHEDULED : '⏳', TIMED     : '⏳',
    IN_PLAY   : '🟢', PAUSED    : '🟡',
    FINISHED  : '✅', CANCELLED : '❌',
    POSTPONED : '🔄', SUSPENDED : '⚠️',
  };
  return map[status] || '❓';
}

// ============================================================
// FETCHERS
// ============================================================

/** Ambil match hari ini (UTC) */
async function fetchTodayMatches() {
  return cached('bola_today', TTL.TODAY, async () => {
    const date = todayRange();
    const { data } = await axios.get(`${BASE_URL}/competitions/${COMP_CODE}/matches`, {
      headers: getHeaders(),
      params : { dateFrom: date, dateTo: date },
      ...REQ,
    });
    return data.matches || [];
  });
}

/** Ambil jadwal mendatang (status SCHEDULED/TIMED) */
async function fetchUpcomingMatches() {
  return cached('bola_upcoming', TTL.UPCOMING, async () => {
    const { data } = await axios.get(`${BASE_URL}/competitions/${COMP_CODE}/matches`, {
      headers: getHeaders(),
      params : { status: 'SCHEDULED' },
      ...REQ,
    });
    return data.matches || [];
  });
}

/** Ambil hasil terbaru (status FINISHED) */
async function fetchRecentResults() {
  return cached('bola_results', TTL.RESULTS, async () => {
    const { data } = await axios.get(`${BASE_URL}/competitions/${COMP_CODE}/matches`, {
      headers: getHeaders(),
      params : { status: 'FINISHED' },
      ...REQ,
    });
    // Urutkan dari terbaru, ambil 5
    const sorted = (data.matches || []).sort(
      (a, b) => new Date(b.utcDate) - new Date(a.utcDate)
    );
    return sorted.slice(0, 5);
  });
}

/** Ambil klasemen semua grup */
async function fetchStandings() {
  return cached('bola_standings', TTL.STANDINGS, async () => {
    const { data } = await axios.get(`${BASE_URL}/competitions/${COMP_CODE}/standings`, {
      headers: getHeaders(),
      ...REQ,
    });
    return data.standings || [];
  });
}

/** Ambil semua match WC 2026 (untuk H2H lookup) */
async function fetchAllMatches() {
  return cached('bola_all', TTL.H2H, async () => {
    const { data } = await axios.get(`${BASE_URL}/competitions/${COMP_CODE}/matches`, {
      headers: getHeaders(),
      ...REQ,
    });
    return data.matches || [];
  });
}

// ============================================================
// FORMATTERS
// ============================================================

function formatMatchLine(m) {
  const homeName = m.homeTeam?.name || m.homeTeam?.shortName || 'TBD';
  const awayName = m.awayTeam?.name || m.awayTeam?.shortName || 'TBD';
  const home  = getFlag(homeName) + ' ' + (m.homeTeam?.shortName || homeName);
  const away  = (m.awayTeam?.shortName || awayName) + ' ' + getFlag(awayName);
  const icon  = statusIcon(m.status);
  const grp   = groupLabel(m.group);
  const stage = stageLabel(m.stage);
  const phase = m.stage === 'GROUP_STAGE' ? grp : stage;

  let scoreLine = '';
  if (m.status === 'FINISHED') {
    scoreLine = `<b>${m.score.fullTime.home} - ${m.score.fullTime.away}</b> (FT)`;
  } else if (m.status === 'IN_PLAY' || m.status === 'PAUSED') {
    const h = m.score.fullTime.home ?? 0;
    const a = m.score.fullTime.away ?? 0;
    scoreLine = `<b>${h} - ${a}</b> 🔴 LIVE`;
  } else {
    scoreLine = toWIB(m.utcDate);
  }

  return `${icon} <b>${home}  vs  ${away}</b>\n` +
         `   📍 ${phase} · MD${m.matchday} · ${scoreLine}`;
}

/** Format laporan hari ini */
function formatTodayReport(matches) {
  if (!matches || matches.length === 0) {
    return '⚽ <b>PIALA DUNIA 2026</b>\n\nTidak ada pertandingan hari ini.';
  }

  const live      = matches.filter(m => ['IN_PLAY','PAUSED'].includes(m.status));
  const upcoming  = matches.filter(m => ['TIMED','SCHEDULED'].includes(m.status))
                            .sort((a,b) => new Date(a.utcDate)-new Date(b.utcDate));
  const finished  = matches.filter(m => m.status === 'FINISHED')
                            .sort((a,b) => new Date(b.utcDate)-new Date(a.utcDate));

  const now  = new Date();
  const wib  = new Date(now.getTime() + 7*3600*1000);
  const tgl  = `${wib.getUTCDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'][wib.getUTCMonth()]} ${wib.getUTCFullYear()}`;

  let out = `⚽ <b>PIALA DUNIA 2026 — ${tgl}</b>\n`;
  out    += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (live.length > 0) {
    out += `\n🟢 <b>SEDANG BERLANGSUNG</b>\n`;
    live.forEach(m => { out += formatMatchLine(m) + '\n'; });
  }

  if (upcoming.length > 0) {
    out += `\n⏳ <b>JADWAL HARI INI</b>\n`;
    upcoming.forEach(m => { out += formatMatchLine(m) + '\n'; });
  }

  if (finished.length > 0) {
    out += `\n✅ <b>SUDAH SELESAI</b>\n`;
    finished.forEach(m => { out += formatMatchLine(m) + '\n'; });
  }

  out += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  out += `📋 /bola grup — Klasemen semua grup\n`;
  out += `🗓️ /bola jadwal — Jadwal mendatang\n`;
  out += `🤖 /bola prediksi — Prediksi AI`;
  return out;
}

/** Format jadwal mendatang */
function formatJadwalReport(matches) {
  if (!matches || matches.length === 0) {
    return '⚽ <b>PIALA DUNIA 2026 — Jadwal</b>\n\nTidak ada jadwal mendatang.';
  }

  // Kelompokkan per tanggal
  const byDate = {};
  matches.slice(0, 20).forEach(m => {
    const d = new Date(new Date(m.utcDate).getTime() + 7*3600*1000);
    const key = `${d.getUTCDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'][d.getUTCMonth()]}`;
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(m);
  });

  let out = `🗓️ <b>JADWAL PIALA DUNIA 2026</b>\n`;
  out    += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  Object.entries(byDate).forEach(([date, ms]) => {
    out += `\n📅 <b>${date}</b>\n`;
    ms.forEach(m => { out += formatMatchLine(m) + '\n'; });
  });

  out += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  out += `✅ /bola hasil — Hasil terbaru`;
  return out;
}

/** Format hasil terbaru */
function formatHasilReport(matches) {
  if (!matches || matches.length === 0) {
    return '⚽ <b>PIALA DUNIA 2026 — Hasil</b>\n\nBelum ada pertandingan selesai.';
  }

  let out = `✅ <b>HASIL TERBARU — PIALA DUNIA 2026</b>\n`;
  out    += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  matches.forEach(m => {
    out += '\n' + formatMatchLine(m) + '\n';
    out += `   📅 ${toWIBDate(m.utcDate)}\n`;
  });

  out += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  out += `📋 /bola grup — Klasemen`;
  return out;
}

/** Format klasemen semua grup */
function formatGrupReport(standings) {
  if (!standings || standings.length === 0) {
    return '📋 <b>KLASEMEN PIALA DUNIA 2026</b>\n\nData klasemen belum tersedia.';
  }

  let out = `📋 <b>KLASEMEN PIALA DUNIA 2026</b>\n`;
  out    += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  standings.forEach(grup => {
    const nama = grup.group || 'Grup';
    out += `\n<b>📌 ${nama}</b>\n`;

    // Header tabel (monospace Telegram)
    out += `<code>#  Tim          M  W  D  L  Pts</code>\n`;
    grup.table.forEach(row => {
      const flag = getFlag(row.team.name);
      const name = (row.team.shortName || row.team.name).padEnd(10).substring(0, 10);
      const pos  = String(row.position).padStart(2);
      const mp   = String(row.playedGames).padStart(2);
      const w    = String(row.won).padStart(2);
      const d    = String(row.draw).padStart(2);
      const l    = String(row.lost).padStart(2);
      const pts  = String(row.points).padStart(3);
      out += `<code>${pos} ${flag} ${name}${mp}${w}${d}${l}${pts}</code>\n`;
    });
  });

  out += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  out += `🏆 Tim posisi 1-2 lolos ke babak 16 besar\n`;
  out += `⚽ /bola — Pertandingan hari ini`;
  return out;
}

// ============================================================
// AI PREDICTION
// ============================================================

async function generatePrediction(match) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY tidak tersedia');

  const home  = match.homeTeam.name;
  const away  = match.awayTeam.name;
  const phase = match.stage === 'GROUP_STAGE'
    ? `Fase Grup ${groupLabel(match.group)} Matchday ${match.matchday}`
    : stageLabel(match.stage);

  const prompt = `Kamu adalah analis sepak bola profesional untuk Piala Dunia 2026.

Berikan prediksi SINGKAT dan PADAT untuk pertandingan:
🆚 ${home} vs ${away}
🏟️ ${phase}
📅 ${toWIBDate(match.utcDate)}

Berikan dalam format PERSIS ini (gunakan emoji, tanpa teks tambahan lain):

KEKUATAN_HOME: [2-3 poin kekuatan tim home]
KELEMAHAN_HOME: [1-2 poin kelemahan tim home]
KEKUATAN_AWAY: [2-3 poin kekuatan tim away]
KELEMAHAN_AWAY: [1-2 poin kelemahan tim away]
PREDIKSI_SKOR: [contoh: 2-1]
PEMENANG: [nama tim atau SERI]
KEPERCAYAAN: [angka 50-95]
OVER_2_5: [YA/TIDAK]
ALASAN: [3 poin alasan utama, pisahkan dengan |]`;

  const { data } = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'openai/gpt-4.1-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.4,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );

  return data.choices?.[0]?.message?.content || '';
}

function parseAndFormatPrediction(match, raw) {
  const get = (key) => {
    const m = raw.match(new RegExp(`${key}:\\s*(.+)`));
    return m ? m[1].trim() : '-';
  };

  const home     = match.homeTeam.name;
  const away     = match.awayTeam.name;
  const flagH    = getFlag(home);
  const flagA    = getFlag(away);
  const skor     = get('PREDIKSI_SKOR');
  const pemenang = get('PEMENANG');
  const conf     = parseInt(get('KEPERCAYAAN')) || 70;
  const over25   = get('OVER_2_5');
  const alasan   = get('ALASAN').split('|').map(s => s.trim()).filter(Boolean);
  const kuatH    = get('KEKUATAN_HOME');
  const lemahH   = get('KELEMAHAN_HOME');
  const kuatA    = get('KEKUATAN_AWAY');
  const lemahA   = get('KELEMAHAN_AWAY');
  const phase    = match.stage === 'GROUP_STAGE'
    ? `${groupLabel(match.group)} · MD${match.matchday}`
    : stageLabel(match.stage);

  const filled  = Math.round(conf / 10);
  const bar     = '█'.repeat(filled) + '░'.repeat(10 - filled);

  let out = `🤖 <b>PREDIKSI AI · Piala Dunia 2026</b>\n`;
  out    += `━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  out    += `🆚 <b>${flagH} ${home}  vs  ${away} ${flagA}</b>\n`;
  out    += `📅 ${toWIBDate(match.utcDate)}\n`;
  out    += `🏟️ ${phase}\n\n`;
  out    += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  out    += `${flagH} <b>${home}</b>\n`;
  out    += `✅ ${kuatH}\n❗ ${lemahH}\n\n`;
  out    += `${flagA} <b>${away}</b>\n`;
  out    += `✅ ${kuatA}\n❗ ${lemahA}\n\n`;
  out    += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  out    += `🎯 <b>PREDIKSI AI</b>\n`;
  out    += `Skor: <b>${skor}</b> (${pemenang} menang)\n`;
  out    += `Kepercayaan: ${bar} ${conf}%\n\n`;
  if (alasan.length > 0) {
    out  += `📌 <b>Faktor penentu:</b>\n`;
    alasan.forEach(a => { out += `• ${a}\n`; });
  }
  out    += `\n⚽ Over 2.5 Goals: ${over25 === 'YA' ? '✅ Kemungkinan besar' : '❌ Kemungkinan kecil'}\n`;
  out    += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  out    += `<i>⚠️ Prediksi AI berbasis data historis, bukan jaminan hasil.</i>`;
  return out;
}

// ============================================================
// EXPORTED HANDLERS
// ============================================================

/** /bola — jadwal & hasil hari ini */
async function runBola(bot, chatId) {
  await bot.sendMessage(chatId, '⚽ Mengambil data pertandingan hari ini...', { parse_mode: 'HTML' });
  try {
    const matches = await fetchTodayMatches();
    const text    = formatTodayReport(matches);
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('[bola] runBola error:', e.message);
    await bot.sendMessage(chatId, `❌ <b>Gagal mengambil data:</b>\n<code>${e.message}</code>`, { parse_mode: 'HTML' });
  }
}

/** /bola jadwal */
async function runBolaJadwal(bot, chatId) {
  await bot.sendMessage(chatId, '🗓️ Mengambil jadwal mendatang...', { parse_mode: 'HTML' });
  try {
    const matches = await fetchUpcomingMatches();
    const text    = formatJadwalReport(matches);
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('[bola] runBolaJadwal error:', e.message);
    await bot.sendMessage(chatId, `❌ <b>Gagal mengambil jadwal:</b>\n<code>${e.message}</code>`, { parse_mode: 'HTML' });
  }
}

/** /bola hasil */
async function runBolaHasil(bot, chatId) {
  await bot.sendMessage(chatId, '✅ Mengambil hasil terbaru...', { parse_mode: 'HTML' });
  try {
    const matches = await fetchRecentResults();
    const text    = formatHasilReport(matches);
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('[bola] runBolaHasil error:', e.message);
    await bot.sendMessage(chatId, `❌ <b>Gagal mengambil hasil:</b>\n<code>${e.message}</code>`, { parse_mode: 'HTML' });
  }
}

/** /bola grup */
async function runBolaGrup(bot, chatId) {
  await bot.sendMessage(chatId, '📋 Mengambil klasemen grup...', { parse_mode: 'HTML' });
  try {
    const standings = await fetchStandings();

    // Kirim per 4 grup agar tidak melebihi 4000 karakter
    let out = `📋 <b>KLASEMEN PIALA DUNIA 2026</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    const GRUP_LABEL = ['A','B','C','D','E','F','G','H','I','J','K','L'];

    standings.forEach((grup, idx) => {
      const label = GRUP_LABEL[idx] || idx;
      out += `\n<b>📌 GRUP ${label}</b>\n`;
      out += `<code>#  Tim           M  W  D  L Pts</code>\n`;

      grup.table.forEach(row => {
        const flag = getFlag(row.team.name);
        const name = (row.team.shortName || row.team.name).substring(0, 11).padEnd(11);
        const pos  = String(row.position).padStart(2);
        const mp   = String(row.playedGames).padStart(2);
        const w    = String(row.won).padStart(2);
        const d    = String(row.draw).padStart(2);
        const l    = String(row.lost).padStart(2);
        const pts  = String(row.points).padStart(3);
        out += `<code>${pos} ${flag} ${name}${mp}${w}${d}${l}${pts}</code>\n`;
      });
    });

    out += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    out += `🏆 Top-2 tiap grup + 8 terbaik peringkat-3 → 32 tim babak gugur\n`;
    out += `⚽ /bola — Pertandingan hari ini`;

    // Split jika terlalu panjang
    const MAX = 4000;
    if (out.length <= MAX) {
      await bot.sendMessage(chatId, out, { parse_mode: 'HTML' });
    } else {
      const chunks = [];
      const lines  = out.split('\n');
      let chunk    = '';
      lines.forEach(line => {
        if ((chunk + line + '\n').length > MAX) {
          chunks.push(chunk);
          chunk = '';
        }
        chunk += line + '\n';
      });
      if (chunk) chunks.push(chunk);
      for (const c of chunks) {
        await bot.sendMessage(chatId, c, { parse_mode: 'HTML' });
      }
    }
  } catch (e) {
    console.error('[bola] runBolaGrup error:', e.message);
    await bot.sendMessage(chatId, `❌ <b>Gagal mengambil klasemen:</b>\n<code>${e.message}</code>`, { parse_mode: 'HTML' });
  }
}

/** /bola prediksi [TEAM1 TEAM2] */
async function runBolaPrediksi(bot, chatId, team1, team2) {
  await bot.sendMessage(chatId, '🤖 Menganalisis dan membuat prediksi AI...', { parse_mode: 'HTML' });
  try {
    let targetMatches = [];

    if (team1 && team2) {
      // Mode custom: cari match yang melibatkan kedua tim
      const all = await fetchAllMatches();
      targetMatches = all.filter(m => {
        const h = m.homeTeam.name.toUpperCase();
        const a = m.awayTeam.name.toUpperCase();
        const t1 = team1.toUpperCase();
        const t2 = team2.toUpperCase();
        return (h.includes(t1) || a.includes(t1)) && (h.includes(t2) || a.includes(t2));
      });

      if (targetMatches.length === 0) {
        await bot.sendMessage(chatId,
          `❌ Pertandingan <b>${team1}</b> vs <b>${team2}</b> tidak ditemukan di jadwal WC 2026.\n` +
          `Coba gunakan nama tim dalam Bahasa Inggris, contoh:\n` +
          `<code>/bola prediksi France Germany</code>`,
          { parse_mode: 'HTML' }
        );
        return;
      }
    } else {
      // Mode default: ambil match hari ini yang belum selesai
      const today = await fetchTodayMatches();
      targetMatches = today.filter(m => ['TIMED','SCHEDULED','IN_PLAY'].includes(m.status));

      if (targetMatches.length === 0) {
        // Coba besok
        const upcoming = await fetchUpcomingMatches();
        targetMatches = upcoming.slice(0, 3);
      }
    }

    if (targetMatches.length === 0) {
      await bot.sendMessage(chatId, '⚽ Tidak ada pertandingan mendatang untuk diprediksi saat ini.', { parse_mode: 'HTML' });
      return;
    }

    // Prediksi max 2 match
    for (const match of targetMatches.slice(0, 2)) {
      const cacheKey = `bola_pred_${match.id}`;
      let text;

      const cached_pred = _store.get(cacheKey);
      if (cached_pred && Date.now() < cached_pred.exp) {
        text = cached_pred.val;
      } else {
        const raw = await generatePrediction(match);
        text = parseAndFormatPrediction(match, raw);
        _store.set(cacheKey, { val: text, exp: Date.now() + TTL.PREDICT });
      }

      await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
    }

  } catch (e) {
    console.error('[bola] runBolaPrediksi error:', e.message);
    await bot.sendMessage(chatId, `❌ <b>Gagal membuat prediksi:</b>\n<code>${e.message}</code>`, { parse_mode: 'HTML' });
  }
}

/** /bola h2h TEAM1 TEAM2 */
async function runBolaH2H(bot, chatId, team1, team2) {
  if (!team1 || !team2) {
    await bot.sendMessage(chatId,
      `❌ Format: <code>/bola h2h [tim1] [tim2]</code>\nContoh: <code>/bola h2h Brazil Argentina</code>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  await bot.sendMessage(chatId, `🔍 Mencari data H2H ${team1} vs ${team2}...`, { parse_mode: 'HTML' });
  try {
    // Cari di WC 2026 dulu
    const all = await fetchAllMatches();
    const t1  = team1.toUpperCase();
    const t2  = team2.toUpperCase();

    const matches = all.filter(m => {
      if (!m.homeTeam?.name || !m.awayTeam?.name) return false;
      const h = m.homeTeam.name.toUpperCase();
      const a = m.awayTeam.name.toUpperCase();
      return (h.includes(t1) || a.includes(t1)) && (h.includes(t2) || a.includes(t2));
    });

    let out = `📊 <b>HEAD-TO-HEAD · Piala Dunia 2026</b>\n`;
    out    += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (matches.length === 0) {
      out += `\n${team1} vs ${team2} belum pernah bertemu di WC 2026 ini.\n`;
      out += `\n💡 Gunakan <code>/bola prediksi ${team1} ${team2}</code> untuk prediksi AI jika ada di jadwal.`;
    } else {
      const t1wins = matches.filter(m => {
        const h = m.homeTeam.name.toUpperCase();
        const won = m.score?.winner;
        return (h.includes(t1) && won === 'HOME_TEAM') ||
               (!h.includes(t1) && won === 'AWAY_TEAM');
      }).length;
      const t2wins = matches.filter(m => {
        const h = m.homeTeam.name.toUpperCase();
        const won = m.score?.winner;
        return (h.includes(t2) && won === 'HOME_TEAM') ||
               (!h.includes(t2) && won === 'AWAY_TEAM');
      }).length;
      const draws = matches.filter(m => m.score?.winner === 'DRAW').length;

      out += `\n🏆 ${team1}: ${t1wins} Menang | Seri: ${draws} | ${team2}: ${t2wins} Menang\n\n`;
      matches.forEach(m => {
        out += formatMatchLine(m) + '\n';
        out += `   📅 ${toWIBDate(m.utcDate)}\n\n`;
      });
    }

    out += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    out += `🤖 /bola prediksi ${team1} ${team2} — Prediksi AI`;

    await bot.sendMessage(chatId, out, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('[bola] runBolaH2H error:', e.message);
    await bot.sendMessage(chatId, `❌ <b>Gagal mengambil data H2H:</b>\n<code>${e.message}</code>`, { parse_mode: 'HTML' });
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  runBola,
  runBolaJadwal,
  runBolaHasil,
  runBolaGrup,
  runBolaPrediksi,
  runBolaH2H,
};
