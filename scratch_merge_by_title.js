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

// Helper to normalize URLs (FIXED)
function normalizeUrl(url) {
  if (!url) return '';
  let u = url.trim().toLowerCase();
  u = u.replace(/^https?:\/\/(www\.)?/, '');
  u = u.replace(/\/+$/, '');
  
  if (u.includes('leetcode.com')) {
    u = u.replace(/leetcode\.com\/problems\/([^\/]+).*/, 'leetcode.com/problems/$1');
  } else if (u.includes('geeksforgeeks.org')) {
    if (u.includes('/problems/')) {
      u = u.replace(/geeksforgeeks\.org\/problems\/([^\/]+).*/, 'geeksforgeeks.org/problems/$1');
    } else {
      u = u.replace(/geeksforgeeks\.org\/([^\/]+).*/, 'geeksforgeeks.org/$1');
    }
  }
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

// Extract questions from both sheets
const leetCodedList = [];
const originalList = [];

// Parse LeetCoded Sheet (starts at row 7)
Object.keys(leetCodedRows).map(Number).sort((a,b) => a-b).forEach(r => {
  if (r < 7) return;
  const row = leetCodedRows[r];
  if (!row || !row.B) return;
  const topic = row.A ? String(row.A.v || '').trim() : '';
  const title = String(row.B.v || '').trim();
  const url = row.B.url || '';
  if (title && title !== 'Problem:') {
    leetCodedList.push({ topic, title, url });
  }
});

// Parse Original Sheet (starts at row 6)
Object.keys(originalRows).map(Number).sort((a,b) => a-b).forEach(r => {
  if (r < 6) return;
  const row = originalRows[r];
  if (!row || !row.B) return;
  const topic = row.A ? String(row.A.v || '').trim() : '';
  const title = String(row.B.v || '').trim();
  const url = row.B.url || '';
  if (title && title !== 'Problem:') {
    originalList.push({ topic, title, url });
  }
});

console.log(`Parsed ${leetCodedList.length} questions from LeetCoded sheet.`);
console.log(`Parsed ${originalList.length} questions from Original sheet.`);

// Now we merge them by title matching
const mergedQuestions = [];
const matchedLeetCodedIndices = new Set();

const leetCodedMap = new Map();
leetCodedList.forEach((q, idx) => {
  const norm = normalizeTitle(q.title);
  if (!leetCodedMap.has(norm)) {
    leetCodedMap.set(norm, []);
  }
  leetCodedMap.get(norm).push({ q, idx });
});

originalList.forEach(q => {
  const normTitle = normalizeTitle(q.title);
  let lcUrl = '';
  
  if (leetCodedMap.has(normTitle)) {
    const matches = leetCodedMap.get(normTitle);
    const match = matches[0];
    lcUrl = match.q.url;
    matchedLeetCodedIndices.add(match.idx);
  }
  
  mergedQuestions.push({
    topic: q.topic,
    title: q.title,
    lcUrl: lcUrl,
    gfgUrl: q.url
  });
});

// Add unmatched LeetCoded questions
leetCodedList.forEach((q, idx) => {
  if (!matchedLeetCodedIndices.has(idx)) {
    mergedQuestions.push({
      topic: q.topic,
      title: q.title,
      lcUrl: q.url,
      gfgUrl: ''
    });
  }
});

console.log(`Merged total questions: ${mergedQuestions.length}`);

// 3. De-duplicate compiled list against itself
const finalUniqueList = [];
const seenTitles = new Set();
const seenUrls = new Set();

mergedQuestions.forEach(q => {
  const normTitle = normalizeTitle(q.title);
  const normLc = normalizeUrl(q.lcUrl);
  const normGfg = normalizeUrl(q.gfgUrl);
  
  if (seenTitles.has(normTitle)) return;
  if (normLc && seenUrls.has(normLc)) return;
  if (normGfg && seenUrls.has(normGfg)) return;
  
  seenTitles.add(normTitle);
  if (normLc) seenUrls.add(normLc);
  if (normGfg) seenUrls.add(normGfg);
  
  finalUniqueList.push(q);
});

console.log(`Unique questions inside merged sheet list: ${finalUniqueList.length}`);

// 4. Filter out duplicates with Striver's sheet
const newUniqueQuestions = [];
let dupUrlsLC = 0;
let dupUrlsGFG = 0;
let dupTitles = 0;

finalUniqueList.forEach(q => {
  const normTitle = normalizeTitle(q.title);
  const normLc = normalizeUrl(q.lcUrl);
  const normGfg = normalizeUrl(q.gfgUrl);
  
  const hasLcDup = normLc && striverUrls.has(normLc);
  const hasGfgDup = normGfg && striverUrls.has(normGfg);
  const hasTitleDup = striverTitles.has(normTitle);
  
  if (hasLcDup || hasGfgDup || hasTitleDup) {
    if (hasLcDup) dupUrlsLC++;
    else if (hasGfgDup) dupUrlsGFG++;
    else if (hasTitleDup) dupTitles++;
  } else {
    newUniqueQuestions.push(q);
  }
});

console.log(`Total duplicate questions with Striver's sheet: ${dupUrlsLC + dupUrlsGFG + dupTitles} (LC URL: ${dupUrlsLC}, GFG URL: ${dupUrlsGFG}, Title: ${dupTitles})`);
console.log(`Total unique new questions to add: ${newUniqueQuestions.length}`);

fs.writeFileSync('new_babbar_questions.json', JSON.stringify(newUniqueQuestions, null, 2));
console.log(`Saved ${newUniqueQuestions.length} unique questions to new_babbar_questions.json`);

const topicCounts = {};
newUniqueQuestions.forEach(q => {
  topicCounts[q.topic] = (topicCounts[q.topic] || 0) + 1;
});
console.log('Topic distribution of new questions:', topicCounts);
