const XLSX = require('xlsx');
const path = require('path');

const filePath = path.resolve(__dirname, '450 Interview Questions - LeetCode edition.xlsx');
const workbook = XLSX.readFile(filePath);
const originalSheet = workbook.Sheets['Original'];

const keys = Object.keys(originalSheet).filter(k => k[0] !== '!');
const rows = {};

keys.forEach(k => {
  const col = k.match(/[A-Z]+/)[0];
  const row = parseInt(k.match(/\d+/)[0], 10);
  if (!rows[row]) rows[row] = {};
  
  const cell = originalSheet[k];
  let val = cell.v;
  let url = null;
  if (cell.l && cell.l.Target) url = cell.l.Target;
  if (cell.f && cell.f.includes('HYPERLINK')) {
    const m = cell.f.match(/HYPERLINK\("([^"]+)"/i);
    if (m) url = m[1];
  }
  rows[row][col] = { v: val, url, f: cell.f };
});

for (let r = 1; r <= 25; r++) {
  const rowData = rows[r];
  if (rowData && rowData.B) {
    console.log(`Row ${r}: Title="${rowData.B.v}" URL="${rowData.B.url}" Formula="${rowData.B.f}"`);
  }
}
