const test = require('node:test');
const assert = require('node:assert/strict');
const { getSubmittedToken, tokensMatch } = require('../src/middleware/adminAuth');

test('loads the Google Vision provider lazily without credentials at module initialization', () => {
  const visionProvider = require('../src/ocr/providers/cloud-vision');
  assert.equal(typeof visionProvider.recognize, 'function');
});

test('reads bearer and explicit admin tokens without exposing token state', () => {
  const bearerRequest = { get: (name) => name === 'authorization' ? 'Bearer expected-token' : '' };
  const headerRequest = { get: (name) => name === 'x-admin-token' ? 'expected-token' : '' };
  assert.equal(getSubmittedToken(bearerRequest), 'expected-token');
  assert.equal(getSubmittedToken(headerRequest), 'expected-token');
  assert.equal(tokensMatch('expected-token', 'expected-token'), true);
  assert.equal(tokensMatch('expected-token', 'wrong-token'), false);
  assert.equal(tokensMatch('', 'expected-token'), false);
});
