# Security configuration

Set the following values as deployment secrets, not through the public admin page or the client application.

| Variable | Purpose | Required in production |
|---|---|---|
| `ADMIN_API_TOKEN` | Protects `/api/admin/*` and `/api/debug-auth-data`; send as `Authorization: Bearer <token>` | Yes, if admin/debug APIs are enabled |
| `CORS_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call the API, such as `https://instalpay-crbqedi3.manus.space` | Yes, for browser callers |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google service-account JSON used by Sheets and Cloud Vision | Yes, for Google integrations |
| `GOOGLE_SPREADSHEET_ID` | Target finance spreadsheet | Yes, for Sheets writes/reads |
| `GOOGLE_INVESTMENT_SHEET_NAME` | Investment sheet name; defaults to `การลงทุน` | Recommended |

The admin page is only a token-entry interface. It can change the active OCR provider for one running instance, but it cannot view or write secrets. Configure secrets through the deployment platform and redeploy when they change.
