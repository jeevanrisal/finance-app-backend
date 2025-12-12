// // routes/summaryRoute.js
// import express from 'express';
// import auth from '../middleware/auth.js';
// import Transaction from '../models/transaction.js';

// const router = express.Router();

// router.get('/', auth, async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const now = new Date();

//     const year = parseInt(req.query.year) || now.getFullYear();
//     const month = parseInt(req.query.month) || now.getMonth() + 1; // 0-indexed

//     let startDate, endDate;

//     if (req.query.month) {
//       const month = parseInt(req.query.month);
//       startDate = new Date(year, month - 1, 1);
//       endDate = new Date(year, month, 1);
//     } else {
//       // Whole year
//       startDate = new Date(year, 0, 1); // Jan 1st
//       endDate = new Date(year + 1, 0, 1); // Jan 1st of next year
//     }

//     const transactions = await Transaction.find({
//       userId,
//       date: { $gte: startDate, $lt: endDate },
//     });

//     let income = 0;
//     let expense = 0;
//     const byCategory = {};

//     transactions.forEach((txn) => {
//       if (txn.type === 'Income') {
//         income += txn.amount;
//       } else if (txn.type === 'Expense') {
//         expense += txn.amount;
//         const category = txn.category || 'Uncategorized';
//         byCategory[category] = (byCategory[category] || 0) + txn.amount;
//       }
//     });

//     res.json({
//       income,
//       expense,
//       savings: income - expense,
//       byCategory,
//     });
//   } catch (err) {
//     console.error('Summary error:', err);
//     res.status(500).json({ message: 'Failed to generate summary.' });
//   }
// });

// export default router;

// routes/summaryRoute.js
import express from 'express';
import auth from '../middleware/auth.js';
import Transaction from '../models/transaction.js';

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    const year = parseInt(req.query.year) || now.getFullYear();
    const month = req.query.month ? parseInt(req.query.month) : null;

    let startDate, endDate;
    if (month) {
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 1);
    } else {
      startDate = new Date(year, 0, 1);
      endDate = new Date(year + 1, 0, 1);
    }

    const transactions = await Transaction.find({
      userId,
      date: { $gte: startDate, $lt: endDate },
    });

    let inflow = 0;
    let outflow = 0;
    const byCategory = {};

    transactions.forEach((txn) => {
      const amt = txn.amount;

      if (txn.toAccountId && !txn.fromAccountId) {
        inflow += amt;
      } else if (txn.fromAccountId && !txn.toAccountId) {
        outflow += amt;
      } else if (txn.type === 'Income') {
        inflow += amt;
      } else if (txn.type === 'Expense') {
        outflow += amt;
        const category = txn.category || 'Uncategorized';
        byCategory[category] = (byCategory[category] || 0) + amt;
      }
    });

    res.json({
      inflow: Math.round(inflow * 100) / 100,
      outflow: Math.round(outflow * 100) / 100,
      netCashFlow: Math.round((inflow - outflow) * 100) / 100,
      byCategory,
    });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ message: 'Failed to generate summary.' });
  }
});

export default router;
