import express from 'express';
import Transaction from '../models/transaction.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// GET /api/transactions/duplicates
router.get('/duplicates', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const duplicates = await Transaction.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: {
            description: '$description',
            amount: '$amount',
            date: '$date',
          },
          count: { $sum: 1 },
          transactions: { $push: '$$ROOT' },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
    ]);

    res.json({ duplicates });
  } catch (err) {
    console.error('Duplicate detection error:', err);
    res.status(500).json({ message: 'Failed to detect duplicates.' });
  }
});

export default router;
