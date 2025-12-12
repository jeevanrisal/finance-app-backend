// routes/searchRoutes.js
import express from 'express';
import auth from '../middleware/auth.js';
import Account from '../models/account.js';
import Transaction from '../models/transaction.js';

const router = express.Router();

// Static categories from your UI
const allCategories = [
  'Groceries & Household',
  'Transport',
  'Dining & Takeaway',
  'Shopping & Retail',
  'Utilities & Bills',
  'Health & Fitness',
  'Entertainment & Gaming',
  'Digital & Subscriptions',
  'Account Services',
];

router.get('/', auth, async (req, res) => {
  const { query } = req.query;
  const userId = req.user.id;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({ message: 'Query too short' });
  }

  const regex = new RegExp(query.trim(), 'i');

  try {
    const [transactions, accounts] = await Promise.all([
      Transaction.find({
        userId,
        $or: [
          { description: regex },
          { category: regex },
          { subCategory: regex },
        ],
      })
        .sort({ date: -1 })
        .limit(5)
        .lean(),
      Account.find({
        userId,
        $or: [{ name: regex }, { provider: regex }],
      })
        .limit(5)
        .lean(),
    ]);

    const categories = allCategories.filter((c) => regex.test(c)).slice(0, 5);

    res.json({ transactions, accounts, categories });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ message: 'Search failed' });
  }
});

export default router;
