# Google Sheets end-to-end test

Run this test only against a **dedicated test spreadsheet**. It intentionally appends two traceable records worth `0.01` to verify that the production code can authenticate and write both supported schemas.

| Sheet name | Required columns | Test action |
|---|---|---|
| `รายรับ-รายจ่าย` or `GOOGLE_SHEET_NAME` | A:H: date, type, item, amount, category, account, platform, recorder | Appends a `รายรับ` row whose item starts with `E2E_TEST_` |
| `การลงทุน` or `GOOGLE_INVESTMENT_SHEET_NAME` | A:K: date, action, asset name, asset type, quantity, price, total, account, platform, recorder, note | Appends a `ซื้อ` row whose asset name starts with `E2E_TEST_` |

Copy `.env.example` to `.env` locally, or set the same values through your platform's secret manager. Share the dedicated test spreadsheet with the service account email as **Editor**. Do not commit `.env`, a private key, or service-account JSON.

Set `GOOGLE_E2E_ALLOW_WRITE=true` only for the test run, then execute:

```bash
npm run test:e2e
```

The test is skipped by default. A successful result confirms authentication and append permission; the two marker rows remain in the dedicated test sheet as an audit trail. Do not use a live accounting spreadsheet for this command.
