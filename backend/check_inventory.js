const xlsx = require('xlsx');
try {
    const workbook = xlsx.readFile('./inventory.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);
    console.log('Total items:', data.length);
    if (data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
        console.log('First item:', data[0]);
    }
} catch (e) {
    console.error('Error reading inventory:', e.message);
}
