const test = require('node:test');
const assert = require('node:assert/strict');
const { saveRecord, saveInvestmentRecord } = require('../src/services/googleSheets');

const canWriteToDedicatedTestSheet =
  process.env.GOOGLE_E2E_ALLOW_WRITE === 'true' &&
  Boolean(process.env.GOOGLE_SPREADSHEET_ID) &&
  Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || (
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
  ));

test('writes income/expense and investment rows to the dedicated Google Sheets test spreadsheet', {
  skip: canWriteToDedicatedTestSheet
    ? false
    : 'Set Google credentials, GOOGLE_SPREADSHEET_ID, and GOOGLE_E2E_ALLOW_WRITE=true for a dedicated test spreadsheet.',
}, async () => {
  const runId = `${process.env.GOOGLE_E2E_TEST_PREFIX || 'E2E_TEST'}_${Date.now()}`;

  const financeResult = await saveRecord({
    item: `${runId}_FINANCE`,
    type: 'รายรับ',
    amount: 0.01,
    category: 'E2E Test',
    account: 'TEST_ONLY',
    platform: 'Automated test',
    recorder: 'Google Sheets E2E',
  });
  assert.equal(financeResult.success, true);
  assert.equal(financeResult.row[2], `${runId}_FINANCE`);

  const investmentResult = await saveInvestmentRecord({
    action: 'ซื้อ',
    assetName: `${runId}_INVESTMENT`,
    assetType: 'E2E Test',
    quantity: 1,
    pricePerUnit: 0.01,
    totalAmount: 0.01,
    account: 'TEST_ONLY',
    platform: 'Automated test',
    recorder: 'Google Sheets E2E',
    note: 'Automated E2E validation record',
  });
  assert.equal(investmentResult.success, true);
  assert.equal(investmentResult.row[2], `${runId}_INVESTMENT`);
});
