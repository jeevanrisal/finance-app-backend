import express from 'express';
import auth from '../middleware/auth.js';
import Transaction from '../models/transaction.js';
import Account from '../models/account.js';

const router = express.Router();

// GET /api/dashboard/summary?year=&month=
router.get('/summary', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = parseInt(req.query.month) || now.getMonth() + 1;

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    // Net worth from accounts
    const accounts = await Account.find({ userId });
    const netWorth = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

    // Transactions in period
    const txns = await Transaction.find({
      userId,
      date: { $gte: start, $lt: end },
    }).populate('fromAccountId', 'name');

    let income = 0;
    let expense = 0;
    const byCategory = {};
    const incomeSources = {};
    const byAccount = {};

    txns.forEach((t) => {
      if (t.type === 'Income') {
        income += t.amount;
        incomeSources[t.category] = (incomeSources[t.category] || 0) + t.amount;
      } else if (t.type === 'Expense') {
        expense += t.amount;
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;

        const accName = t.fromAccountId?.name || 'Unknown';
        byAccount[accName] = (byAccount[accName] || 0) + t.amount;
      }
    });

    const cashFlow = income - expense;
    const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;

    res.json({
      netWorth,
      income,
      expense,
      cashFlow,
      savingsRate,
      byCategory,
      incomeSources,
      byAccount,
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/dashboard/trends?timeframe=weekly|monthly|yearly
router.get('/trends', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const timeframe = req.query.timeframe || 'monthly';
    const buckets = [];
    const now = new Date();

    if (timeframe === 'weekly') {
      for (let i = 6; i >= 0; i--) {
        const day = new Date();
        day.setDate(now.getDate() - i);
        const start = new Date(day);
        start.setHours(0, 0, 0, 0);
        const end = new Date(day);
        end.setHours(23, 59, 59, 999);

        const dayTxns = await Transaction.find({
          userId,
          date: { $gte: start, $lte: end },
        });
        const dayIncome = dayTxns
          .filter((t) => t.type === 'Income')
          .reduce((s, t) => s + t.amount, 0);
        const dayExpense = dayTxns
          .filter((t) => t.type === 'Expense')
          .reduce((s, t) => s + t.amount, 0);

        buckets.push({
          label: day.toLocaleDateString('en-US', { weekday: 'short' }),
          income: dayIncome,
          expenses: dayExpense,
        });
      }
    } else if (timeframe === 'monthly') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = new Date(d);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);

        const mTxns = await Transaction.find({
          userId,
          date: { $gte: start, $lt: end },
        });
        const mIncome = mTxns
          .filter((t) => t.type === 'Income')
          .reduce((s, t) => s + t.amount, 0);
        const mExpense = mTxns
          .filter((t) => t.type === 'Expense')
          .reduce((s, t) => s + t.amount, 0);

        buckets.push({
          label: d.toLocaleDateString('en-US', { month: 'short' }),
          income: mIncome,
          expenses: mExpense,
        });
      }
    } else if (timeframe === 'yearly') {
      for (let y = now.getFullYear() - 5; y <= now.getFullYear(); y++) {
        const start = new Date(y, 0, 1);
        const end = new Date(y + 1, 0, 1);
        const yTxns = await Transaction.find({
          userId,
          date: { $gte: start, $lt: end },
        });
        const yIncome = yTxns
          .filter((t) => t.type === 'Income')
          .reduce((s, t) => s + t.amount, 0);
        const yExpense = yTxns
          .filter((t) => t.type === 'Expense')
          .reduce((s, t) => s + t.amount, 0);
        buckets.push({ label: `${y}`, income: yIncome, expenses: yExpense });
      }
    }

    res.json({ trends: buckets });
  } catch (err) {
    console.error('Dashboard trends error:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/dashboard/weekdays?year=&month=
router.get('/weekdays', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = parseInt(req.query.month) || now.getMonth() + 1;

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const txns = await Transaction.find({
      userId,
      type: 'Expense',
      date: { $gte: start, $lt: end },
    });

    const weekdayTotals = Array(7).fill(0); // Sunday = 0

    txns.forEach((t) => {
      const day = new Date(t.date).getDay();
      weekdayTotals[day] += t.amount;
    });

    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result = labels.map((day, i) => ({ day, value: weekdayTotals[i] }));

    res.json({ byWeekday: result });
  } catch (err) {
    console.error('Weekday spending error:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/dashboard/recent?limit=10
router.get('/recent', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    const transactions = await Transaction.find({ userId })
      .sort({ date: -1 })
      .limit(limit);
    res.json({ transactions });
  } catch (err) {
    console.error('Dashboard recent error:', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
