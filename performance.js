'use strict';
const fs    = require('fs');
const path  = require('path');
const https = require('https');

const ENV_FILE  = path.join(__dirname, '.env');
const GIST_FILE = 'signals_data.json';

function getToken()  { return process.env.GITHUB_TOKEN || ''; }
function getGistId() { return process.env.GIST_ID || ''; }

// ── GitHub Gist HTTP helper ───────────────────────────────────────────────────
function gistRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.github.com',
      path:     endpoint,
      method,
      headers: {
        'Authorization': `token ${getToken()}`,
        'User-Agent':    'trading-signal-bot',
        'Accept':        'application/vnd.github.v3+json',
        'Content-Type':  'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Simpan GIST_ID ke .env setelah Gist pertama dibuat ───────────────────────
function persistGistId(id) {
  try {
    let env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
    env = env.includes('GIST_ID=')
      ? env.replace(/GIST_ID=.*/,  `GIST_ID=${id}`)
      : env + `\nGIST_ID=${id}`;
    fs.writeFileSync(ENV_FILE, env, 'utf8');
    process.env.GIST_ID = id;
    console.log(`[Performance] Gist baru dibuat: ${id}`);
  } catch (e) {
    console.error('[Performance] Gagal simpan GIST_ID:', e.message);
  }
}

// ── Load data dari Gist ───────────────────────────────────────────────────────
async function loadData() {
  const gistId = getGistId();
  if (!gistId) return { signals: [] };
  try {
    const gist = await gistRequest('GET', `/gists/${gistId}`);
    if (gist.files && gist.files[GIST_FILE]) {
      return JSON.parse(gist.files[GIST_FILE].content);
    }
  } catch (e) {
    console.error('[Performance] Load error:', e.message);
  }
  return { signals: [] };
}

// ── Simpan data ke Gist (create jika belum ada) ───────────────────────────────
async function saveData(data) {
  const content = JSON.stringify(data, null, 2);
  try {
    if (!getGistId()) {
      const result = await gistRequest('POST', '/gists', {
        description: 'Trading Bot — Signal Performance Data',
        public: false,
        files: { [GIST_FILE]: { content } },
      });
      if (result.id) persistGistId(result.id);
    } else {
      await gistRequest('PATCH', `/gists/${getGistId()}`, {
        files: { [GIST_FILE]: { content } },
      });
    }
  } catch (e) {
    console.error('[Performance] Save error:', e.message);
  }
}

// ── Normalisasi nama pair ─────────────────────────────────────────────────────
function normalizePair(input) {
  return input.toUpperCase().replace('/', '').replace('USDT', '');
}

// ── Dipanggil otomatis saat bot kirim sinyal via /high ────────────────────────
async function saveSignal(signal) {
  const data = await loadData();

  let setupType = 'Trend Continuation';
  if (signal.liquiditySweep) setupType = 'Liquidity Sweep';
  else if (signal.divergence) setupType = 'Divergence Reversal';
  else if (signal.bos)        setupType = 'BOS Breakout';

  data.signals.push({
    id:              `sig_${Date.now()}`,
    pair:            signal.pair,
    direction:       signal.direction,
    entry:           signal.entryAggressive,
    tp1:             signal.tp1,
    tp2:             signal.tp2,
    sl:              signal.sl,
    rr:              signal.rrAgg,
    confluenceScore: signal.confluenceScore,
    setupType,
    marketPhase:     signal.marketPhase    || null,
    session:         signal.sessionInfo    ? signal.sessionInfo.name : null,
    liquiditySweep:  signal.liquiditySweep || null,
    sentAt:          new Date().toISOString(),
    status:          'OPEN',
    result:          null,
    closedAt:        null,
    pnl:             null,
  });

  await saveData(data);
}

// ── Dipanggil via /result ─────────────────────────────────────────────────────
async function updateResult(pairInput, directionInput, resultInput) {
  const data      = await loadData();
  const pairKey   = normalizePair(pairInput);
  const direction = directionInput.toUpperCase();
  const result    = resultInput.toUpperCase();

  let targetIdx = -1;
  for (let i = data.signals.length - 1; i >= 0; i--) {
    const s = data.signals[i];
    if (s.status === 'OPEN' && s.direction === direction && normalizePair(s.pair) === pairKey) {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx === -1) return null;

  const signal = data.signals[targetIdx];
  const risk   = Math.abs(signal.entry - signal.sl);

  let pnl = 0;
  if      (result === 'TP1' && risk > 0) pnl = parseFloat(((Math.abs(signal.tp1 - signal.entry)) / risk).toFixed(2));
  else if (result === 'TP2' && risk > 0) pnl = parseFloat(((Math.abs(signal.tp2 - signal.entry)) / risk).toFixed(2));
  else if (result === 'SL')              pnl = -1;

  data.signals[targetIdx] = { ...signal, status: 'CLOSED', result, closedAt: new Date().toISOString(), pnl };
  await saveData(data);
  return data.signals[targetIdx];
}

// ── Dipanggil via /stats ──────────────────────────────────────────────────────
async function getStats(days = 30) {
  const data   = await loadData();
  const cutoff = days === 0 ? new Date(0) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const closed = data.signals.filter(s => s.status === 'CLOSED' && new Date(s.sentAt) >= cutoff);
  const open   = data.signals.filter(s => s.status === 'OPEN');

  if (closed.length === 0) return { empty: true, days, open };

  const wins    = closed.filter(s => s.result === 'TP1' || s.result === 'TP2');
  const losses  = closed.filter(s => s.result === 'SL');
  const breaks  = closed.filter(s => s.result === 'BE');
  const winRate = ((wins.length / closed.length) * 100).toFixed(1);
  const totalPnl = closed.reduce((sum, s) => sum + (s.pnl || 0), 0).toFixed(2);

  const pairMap = {};
  closed.forEach(s => {
    if (!pairMap[s.pair]) pairMap[s.pair] = { wins: 0, total: 0, pnl: 0 };
    pairMap[s.pair].total++;
    pairMap[s.pair].pnl = parseFloat((pairMap[s.pair].pnl + (s.pnl || 0)).toFixed(2));
    if (s.result === 'TP1' || s.result === 'TP2') pairMap[s.pair].wins++;
  });

  const setupMap = {};
  closed.forEach(s => {
    const st = s.setupType || 'Unknown';
    if (!setupMap[st]) setupMap[st] = { wins: 0, total: 0 };
    setupMap[st].total++;
    if (s.result === 'TP1' || s.result === 'TP2') setupMap[st].wins++;
  });

  const sessionMap = {};
  closed.forEach(s => {
    const sess = s.session || 'Unknown';
    if (!sessionMap[sess]) sessionMap[sess] = { wins: 0, total: 0 };
    sessionMap[sess].total++;
    if (s.result === 'TP1' || s.result === 'TP2') sessionMap[sess].wins++;
  });

  return { days, closed, open, wins, losses, breaks, winRate, totalPnl, pairMap, setupMap, sessionMap, empty: false };
}

// ── Dipanggil via /pending ────────────────────────────────────────────────────
async function getPending() {
  const data = await loadData();
  return data.signals.filter(s => s.status === 'OPEN');
}

module.exports = { saveSignal, updateResult, getStats, getPending };
