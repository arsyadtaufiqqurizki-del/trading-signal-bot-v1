'use strict';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return 'N/A';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function pct(n, d = 2) {
  if (n == null || isNaN(n)) return 'N/A';
  return (n >= 0 ? '+' : '') + Number(n).toFixed(d) + '%';
}

function nowWIB() {
  return new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getSession() {
  const h = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).getHours();
  if (h >= 14 && h < 20) return { name: 'London Session 🇬🇧', active: true };
  if (h >= 20 || h < 2)  return { name: 'New York Session 🇺🇸', active: true };
  if (h >= 2  && h < 8)  return { name: 'Asian Session 🌏', active: true };
  return { name: 'Inter-Session (Low Liquidity) ⏸️', active: false };
}

function escMd(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

module.exports = { fmt, pct, nowWIB, getSession, escMd };
