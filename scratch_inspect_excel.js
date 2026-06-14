const XLSX = require('xlsx');
const path = require('path');

try {
  const filePath = path.resolve(__dirname, '450 Interview Questions - LeetCode edition.xlsx');
  const workbook = XLSX.readFile(filePath);
  
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    console.log(`\n================== Sheet: ${sheetName} ==================`);
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    for (let i = 0; i < Math.min(50, data.length); i++) {
      console.log(`Row ${i}:`, JSON.stringify(data[i]));
    }
  });
} catch (err) {
  console.error(err);
}
