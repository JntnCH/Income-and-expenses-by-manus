
const { queryExcelData } = require('./src/services/excelQueryService');

async function runTest() {
    try {
        const result = await queryExcelData('เดือนนี้ทำงานได้กี่วัน');
        console.log('Test Result:', result);
    } catch (error) {
        console.error('Test Error:', error);
    }
}

runTest();
