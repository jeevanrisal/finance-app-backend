// routes/accountRoute.js
import express from 'express';
import Account from '../models/account.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/accounts
// @desc    Create a new account
router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      accountType,
      provider,
      balance,
      isManual,
      linkedTo,
      notes,
      accountNumber,
      cardNumber,
      walletEmail,
      // new credit-card fields:
      expiryDate,
      cardLimit,
      usedBalance,
    } = req.body;

    // Prevent duplicates based on type
    if (accountType === 'bank' && accountNumber) {
      const existing = await Account.findOne({
        userId: req.user.id,
        accountNumber,
      });
      if (existing)
        return res.status(400).json({ message: 'Bank account already exists' });
    }

    if (accountType === 'credit' && cardNumber) {
      const existing = await Account.findOne({
        userId: req.user.id,
        cardNumber,
      });
      if (existing)
        return res.status(400).json({ message: 'Credit card already exists' });
    }

    if (accountType === 'wallet' && walletEmail) {
      const existing = await Account.findOne({
        userId: req.user.id,
        walletEmail,
      });
      if (existing)
        return res.status(400).json({ message: 'Wallet already exists' });
    }

    const account = new Account({
      userId: req.user.id,
      name,
      accountType,
      provider,
      balance,
      isManual,
      linkedTo,
      notes,
      accountNumber,
      cardNumber,
      walletEmail,
      expiryDate,
      cardLimit,
      usedBalance,
    });

    await account.save();
    res.status(201).json(account);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/accounts
// @desc    Get all user accounts
router.get('/', auth, async (req, res) => {
  try {
    const accounts = await Account.find({ userId: req.user.id });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   GET /api/accounts/:id
// @desc    Get a single account
router.get('/:id', auth, async (req, res) => {
  try {
    const account = await Account.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!account) return res.status(404).json({ message: 'Account not found' });
    res.json(account);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   PUT /api/accounts/:id
// @desc    Update an account
router.put('/:id', auth, async (req, res) => {
  try {
    // req.body may include expiryDate, cardLimit, usedBalance, etc.
    const updated = await Account.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Account not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   DELETE /api/accounts/:id
// @desc    Delete an account
router.delete('/:id', auth, async (req, res) => {
  try {
    const deleted = await Account.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!deleted) return res.status(404).json({ message: 'Account not found' });
    res.json({ message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
