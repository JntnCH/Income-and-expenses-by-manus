const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function loadAppsScript({ geminiKey = null, promptButton = 'CANCEL' } = {}) {
  const menus = [];
  const alerts = [];
  const fetchCalls = [];
  const ui = {
    Button: { OK: 'OK', CANCEL: 'CANCEL' },
    ButtonSet: { OK_CANCEL: 'OK_CANCEL', OK: 'OK' },
    createMenu(name) {
      return {
        name,
        items: [],
        addItem(label, callback) { this.items.push({ label, callback }); return this; },
        addToUi() { menus.push({ name: this.name, items: this.items }); },
      };
    },
    prompt: () => ({ getSelectedButton: () => promptButton, getResponseText: () => 'สรุปรายรับ' }),
    alert: (...args) => alerts.push(args),
  };
  const context = {
    console,
    JSON,
    Date,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (name) => ({
      GEMINI_API_KEY: geminiKey, MAIN_SS_ID: 'main-sheet-id', MONTHLY_SS_ID: null, DEBT_SS_ID: null,
    })[name] || null }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getId: () => 'fallback-sheet-id' }),
      openById: (id) => ({
        getName: () => `Spreadsheet:${id}`,
        getSheets: () => [{
          getName: () => 'รายรับ-รายจ่าย', getLastRow: () => 2, getLastColumn: () => 2,
          getRange: () => ({ getValues: () => [['วันที่', 'รายการ'], ['2026-08-19', 'ค่าแรง']] }),
        }],
      }),
      getUi: () => ui,
    },
    UrlFetchApp: { fetch: (url, options) => {
      fetchCalls.push({ url, options });
      return { getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: 'คำตอบจาก Gemini' }] } }] }) };
    } },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../google-apps-script/code.js'), 'utf8'), context);
  return { context, menus, alerts, fetchCalls };
}

test('askAI reports missing Gemini key without external requests', () => {
  const { context, fetchCalls } = loadAppsScript();
  assert.match(context.askAI('เดือนนี้จ่ายเท่าไร'), /GEMINI_API_KEY/);
  assert.equal(fetchCalls.length, 0);
});

test('collects sheet context and returns a successful Gemini response', () => {
  const { context, fetchCalls } = loadAppsScript({ geminiKey: 'test-key' });
  assert.match(context.getAllSheetsContext(), /ค่าแรง/);
  assert.equal(context.callGeminiAPI('ทดสอบ'), 'คำตอบจาก Gemini');
  assert.match(fetchCalls[0].url, /gemini-1\.5-flash/);
});

test('creates the spreadsheet menu and safely handles prompt cancellation', () => {
  const { context, menus, alerts } = loadAppsScript();
  context.onOpen();
  context.showPrompt();
  context.showSetupGuide();
  assert.equal(menus[0].items.length, 2);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0][1], /MAIN_SS_ID/);
});
