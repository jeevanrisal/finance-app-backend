// src/routes/onboardingRoutes.js
import express from 'express';
import Account from '../models/account.js';
import auth from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/onboarding
// @desc    Bulk create accounts from onboarding data
router.post('/', auth, async (req, res) => {
  const {
    bankAccounts = [],
    creditCards = [],
    financialWallets = [],
    assets = [],
    liabilities = [],
  } = req.body;

  const allItems = [
    ...bankAccounts.map((a) => ({ ...a, accountType: 'bank' })),
    ...creditCards.map((a) => ({ ...a, accountType: 'credit' })),
    ...financialWallets.map((a) => ({ ...a, accountType: 'wallet' })),
    ...assets.map((a) => ({ ...a, accountType: 'asset' })),
    ...liabilities.map((a) => ({ ...a, accountType: 'liability' })),
  ];

  const created = [];

  try {
    for (const data of allItems) {
      // ────── GUARD AGAINST MISSING NAME ──────
      if (!data.name || typeof data.name !== 'string') {
        console.warn('Skipping onboarding item with no name:', data);
        continue;
      }

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
        expiryDate,
        cardLimit,
        usedBalance,
      } = data;

      // ────── DUPLICATE PREVENTION ──────
      if (accountType === 'bank' && accountNumber) {
        if (await Account.findOne({ userId: req.user.id, accountNumber }))
          continue;
      }
      if (accountType === 'credit' && cardNumber) {
        if (await Account.findOne({ userId: req.user.id, cardNumber }))
          continue;
      }
      if (accountType === 'wallet' && walletEmail) {
        if (await Account.findOne({ userId: req.user.id, walletEmail }))
          continue;
      }

      // ────── PARSE CREDIT-CARD NUMERICS ──────
      let parsedLimit = 0,
        parsedUsed = 0;
      if (accountType === 'credit') {
        parsedLimit = parseFloat(cardLimit) || 0;
        parsedUsed = parseFloat(usedBalance) || 0;
      }

      // ────── BUILD & SAVE ACCOUNT ──────
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
        walletEmail,
        cardNumber,
        // only include these on credit cards
        ...(accountType === 'credit' && {
          expiryDate,
          cardLimit: parsedLimit,
          usedBalance: parsedUsed,
        }),
      });

      await account.save();
      created.push(account);
    }

    res.status(201).json({ createdCount: created.length, accounts: created });
  } catch (err) {
    console.error('Onboarding error:', err);
    res.status(500).json({ message: err.message });
  }
});

export default router;
