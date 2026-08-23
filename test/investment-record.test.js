const test = require('node:test');
const assert = require('node:assert/strict');

const { buildInvestmentRow } = require('../src/services/googleSheets');

test('builds an investment row in the declared sheet schema order', () => {
  const row = buildInvestmentRow({
    action: 'ซื้อ',
    assetName: 'ABC',
    assetType: 'หุ้น',
    quantity: '2',
    pricePerUnit: '500',
    totalAmount: '1000',
    account: 'ธนาคาร',
    platform: 'Telegram',
    recorder: '@finance_bot_user',
    note: 'DCA',
  }, '19/8/2026');

  assert.deepEqual(row, [
    '19/8/2026', 'ซื้อ', 'ABC', 'หุ้น', 2, 500, 1000,
    'ธนาคาร', 'Telegram', '@finance_bot_user', 'DCA',
  ]);
});

test('rejects incomplete or invalid investment records before contacting Google Sheets', () => {
  assert.throws(() => buildInvestmentRow({ action: 'ซื้อ', assetName: '', totalAmount: 100 }), /ชื่อสินทรัพย์/);
  assert.throws(() => buildInvestmentRow({ action: 'อื่นๆ', assetName: 'ABC', totalAmount: 100 }), /action/);
  assert.throws(() => buildInvestmentRow({ action: 'ขาย', assetName: 'ABC', totalAmount: 0 }), /มากกว่า 0/);
  assert.throws(() => buildInvestmentRow({ action: 'ขาย', assetName: 'ABC', quantity: -1, totalAmount: 100 }), /quantity/);
});
