const fs = require('fs');
const path = require('path');

// 1. Read input files
const htmlPath = path.resolve(__dirname, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const newQuestionsPath = path.resolve(__dirname, 'new_babbar_questions.json');
const newQuestions = JSON.parse(fs.readFileSync(newQuestionsPath, 'utf8'));

// Topic and Title override maps
const topicToStep = {
  'Array': 's3',
  'Matrix': 's3',
  'String': 's5',
  'Searching & Sorting': 's4',
  'LinkedList': 's6',
  'Binary Trees': 's13',
  'Binary Search Trees': 's14',
  'Greedy': 's12',
  'BackTracking': 's7',
  'Stacks & Queues': 's9',
  'Heap': 's11',
  'Graph': 's15',
  'Trie': 's17',
  'Dynamic Programming': 's16',
  'Bit Manipulation': 's8'
};

const titleOverrides = {
  'bonus: minimum speed to arrive on time': 's4',
  'bonus: number of nodes that are k distance apart': 's13',
  'bonus: unique bsts': 's14',
  'bonus: perfect squares': 's16'
};

function classifyDifficulty(title, topic) {
  const t = title.toLowerCase();
  if (
    t.includes('word wrap') || t.includes('edit distance') || t.includes('wildcard') ||
    t.includes('sudoku') || t.includes('n-queen') || t.includes('articulation') ||
    t.includes('strongly connected') || t.includes('bridge') || t.includes('travelling salesman') ||
    t.includes('matrix chain') || t.includes('burst balloon') || t.includes('boolean parenthesization') ||
    t.includes('palindrome partitioning ii') || t.includes('water jug') || t.includes('alien dictionary') ||
    t.includes('isomorphism') || t.includes('longest happy prefix') || t.includes('shortest palindrome') ||
    t.includes('boyer moore') || t.includes('largest independent set') || t.includes('longest common supersequence') ||
    t.includes('making a large island') || t.includes('k centers')
  ) {
    return 'hard';
  }
  if (
    t.includes('reverse') || t.includes('max and min') || t.includes('maximum and minimum') ||
    t.includes('union and intersection') || t.includes('power of two') || t.includes('count set bits') ||
    t.includes('isomorphic') || t.includes('middle of') || t.includes('value equal to index') ||
    t.includes('climbing stairs') || t.includes('frog jump') || t.includes('valid palindrome') ||
    t.includes('fibonacci') || t.includes('anagram') || t.includes('remove duplicates') ||
    t.includes('detect loop') || t.includes('delete loop') || t.includes('starting point of the loop')
  ) {
    return 'easy';
  }
  return 'medium';
}

// Group new questions by step ID
const newQuestionsByStep = {};
for (let sNum = 1; sNum <= 18; sNum++) {
  newQuestionsByStep[`s${sNum}`] = [];
}

newQuestions.forEach(q => {
  const normTitle = q.title.toLowerCase().trim();
  let stepId = titleOverrides[normTitle];
  if (!stepId) {
    stepId = topicToStep[q.topic];
  }
  if (!stepId) {
    console.warn(`Warning: Question "${q.title}" with topic "${q.topic}" has no mapped step. Defaulting to s3.`);
    stepId = 's3';
  }
  newQuestionsByStep[stepId].push(q);
});

console.log('Grouped new questions by step:');
Object.keys(newQuestionsByStep).forEach(stepId => {
  console.log(`  ${stepId}: ${newQuestionsByStep[stepId].length} new questions`);
});

// Parse the HTML step sections
// We find each section starting at <div class="section" id="sX"> and ending at the closing </div>
const sectionsData = {};
let globalCount = 1;
const stepCounts = {};

for (let sNum = 1; sNum <= 18; sNum++) {
  const stepId = `s${sNum}`;
  
  // Find section content: <div class="section" id="sX"> ... </div> (matched non-greedily, taking nested divs into account)
  // Let's use a regex to match the section block
  const secRegex = new RegExp(`(<div class="section" id="${stepId}">[\\s\\S]*?)(<div class="section"|$|<\\/main>)`);
  const secMatch = html.match(secRegex);
  
  if (!secMatch) {
    console.error(`Error: Could not find section ${stepId} in HTML`);
    continue;
  }
  
  const fullSectionHtml = secMatch[1];
  
  // Parse rows inside the section
  const rowRegex = /<tr class="prob-row"[^>]*>([\s\S]*?)<\/tr>/g;
  const existingQuestions = [];
  let rMatch;
  while ((rMatch = rowRegex.exec(fullSectionHtml)) !== null) {
    const rowHtml = rMatch[0];
    const linkMatch = rowHtml.match(/<td class="pname"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const subMatch = rowHtml.match(/<div class="sub">([\s\S]*?)<\/div>/);
    const diffMatch = rowHtml.match(/<span class="badge [^"]+">([\s\S]*?)<\/span>/);
    const platMatch = rowHtml.match(/<span class="plat [^"]+">([\s\S]*?)<\/span>/);
    
    if (linkMatch) {
      existingQuestions.push({
        title: linkMatch[2].replace(/<[^>]*>/g, '').trim(),
        url: linkMatch[1].trim(),
        subtitle: subMatch ? subMatch[1].replace(/<[^>]*>/g, '').trim() : '',
        difficulty: diffMatch ? diffMatch[1].toLowerCase().trim() : 'easy',
        platform: platMatch ? platMatch[1].toUpperCase().trim() : 'LC',
        isStriver: true
      });
    }
  }
  
  // Combine existing Striver questions with new Love Babbar questions
  const combined = [...existingQuestions];
  
  newQuestionsByStep[stepId].forEach(q => {
    const diff = classifyDifficulty(q.title, q.topic);
    
    // Choose primary link
    let url = q.lcUrl || q.gfgUrl;
    let platform = q.lcUrl ? 'LC' : 'GFG';
    let subtitle = 'Love Babbar DSA Sheet.';
    
    // Add secondary link in subtitle if both exist
    if (q.lcUrl && q.gfgUrl) {
      subtitle += ` <a href="${q.gfgUrl}" target="_blank" style="color: var(--accent); font-size: 10px; margin-left: 6px; text-decoration: none; border-bottom: 1px dashed var(--accent);">[GFG Link]</a>`;
    }
    
    combined.push({
      title: q.title,
      url: url,
      subtitle: subtitle,
      difficulty: diff,
      platform: platform,
      isStriver: false
    });
  });
  
  stepCounts[stepId] = combined.length;
  
  // Re-generate HTML table body for this section
  let newRowsHtml = '';
  combined.forEach(q => {
    const num = globalCount++;
    const badgeClass = q.difficulty;
    const badgeText = q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1);
    const platClass = q.platform.toLowerCase();
    
    // Distinguish Love Babbar questions using a slight subtitle or indicator
    const rowClass = q.isStriver ? 'prob-row' : 'prob-row lb-row';
    const subHtml = q.subtitle ? `<div class="sub">${q.subtitle}</div>` : '';
    
    newRowsHtml += `<tr class="${rowClass}" data-d="${q.difficulty}"><td class="pnum">${num}</td><td class="pname"><a href="${q.url}" target="_blank">${q.title}</a>${subHtml}</td><td><span class="badge ${badgeClass}">${badgeText}</span></td><td><span class="plat ${platClass}">${q.platform}</span></td><td><input type="checkbox" class="done-cb" onchange="upd()"></td></tr>\n`;
  });
  
  // Replace the entire table body in the section HTML
  // Locate <tbody> ... </tbody>
  const tableBodyRegex = /(<tbody>)([\s\S]*?)(<\/tbody>)/;
  let updatedSectionHtml = fullSectionHtml.replace(tableBodyRegex, `$1\n${newRowsHtml}$3`);
  
  // Update section cnt: <span class="sec-cnt">... problems</span>
  const cntRegex = /(<span class="sec-cnt">)([^<]+)(problems<\/span>)/;
  updatedSectionHtml = updatedSectionHtml.replace(cntRegex, `$1${combined.length} $3`);
  
  // Replace the original section block in the main html
  html = html.replace(fullSectionHtml, updatedSectionHtml);
}

const finalTotal = globalCount - 1;
console.log(`\nAll sections merged! Total combined questions: ${finalTotal}`);

// 3. Update Sidebar Navigation Item Counts
Object.keys(stepCounts).forEach(stepId => {
  const count = stepCounts[stepId];
  // Match navigation item like: onclick="go('s3')">📦 Arrays <span class="n">40</span></a>
  const navRegex = new RegExp(`(onclick="go\\('${stepId}'\\)"[^>]*>[^<]*<span class="n">)(\\d+)(<\\/span>)`);
  html = html.replace(navRegex, `$1${count}$3`);
});

// 4. Update Header Page Title total counts
// Page header subtext: Official 18 Steps · 475 Problems · C++
const headerTotalRegex = /(Official 18 Steps · )(\d+)( Problems)/;
html = html.replace(headerTotalRegex, `$1${finalTotal}$3`);

// Stats row total: <div class="stat t"><div class="v" id="sTot">475</div>
const statsTotalRegex = /(<div class="stat t"><div class="v" id="sTot">)(\d+)(<\/div>)/;
html = html.replace(statsTotalRegex, `$1${finalTotal}$3`);

// Write the updated index.html back
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(`Successfully wrote changes back to index.html`);
