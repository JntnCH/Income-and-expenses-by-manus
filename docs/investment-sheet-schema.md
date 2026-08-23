# Investment sheet schema

Backend function `saveInvestmentRecord` writes one transaction per row to the sheet configured by `GOOGLE_INVESTMENT_SHEET_NAME`. If the variable is absent, the default sheet name is `การลงทุน`.

| Column | Field | Example |
|---|---|---|
| A | วันที่ | `19/8/2026` |
| B | รายการ | `ซื้อ` หรือ `ขาย` |
| C | ชื่อสินทรัพย์ | `ABC` |
| D | ประเภทสินทรัพย์ | `หุ้น` |
| E | จำนวน | `2` |
| F | ราคา/หน่วย | `500` |
| G | ยอดรวม | `1000` |
| H | บัญชี | `ธนาคาร` |
| I | ช่องทาง | `Telegram` |
| J | ผู้บันทึก | `@finance_bot_user` |
| K | หมายเหตุ | `DCA` |

Rows are rejected before any Google Sheets request when the action is not `ซื้อ`/`ขาย`, the asset name is empty, a numeric value is negative, or the total amount is zero.
