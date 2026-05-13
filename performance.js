'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'signals_data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('[Performance] Load error:', e.message);
  }
  return { signals: [] };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[Performance] Save error:', e.message);
  }
}

function normalizePair(input) {
  return input.toUpperCase().replace('/', '').replace('USDT', '');
}

// Dipanggil otomatis saat bot kirim sinyal
function saveSignal(signal) {
  const data = loadData();

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

  saveData(data);
}

// Dipanggil via /result — update hasil trade
function updateResult(pairInput, directionInput, resultInput) {
  const data      = loadData();
  const pairKey   = normalizePair(pairInput);
  const direction = directionInput.toUpperCase();
  const result    = resultInput.toUpperCase();

  // Cari sinyal OPEN terbaru untuk pair + direction ini
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
  else if (result === 'BE')              pnl = 0;

  data.signals[targetIdx] = { ...signal, status: 'CLOSED', result, closedAt: new Date().toISOString(), pnl };
  saveData(data);
  return data.signals[targetIdx];
}

// Dipanggil via /stats
function getStats(days = 30) {
  const data   = loadData();
  const cutoff = days === 0 ? new Date(0) : new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const closed = data.signals.filter(s => s.status === 'CLOSED' && new Date(s.sentAt) >= cutoff);
  const open   = data.signals.filter(s => s.status === 'OPEN');

  if (closed.length === 0) return { empty: true, days, open };

  const wins    = closed.filter(s => s.result === 'TP1' || s.result === 'TP2');
  const losses  = closed.filter(s => s.result === 'SL');
  const breaks  = closed.filter(s => s.result === 'BE');
  const winRate = ((wins.length / closed.length) * 100).toFixed(1);
  const totalPnl = closed.reduce((sum, s) => sum + (s.pnl || 0), 0).toFixed(2);

  // Per pair
  const pairMap = {};
  closed.forEach(s => {
    if (!pairMap[s.pair]) pairMap[s.pair] = { wins: 0, total: 0, pnl: 0 };
    pairMap[s.pair].total++;
    pairMap[s.pair].pnl = parseFloat((pairMap[s.pair].pnl + (s.pnl || 0)).toFixed(2));
    if (s.result === 'TP1' || s.result === 'TP2') pairMap[s.pair].wins++;
  });

  // Per setup type
  const setupMap = {};
  closed.forEach(s => {
    const st = s.setupType || 'Unknown';
    if (!setupMap[st]) setupMap[st] = { wins: 0, total: 0 };
    setupMap[st].total++;
    if (s.result === 'TP1' || s.result === 'TP2') setupMap[st].wins++;
  });

  // Per session
  const sessionMap = {};
  closed.forEach(s => {
    const sess = s.session || 'Unknown';
    if (!sessionMap[sess]) sessionMap[sess] = { wins: 0, total: 0 };
    sessionMap[sess].total++;
    if (s.result === 'TP1' || s.result === 'TP2') sessionMap[sess].wins++;
  });

  return { days, closed, open, wins, losses, breaks, winRate, totalPnl, pairMap, setupMap, sessionMap, empty: false };
}

// Dipanggil via /pending
function getPending() {
  return loadData().signals.filter(s => s.status === 'OPEN');
}

module.exports = { saveSignal, updateResult, getStats, getPending };
