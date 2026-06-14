const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// 1. Parse index.html to extract existing Striver questions
const htmlPath = path.resolve(__dirname, 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const rowRegex = /<tr class="prob-row"[^>]*>([\s\S]*?)<\/tr>/g;
const striverQuestions = [];
let match;
while ((match = rowRegex.exec(htmlContent)) !== null) {
  const rowHtml = match[1];
  const numMatch = rowHtml.match(/<td class="pnum">(\d+)<\/td>/);
  const linkMatch = rowHtml.match(/<td class="pname"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
  const subMatch = rowHtml.match(/<div class="sub">([\s\S]*?)<\/div>/);
  const diffMatch = rowHtml.match(/<span class="badge [^"]+">([\s\S]*?)<\/span>/);
  const platMatch = rowHtml.match(/<span class="plat [^"]+">([\s\S]*?)<\/span>/);
  
  if (linkMatch) {
    striverQuestions.push({
      num: numMatch ? parseInt(numMatch[1], 10) : striverQuestions.length + 1,
      title: linkMatch[2].replace(/<[^>]*>/g, '').trim(),
      url: linkMatch[1].trim(),
      subtitle: subMatch ? subMatch[1].replace(/<[^>]*>/g, '').trim() : '',
      difficulty: diffMatch ? diffMatch[1].trim() : 'Easy',
      platform: platMatch ? platMatch[1].trim() : 'LC'
    });
  }
}

console.log(`Loaded ${striverQuestions.length} Striver questions.`);

// Helper to normalize URLs
function normalizeUrl(url) {
  if (!url) return '';
  let u = url.trim().toLowerCase();
  u = u.replace(/^https?:\/\/(www\.)?/, '');
  u = u.replace(/\/+$/, '');
  // Simplify leetcode links
  u = u.replace(/leetcode\.com\/problems\/([^\/]+).*/, 'leetcode.com/problems/$1');
  // Simplify gfg links
  u = u.replace(/practice\.geeksforgeeks\.org\/problems\/([^\/]+).*/, 'practice.geeksforgeeks.org/problems/$1');
  u = u.replace(/geeksforgeeks\.org\/problems\/([^\/]+).*/, 'geeksforgeeks.org/problems/$1');
  u = u.replace(/geeksforgeeks\.org\/([^\/]+).*/, 'geeksforgeeks.org/$1');
  return u;
}

// Helper to normalize titles
function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Create lookup sets
const striverUrls = new Set();
striverQuestions.forEach(q => {
  const norm = normalizeUrl(q.url);
  if (norm) striverUrls.add(norm);
});
const striverTitles = new Set(striverQuestions.map(q => normalizeTitle(q.title)));

// 2. Load Excel File
const excelPath = path.resolve(__dirname, '450 Interview Questions - LeetCode edition.xlsx');
const workbook = XLSX.readFile(excelPath);

const leetCodedSheet = workbook.Sheets['LeetCoded'];
const originalSheet = workbook.Sheets['Original'];

// Parse sheets into row maps
function getSheetRows(sheet, startRow) {
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

// Now, we align the rows.
// LeetCoded questions start at row 7.
// Original questions start at row 6.
// They correspond exactly: LeetCoded Row r corresponds to Original Row r - 1.
// Let's verify and collect them.

const babbarCompiled = [];
const seenExcelTitles = new Set();
const seenExcelUrls = new Set();

for (let r = 7; r <= 1005; r++) {
  const lcRow = leetCodedRows[r];
  const origRow = originalRows[r - 1];
  
  if (!lcRow || !lcRow.B) continue;
  
  const topic = lcRow.A ? String(lcRow.A.v || '').trim() : '';
  const title = String(lcRow.B.v || '').trim();
  const lcUrl = lcRow.B.url || '';
  
  if (!title || title === 'Problem:') continue;
  
  const origTitle = origRow && origRow.B ? String(origRow.B.v || '').trim() : '';
  const gfgUrl = origRow && origRow.B ? origRow.B.url || '' : '';
  
  const normTitle = normalizeTitle(title);
  const normLcUrl = normalizeUrl(lcUrl);
  const normGfgUrl = normalizeUrl(gfgUrl);
  
  // Skip duplicates inside the Excel file itself
  if (seenExcelTitles.has(normTitle)) continue;
  if (normLcUrl && seenExcelUrls.has(normLcUrl)) continue;
  if (normGfgUrl && seenExcelUrls.has(normGfgUrl)) continue;
  
  seenExcelTitles.add(normTitle);
  if (normLcUrl) seenExcelUrls.add(normLcUrl);
  if (normGfgUrl) seenExcelUrls.add(normGfgUrl);
  
  babbarCompiled.push({
    rowLC: r,
    rowOrig: r - 1,
    topic,
    title,
    lcUrl,
    gfgUrl
  });
}

console.log(`Compiled ${babbarCompiled.length} unique questions from Love Babbar sheet.`);

// 3. Filter out duplicates with Striver questions
const newQuestions = [];
let dupCount = 0;
let dupUrlsLC = 0;
let dupUrlsGFG = 0;
let dupTitles = 0;

babbarCompiled.forEach(q => {
  const normTitle = normalizeTitle(q.title);
  const normLc = normalizeUrl(q.lcUrl);
  const normGfg = normalizeUrl(q.gfgUrl);
  
  const hasLcDup = normLc && striverUrls.has(normLc);
  const hasGfgDup = normGfg && striverUrls.has(normGfg);
  const hasTitleDup = striverTitles.has(normTitle);
  
  if (hasLcDup || hasGfgDup || hasTitleDup) {
    dupCount++;
    if (hasLcDup) dupUrlsLC++;
    else if (hasGfgDup) dupUrlsGFG++;
    else if (hasTitleDup) dupTitles++;
  } else {
    newQuestions.push(q);
  }
});

console.log(`Total duplicate questions with Striver's sheet: ${dupCount} (LC URL: ${dupUrlsLC}, GFG URL: ${dupUrlsGFG}, Title: ${dupTitles})`);
console.log(`Total unique new questions to add: ${newQuestions.length}`);

// Write the result to a JSON file for the next step
fs.writeFileSync('new_babbar_questions.json', JSON.stringify(newQuestions, null, 2));
console.log(`Saved ${newQuestions.length} new questions to new_babbar_questions.json`);

// Let's see how they are distributed by topic
const topicCounts = {};
newQuestions.forEach(q => {
  topicCounts[q.topic] = (topicCounts[q.topic] || 0) + 1;
});
console.log('Topic distribution of new questions:', topicCounts);

