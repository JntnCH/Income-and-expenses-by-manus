/**
 * Application Constants & Sheet Mappings
 */

const BOT_DASHBOARD_MAPPING = {
  sheetName: 'BotDashboard',
  range: 'BotDashboard!A1:Z50',
  cells: {
    dailyIncome: { row: 1, col: 1 },    // Row 2, Col B (0-indexed: [1][1])
    dailyExpense: { row: 2, col: 1 },   // Row 3, Col B (0-indexed: [2][1])
    monthlyIncome: { row: 3, col: 1 },  // Row 4, Col B (0-indexed: [3][1])
    monthlyExpense: { row: 4, col: 1 }, // Row 5, Col B (0-indexed: [4][1])
    balance: { row: 5, col: 1 },        // Row 6, Col B (0-indexed: [5][1])
  },
  accounts: {
    namesRow: 1,      // Row 2
    amountsRow: 2,    // Row 3
    startCol: 5       // Column F (0-indexed: 5)
  },
  todayItems: {
    startRow: 7,      // Row 8
    income: { nameCol: 1, amountCol: 2 },
    expense: { nameCol: 6, amountCol: 7 }
  }
};

const DEFAULT_SHEETS = {
  transactionSheet: 'รายรับ-รายจ่าย',
  dashboardSheet: 'BotDashboard',
  investmentSheet: 'การลงทุน',
  monthlySheet: 'Monthly-expense 2026',
  // Aliases for uppercase references
  TRANSACTIONS: 'รายรับ-รายจ่าย',
  DASHBOARD: 'BotDashboard',
  INVESTMENTS: 'การลงทุน',
  MONTHLY_EXPENSE: 'Monthly-expense 2026'
};

module.exports = {
  BOT_DASHBOARD_MAPPING,
  DEFAULT_SHEETS
};
