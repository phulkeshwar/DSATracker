const XLSX = require('xlsx');
const path = require('path');

try {
  const filePath = path.resolve(__dirname, '450 Interview Questions - LeetCode edition.xlsx');
  const workbook = XLSX.readFile(filePath);
  
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    console.log(`\n================== Sheet: ${sheetName} ==================`);
    
    // Find all cell keys
    const keys = Object.keys(sheet).filter(k => k[0] !== '!');
    
    // Group cells by row
    const rows = {};
    keys.forEach(k => {
      const col = k.match(/[A-Z]+/)[0];
      const row = parseInt(k.match(/\d+/)[0], 10);
      if (!rows[row]) rows[row] = {};
      
      const cell = sheet[k];
      let val = cell.v;
      let url = null;
      
      // Look for hyperlink in cell.l
      if (cell.l && cell.l.Target) {
        url = cell.l.Target;
      }
      
      // Look for hyperlink in formula (e.g. =HYPERLINK("url", "text"))
      if (cell.f && cell.f.includes('HYPERLINK')) {
        const match = cell.f.match(/HYPERLINK\("([^"]+)"/i);
        if (match) {
          url = match[1];
        }
      }
      
      rows[row][col] = { v: val, url: url, f: cell.f };
    });
    
    // Print first 15 rows that have data
    const rowNumbers = Object.keys(rows).map(Number).sort((a,b) => a-b);
    let count = 0;
    for (let r of rowNumbers) {
      const rowData = rows[r];
      // Skip empty rows
      if (Object.keys(rowData).length === 0) continue;
      
      console.log(`Row ${r}:`, JSON.stringify(rowData, null, 2));
      count++;
      if (count > 20) break;
    }
  });
} catch (err) {
  console.error('Error:', err);
}
