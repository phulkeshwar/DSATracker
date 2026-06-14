const XLSX = require('xlsx');
const path = require('path');

const filePath = path.resolve(__dirname, '450 Interview Questions - LeetCode edition.xlsx');
const workbook = XLSX.readFile(filePath);

const leetCodedSheet = workbook.Sheets['LeetCoded'];
const originalSheet = workbook.Sheets['Original'];

// Parse sheets into row maps
function getSheetRows(sheet) {
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
  return rows;
}

const leetCodedRows = getSheetRows(leetCodedSheet);
const originalRows = getSheetRows(originalSheet);

function normalizeUrl(url) {
  if (!url) return '';
  let u = url.trim().toLowerCase();
  u = u.replace(/^https?:\/\/(www\.)?/, '');
  u = u.replace(/\/+$/, '');
  u = u.replace(/leetcode\.com\/problems\/([^\/]+).*/, 'leetcode.com/problems/$1');
  u = u.replace(/practice\.geeksforgeeks\.org\/problems\/([^\/]+).*/, 'practice.geeksforgeeks.org/problems/$1');
  u = u.replace(/geeksforgeeks\.org\/problems\/([^\/]+).*/, 'geeksforgeeks.org/problems/$1');
  u = u.replace(/geeksforgeeks\.org\/([^\/]+).*/, 'geeksforgeeks.org/$1');
  return u;
}

function normalizeTitle(title) {
  if (!title) return '';
  return title.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

const seenExcelTitles = new Set();
const seenExcelUrls = new Set();

let totalRowsChecked = 0;
let emptyTitle = 0;
let dupTitle = 0;
let dupLcUrl = 0;
let dupGfgUrl = 0;
let validCount = 0;

for (let r = 7; r <= 1005; r++) {
  const lcRow = leetCodedRows[r];
  const origRow = originalRows[r - 1];
  
  if (!lcRow || !lcRow.B) {
    continue;
  }
  
  const title = String(lcRow.B.v || '').trim();
  if (!title || title === 'Problem:') {
    emptyTitle++;
    continue;
  }
  
  totalRowsChecked++;
  
  const topic = lcRow.A ? String(lcRow.A.v || '').trim() : '';
  const lcUrl = lcRow.B.url || '';
  const gfgUrl = origRow && origRow.B ? origRow.B.url || '' : '';
  
  const normTitle = normalizeTitle(title);
  const normLcUrl = normalizeUrl(lcUrl);
  const normGfgUrl = normalizeUrl(gfgUrl);
  
  let skipped = false;
  if (seenExcelTitles.has(normTitle)) {
    dupTitle++;
    skipped = true;
  }
  if (!skipped && normLcUrl && seenExcelUrls.has(normLcUrl)) {
    dupLcUrl++;
    skipped = true;
    // Log a few duplicates
    if (dupLcUrl <= 5) {
      console.log(`Duplicate LC URL: "${normLcUrl}" in row ${r} (Title: "${title}")`);
    }
  }
  if (!skipped && normGfgUrl && seenExcelUrls.has(normGfgUrl)) {
    dupGfgUrl++;
    skipped = true;
    if (dupGfgUrl <= 5) {
      console.log(`Duplicate GFG URL: "${normGfgUrl}" in row ${r} (Title: "${title}")`);
    }
  }
  
  if (skipped) continue;
  
  seenExcelTitles.add(normTitle);
  if (normLcUrl) seenExcelUrls.add(normLcUrl);
  if (normGfgUrl) seenExcelUrls.add(normGfgUrl);
  
  validCount++;
}

console.log(`\nTotal rows with titles: ${totalRowsChecked}`);
console.log(`Skipped by empty title: ${emptyTitle}`);
console.log(`Skipped by duplicate title: ${dupTitle}`);
console.log(`Skipped by duplicate LeetCode URL: ${dupLcUrl}`);
console.log(`Skipped by duplicate GFG URL: ${dupGfgUrl}`);
console.log(`Total valid compiled: ${validCount}`);
