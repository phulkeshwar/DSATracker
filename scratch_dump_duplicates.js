const XLSX = require('xlsx');
const path = require('path');

const filePath = path.resolve(__dirname, '450 Interview Questions - LeetCode edition.xlsx');
const workbook = XLSX.readFile(filePath);

const sheetName = 'LeetCoded';
const sheet = workbook.Sheets[sheetName];
const keys = Object.keys(sheet).filter(k => k[0] !== '!');
const rows = {};

keys.forEach(k => {
  const col = k.match(/[A-Z]+/)[0];
  const row = parseInt(k.match(/\d+/)[0], 10);
  if (!rows[row]) rows[row] = {};
  
  const cell = sheet[k];
  let val = cell.v;
  let url = null;
  if (cell.l && cell.l.Target) url = cell.l.Target;
  if (cell.f && cell.f.includes('HYPERLINK')) {
    const m = cell.f.match(/HYPERLINK\("([^"]+)"/i);
    if (m) url = m[1];
  }
  rows[row][col] = { v: val, url };
});

const rowNumbers = Object.keys(rows).map(Number).sort((a,b) => a-b);
const parsed = [];
const seenTitles = new Map();

rowNumbers.forEach(r => {
  if (r < 7) return; // headers end at row 6
  const rData = rows[r];
  if (!rData || !rData.B) return;
  
  const topic = rData.A ? String(rData.A.v || '').trim() : '';
  const problem = String(rData.B.v || '').trim();
  const url = rData.B.url || '';
  
  if (!problem) return;
  
  const norm = problem.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  if (!norm) return;
  
  if (seenTitles.has(norm)) {
    seenTitles.get(norm).push({ row: r, topic, problem, url });
  } else {
    seenTitles.set(norm, [{ row: r, topic, problem, url }]);
  }
});

console.log(`Unique titles count: ${seenTitles.size}`);

// Print duplicates
let dupCount = 0;
seenTitles.forEach((list, norm) => {
  if (list.length > 1) {
    dupCount++;
    console.log(`Duplicate Group ${dupCount} (norm: "${norm}"):`);
    list.forEach(item => {
      console.log(`  Row ${item.row}: [${item.topic}] "${item.problem}" -> URL: ${item.url}`);
    });
  }
});

