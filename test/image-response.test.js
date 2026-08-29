const assert = require('node:assert/strict');
const { renderBalanceChart } = require('../src/services/balanceChart');
const { buildDialogflowResponse } = require('../src/utils/responseBuilder');
const { getPublicObjectUrl } = require('../src/services/cloudStorage');

async function main() {
  const summary = {
    formattedDate: '27/8/2026',
    dailyIncome: 100,
    dailyExpense: 50,
    monthlyIncome: 17087,
    monthlyExpense: 16480,
    balance: 208.49
  };

  const rendered = await renderBalanceChart(summary);
  assert.equal(rendered.contentType, 'image/jpeg');
  assert.equal(rendered.width, 240);
  assert.equal(rendered.height, 240);
  assert.ok(rendered.buffer.length > 1000, 'rendered image should contain JPEG data');
  assert.equal(rendered.buffer.subarray(0, 2).toString('hex'), 'ffd8', 'buffer should be JPEG');

  const response = buildDialogflowResponse('สรุปยอด', 'https://storage.googleapis.com/income-expense-images/balance/test.jpg');
  assert.equal(response.fulfillmentMessages.length, 2);
  assert.equal(response.fulfillmentMessages[1].image.imageUri.includes('storage.googleapis.com/'), true);

  assert.equal(
    getPublicObjectUrl('income-expense-images', 'balance/test image.jpg'),
    'https://storage.googleapis.com/income-expense-images/balance/test%20image.jpg'
  );

  console.log('image-response smoke test passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
