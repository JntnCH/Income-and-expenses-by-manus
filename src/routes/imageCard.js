const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const {
  createTransactionSvg,
  createBalanceSummarySvg,
  createEditConfirmationSvg,
  createInvestmentSvg,
  renderSvgToPng
} = require('../services/imageCardGenerator');

// In-memory cache for generated card data (expires after 2 hours)
const cardCache = new Map();

function cleanOldCache() {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, item] of cardCache.entries()) {
    if (item.timestamp < twoHoursAgo) {
      cardCache.delete(id);
    }
  }
}

/**
 * Save card payload in cache and return a unique card URL
 */
function cacheCardPayload(type, data, req) {
  cleanOldCache();
  const protocol = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http';
  const host = req?.get?.('host') || 'localhost:3000';
  const baseUrl = `${protocol}://${host}/api/card/render`;
  
  const params = new URLSearchParams();
  params.append('type', type);
  
  if (type === 'balance') {
    params.append('balance', data.balance || 0);
    params.append('dailyIncome', data.dailyIncome || 0);
    params.append('dailyExpense', data.dailyExpense || 0);
    params.append('monthlyIncome', data.monthlyIncome || 0);
    params.append('monthlyExpense', data.monthlyExpense || 0);
    if (data.formattedDate) params.append('date', data.formattedDate);
    if (data.summarySheet) params.append('summarySheet', data.summarySheet);
    if (data.accountBalances) params.append('accounts', JSON.stringify(data.accountBalances));
    if (data.todayItems) params.append('todayItems', JSON.stringify(data.todayItems));
  } else if (type === 'edit') {
    const oldTx = data.oldTransaction || data.old || {};
    const newTx = data.newTransaction || data.new || {};
    params.append('oldItem', oldTx.item || data.oldItem || '');
    params.append('oldAmount', oldTx.amount !== undefined ? oldTx.amount : (data.oldAmount || 0));
    params.append('oldCategory', oldTx.category || data.oldCategory || '');
    params.append('oldAccount', oldTx.account || data.oldAccount || '');
    params.append('newItem', newTx.item || data.newItem || '');
    params.append('newAmount', newTx.amount !== undefined ? newTx.amount : (data.newAmount || 0));
    params.append('newCategory', newTx.category || data.newCategory || '');
    params.append('newAccount', newTx.account || data.newAccount || '');
    if (data.date || newTx.date) params.append('date', data.date || newTx.date);
  } else if (type === 'investment') {
    params.append('action', data.action || '');
    params.append('assetName', data.assetName || '');
    params.append('assetType', data.assetType || '');
    params.append('quantity', data.quantity || 0);
    params.append('pricePerUnit', data.pricePerUnit || 0);
    params.append('totalAmount', data.totalAmount || 0);
  } else {
    params.append('transType', data.type || '');
    params.append('item', data.item || '');
    params.append('amount', data.amount || 0);
    params.append('category', data.category || '');
    params.append('account', data.account || '');
    params.append('recorder', data.recorder || '');
    params.append('platform', data.platform || '');
    if (data.date) params.append('date', data.date);
  }
  
  return `${baseUrl}?${params.toString()}`;
}

/**
 * GET /api/card/view/:id.png
 * Render cached card by ID as PNG
 */
router.get('/view/:id.png', async (req, res) => {
  try {
    const cardId = req.params.id.replace('.png', '');
    const item = cardCache.get(cardId);

    if (!item) {
      return res.status(404).send('Card not found or expired');
    }

    let svg = '';
    if (item.type === 'balance') {
      svg = createBalanceSummarySvg(item.data);
    } else if (item.type === 'edit') {
      svg = createEditConfirmationSvg(item.data);
    } else if (item.type === 'investment') {
      svg = createInvestmentSvg(item.data);
    } else {
      svg = createTransactionSvg(item.data);
    }

    const pngBuffer = await renderSvgToPng(svg);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(pngBuffer);
  } catch (err) {
    console.error('[CARD VIEW ERROR]', err.message);
    res.status(500).send('Error generating card image');
  }
});

/**
 * GET /api/card/render
 * Dynamic PNG rendering via query parameters
 */
router.get('/render', async (req, res) => {
  try {
    const {
      type = 'transaction',
      transType = 'รายจ่าย',
      item = 'รายการ',
      amount = '0',
      category = 'ทั่วไป',
      account = 'เงินสด',
      recorder = 'User',
      platform = 'Dialogflow',
      date,
      balance = '0',
      dailyIncome = '0',
      dailyExpense = '0',
      monthlyIncome = '0',
      monthlyExpense = '0',
      action = 'ซื้อ',
      assetName = 'สินทรัพย์',
      assetType = 'คริปโต',
      quantity = '0',
      pricePerUnit = '0',
      totalAmount = '0',
      oldItem,
      oldAmount = '0',
      oldCategory,
      oldAccount,
      newItem,
      newAmount = '0',
      newCategory,
      newAccount
    } = req.query;

    let svg = '';
    if (type === 'balance') {
      let accountBalances = [];
      if (req.query.accounts) {
        try {
          accountBalances = JSON.parse(req.query.accounts);
        } catch (e) {
          accountBalances = [];
        }
      }
      let todayItems = [];
      if (req.query.todayItems) {
        try {
          todayItems = JSON.parse(req.query.todayItems);
        } catch (e) {
          todayItems = [];
        }
      }
      svg = createBalanceSummarySvg({
        balance: parseFloat(balance),
        dailyIncome: parseFloat(dailyIncome),
        dailyExpense: parseFloat(dailyExpense),
        monthlyIncome: parseFloat(monthlyIncome),
        monthlyExpense: parseFloat(monthlyExpense),
        accountBalances,
        todayItems,
        formattedDate: date || new Date().toLocaleDateString('th-TH'),
        summarySheet: req.query.summarySheet || 'BotDashboard'
      });
    } else if (type === 'edit') {
      svg = createEditConfirmationSvg({
        oldItem: oldItem || item,
        oldAmount: parseFloat(oldAmount || amount),
        oldCategory: oldCategory || category,
        oldAccount: oldAccount || account,
        newItem: newItem || oldItem || item,
        newAmount: parseFloat(newAmount || amount),
        newCategory: newCategory || oldCategory || category,
        newAccount: newAccount || oldAccount || account,
        date: date || new Date().toLocaleDateString('th-TH')
      });
    } else if (type === 'investment') {
      svg = createInvestmentSvg({
        action,
        assetName,
        assetType,
        quantity: parseFloat(quantity),
        pricePerUnit: parseFloat(pricePerUnit),
        totalAmount: parseFloat(totalAmount)
      });
    } else {
      svg = createTransactionSvg({
        type: transType,
        item,
        amount: parseFloat(amount),
        category,
        account,
        recorder,
        platform,
        date
      });
    }

    const pngBuffer = await renderSvgToPng(svg);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    return res.send(pngBuffer);
  } catch (err) {
    console.error('[CARD RENDER ERROR]', err.message);
    res.status(500).send('Error rendering image card: ' + err.message);
  }
});

/**
 * POST /api/card/generate
 * Generate base64 or direct URL for an image card
 */
router.post('/generate', async (req, res) => {
  try {
    const { type = 'transaction', data = {} } = req.body;
    let svg = '';
    if (type === 'balance') {
      svg = createBalanceSummarySvg(data);
    } else if (type === 'edit') {
      svg = createEditConfirmationSvg(data);
    } else if (type === 'investment') {
      svg = createInvestmentSvg(data);
    } else {
      svg = createTransactionSvg(data);
    }

    const pngBuffer = await renderSvgToPng(svg);
    const imageUrl = cacheCardPayload(type, data, req);

    res.json({
      success: true,
      imageUrl,
      base64: `data:image/png;base64,${pngBuffer.toString('base64')}`
    });
  } catch (err) {
    console.error('[CARD GENERATE ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = {
  router,
  cacheCardPayload
};
