const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// 1. Parse index.html to extract existing Striver questions
const htmlPath = path.resolve(__dirname, 'index.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Regex to extract rows: <tr class="prob-row" ...> ... </tr>
const rowRegex = /<tr class="prob-row"[^>]*>([\s\S]*?)<\/tr>/g;
const striverQuestions = [];
let match;

while ((match = rowRegex.exec(htmlContent)) !== null) {
  const rowHtml = match[1];
  
  // Extract number, title, URL, platform, difficulty
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

console.log(`Parsed ${striverQuestions.length} questions from index.html`);

// Helper to normalize URLs for matching
function normalizeUrl(url) {
  if (!url) return '';
  let u = url.trim().toLowerCase();
  // Remove protocols
  u = u.replace(/^https?:\/\/(www\.)?/, '');
  // Remove trailing slashes
  u = u.replace(/\/+$/, '');
  // Normalize LeetCode links: remove /description or /discuss, etc.
  u = u.replace(/leetcode\.com\/problems\/([^\/]+).*/, 'leetcode.com/problems/$1');
  // Normalize GeeksforGeeks links
  u = u.replace(/practice\.geeksforgeeks\.org\/problems\/([^\/]+).*/, 'practice.geeksforgeeks.org/problems/$1');
  u = u.replace(/geeksforgeeks\.org\/problems\/([^\/]+).*/, 'geeksforgeeks.org/problems/$1');
  u = u.replace(/geeksforgeeks\.org\/([^\/]+).*/, 'geeksforgeeks.org/$1');
  return u;
}

// Helper to normalize titles for matching
function normalizeTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // remove special characters & spaces
    .trim();
}

// Create lookup sets/maps for Striver questions
const striverUrls = new Set(striverQuestions.map(q => normalizeUrl(q.url)));
const striverTitles = new Set(striverQuestions.map(q => normalizeTitle(q.title)));

// 2. Read the Excel file
const excelPath = path.resolve(__dirname, '450 Interview Questions - LeetCode edition.xlsx');
const workbook = XLSX.readFile(excelPath);

const allBabbarQuestions = [];

workbook.SheetNames.forEach(sheetName => {
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
  
  // Find where the headers end. For LeetCoded, it starts at row 7. For Original, row 6.
  const startRow = sheetName === 'LeetCoded' ? 7 : 6;
  
  rowNumbers.forEach(r => {
    if (r < startRow) return;
    const rData = rows[r];
    if (!rData || !rData.A || !rData.B) return;
    
    const topic = String(rData.A.v || '').trim();
    const problem = String(rData.B.v || '').trim();
    const url = rData.B.url || '';
    
    if (topic && problem && topic !== 'Topic:') {
      allBabbarQuestions.push({
        sheet: sheetName,
        row: r,
        topic,
        title: problem,
        url
      });
    }
  });
});

console.log(`Parsed ${allBabbarQuestions.length} total raw rows from Excel sheets`);

// Separate questions by sheet
const leetCodedSheet = allBabbarQuestions.filter(q => q.sheet === 'LeetCoded');
const originalSheet = allBabbarQuestions.filter(q => q.sheet === 'Original');

console.log(`LeetCoded sheet has ${leetCodedSheet.length} questions`);
console.log(`Original sheet has ${originalSheet.length} questions`);

// We want to compile unique questions from the excel.
// Since 'LeetCoded' has LeetCode links, and 'Original' has GFG/LeetCode links,
// let's see which one is more complete. Actually, they represent the same set of 450 problems.
// Let's match them to find duplicates, and find which questions are new.

function analyzeSheet(sheetQuestions, name) {
  let newQuestions = [];
  let duplicateByUrlCount = 0;
  let duplicateByTitleCount = 0;
  
  const seenExcelTitles = new Set();
  const seenExcelUrls = new Set();
  
  sheetQuestions.forEach(q => {
    const normUrl = normalizeUrl(q.url);
    const normTitle = normalizeTitle(q.title);
    
    // Check if duplicate within this excel sheet run
    if (seenExcelTitles.has(normTitle) || (normUrl && seenExcelUrls.has(normUrl))) {
      return; // skip duplicate in excel
    }
    if (normTitle) seenExcelTitles.add(normTitle);
    if (normUrl) seenExcelUrls.add(normUrl);
    
    // Check if duplicate of Striver question
    const isDupUrl = normUrl && striverUrls.has(normUrl);
    const isDupTitle = striverTitles.has(normTitle);
    
    if (isDupUrl) {
      duplicateByUrlCount++;
    } else if (isDupTitle) {
      duplicateByTitleCount++;
    } else {
      newQuestions.push(q);
    }
  });
  
  console.log(`\n--- Analysis for sheet: ${name} ---`);
  console.log(`Unique questions inside sheet: ${seenExcelTitles.size}`);
  console.log(`Duplicates with Striver by URL: ${duplicateByUrlCount}`);
  console.log(`Duplicates with Striver by Title: ${duplicateByTitleCount}`);
  console.log(`New questions to add: ${newQuestions.length}`);
  
  // Show some samples of new questions
  console.log(`Samples of new questions (first 10):`);
  newQuestions.slice(0, 10).forEach((q, idx) => {
    console.log(`  ${idx + 1}. [${q.topic}] ${q.title} -> ${q.url}`);
  });
}

analyzeSheet(leetCodedSheet, 'LeetCoded');
analyzeSheet(originalSheet, 'Original');

