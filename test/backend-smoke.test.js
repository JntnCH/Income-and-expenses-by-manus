const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parsePrivateKey,
  parseServiceAccountJson,
  validateCredentials,
} = require('../src/utils/credentialsParser');
const { extractUser, formatUserLabel } = require('../src/utils/userExtractor');
const {
  buildDialogflowResponse,
  buildIncomeConfirmation,
  buildBuyInvestmentConfirmation,
  formatAmount,
} = require('../src/utils/responseBuilder');

const TEST_KEY = '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----';

test('normalizes an escaped service-account private key', () => {
  const result = parsePrivateKey(`"${TEST_KEY}"`);
  assert.match(result, /BEGIN PRIVATE KEY-----\nabc/);
  assert.equal(validateCredentials({ client_email: 'bot@example.test', private_key: result }), true);
});

test('rejects invalid private-key and service-account inputs', () => {
  assert.throws(() => parsePrivateKey('not-a-private-key'), /BEGIN marker/);
  assert.throws(() => parseServiceAccountJson('{invalid json}'), /Failed to parse/);
  assert.throws(() => validateCredentials({ client_email: 'bot@example.test', private_key: 'bad' }), /Invalid private key/);
});

test('parses a JSON service account and normalizes its private key', () => {
  const parsed = parseServiceAccountJson(JSON.stringify({
    client_email: 'bot@example.test',
    private_key: TEST_KEY,
  }));
  assert.equal(parsed.client_email, 'bot@example.test');
  assert.match(parsed.private_key, /\nabc\n/);
});

test('extracts a Telegram user and returns a safe recorder label', () => {
  const user = extractUser({
    originalDetectIntentRequest: {
      source: 'telegram',
      payload: { data: { from: { id: 100, username: 'finance_bot_user' } } },
    },
  });
  assert.equal(user.userId, '100');
  assert.equal(user.displayName, '@finance_bot_user');
  assert.equal(formatUserLabel(user), '@finance_bot_user');
});

test('falls back to the Dialogflow session identity when channel metadata is unavailable', () => {
  const user = extractUser({ session: 'projects/test/agent/sessions/session-123456' });
  assert.equal(user.userId, 'session-123456');
  assert.equal(user.platform, 'Unknown');
});

test('builds Dialogflow and finance confirmation payloads consistently', () => {
  assert.deepEqual(buildDialogflowResponse('สำเร็จ'), {
    fulfillmentMessages: [{ text: { text: ['สำเร็จ'] } }],
  });
  assert.match(buildIncomeConfirmation('ค่าแรง', 1000, 'งาน', 'ธนาคาร'), /1,000\.00/);
  assert.match(buildBuyInvestmentConfirmation('ABC', 'หุ้น', 2, 500, 1000), /ซื้อหุ้น/);
  assert.equal(formatAmount(1200), '1,200.00');
});
