import express from 'express';
import Budget from '../models/budget.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/budgets
// @desc    Create or update a budget for a category and month
router.post('/', auth, async (req, res) => {
  try {
    const { category, amount, year, month } = req.body;

    if (!category || !amount || !year || !month) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const budget = await Budget.findOneAndUpdate(
      { userId: req.user.id, category, year, month },
      { amount },
      { upsert: true, new: true }
    );

    res.status(200).json(budget);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/budgets
// @desc    Get all budgets for a given month/year
router.get('/', auth, async (req, res) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ message: 'Year and month are required' });
    }

    const budgets = await Budget.find({
      userId: req.user.id,
      year: parseInt(year),
      month: parseInt(month),
    });

    res.json(budgets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/budgets/:id
// @desc    Get a single budget by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const budget = await Budget.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!budget) return res.status(404).json({ message: 'Budget not found' });
    res.json(budget);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   PUT /api/budgets/:id
// @desc    Update a budget by ID
router.put('/:id', auth, async (req, res) => {
  try {
    const updated = await Budget.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: 'Budget not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   DELETE /api/budgets/:id
// @desc    Delete a budget by ID
router.delete('/:id', auth, async (req, res) => {
  try {
    const deleted = await Budget.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!deleted) return res.status(404).json({ message: 'Budget not found' });
    res.json({ message: 'Budget deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
