import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import auth from '../middleware/auth.js';
import Account from '../models/account.js';
import Transaction from '../models/transaction.js';
import FailedTransaction from '../models/failedTransaction.js';

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Uses GPT to auto-categorize a transaction into category/subCategory.
 */
async function categorizeWithGPT({ description, amount }) {
  try {
    const prompt = `
Categorize the following financial transaction.

Choose the "category" strictly from this list:
- Groceries & Household
- Transport
- Dining & Takeaway
- Shopping & Retail
- Utilities & Bills
- Health & Fitness
- Entertainment & Gaming
- Digital & Subscriptions
- Account Services

Choose the "subCategory" strictly from the allowed list under each category shown below:

Groceries & Household:
- Supermarkets & Grocery Stores
- Convenience Stores
- Household Supplies
- Farmers' Markets

Transport:
- Public Transport
- Fuel & Maintenance
- Taxi & Rideshare
- Parking & Tolls
- Vehicle Insurance & Registration

Dining & Takeaway:
- Restaurants
- Cafés & Bakeries
- Food Delivery
- Fast Food & Quick-Service
- Coffee & Snacks

Shopping & Retail:
- Apparel & Accessories
- Electronics & Gadgets
- Gifts & Specialty Retail
- Home Décor & Furniture
- Sports & Outdoor Gear

Utilities & Bills:
- Electricity
- Water
- Gas
- Mobile Phone
- Internet
- Rent or Mortgage Payments
- Insurance

Health & Fitness:
- Gym & Fitness Classes
- Medical & Dental Bills
- Pharmacy & Medications
- Wellness & Spa

Entertainment & Gaming:
- Movies & Theaters
- Video Games & In-App Purchases
- Live Events & Concerts
- Books & Magazines

Digital & Subscriptions:
- Streaming Services
- App Store Purchases
- Software & SaaS
- Cloud Storage & Tools

Account Services:
- Refunds & Rebates
- Bank Fees & Charges
- ATM Withdrawals
- Account Maintenance
- Penalties

Transaction details:
Description: "${description}"
Amount: ${amount}

Respond ONLY with a JSON object in the format:
{ "category": "...", "subCategory": "..." }

Do not add anything else. Use only valid entries from the above lists.
`;

    const resp = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    let content = resp.choices[0].message.content.trim();
    content = content.replace(/^```json|```$/g, '').trim();
    const { category, subCategory } = JSON.parse(content);

    return {
      category: category || 'Uncategorized',
      subCategory: subCategory || '',
      isAutoCategorized: true,
    };
  } catch (err) {
    console.error('GPT categorization error:', err.message);
    return {
      category: 'Uncategorized',
      subCategory: '',
      isAutoCategorized: false,
    };
  }
}

const router = express.Router();

// Unified transaction endpoint
router.post('/', auth, async (req, res) => {
  const {
    type, // "Expense" | "Income" | "Transfer"
    amount, // positive number
    fromAccountId, // required for Expense and Transfer
    toAccountId: incomingToAccountId, // required for Income, optional for Transfer
    toAccountName, // required if Transfer and no toAccountId
    description,
    date, // ISO string or Date
  } = req.body;
  const userId = req.user.id;

  // 1) Basic validation
  if (!type || !amount) {
    return res.status(400).json({ message: 'Missing type or amount' });
  }
  if (type === 'Income' && !incomingToAccountId) {
    return res.status(400).json({ message: 'Income requires toAccountId' });
  }
  if (type === 'Expense' && !fromAccountId) {
    return res.status(400).json({ message: 'Expense requires fromAccountId' });
  }
  if (
    type === 'Transfer' &&
    !fromAccountId &&
    !incomingToAccountId &&
    !toAccountName
  ) {
    return res.status(400).json({
      message:
        'Transfer requires fromAccountId and either toAccountId or toAccountName',
    });
  }

  console.log('📝 [tx] Body:', req.body);

  // 2) Start MongoDB session for atomic updates
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 3) Determine or create destination account (only for Transfer)
    let destId = incomingToAccountId;
    if (type === 'Transfer' && !destId) {
      if (!toAccountName) {
        throw new Error(
          'Transfer requires toAccountName when toAccountId is not provided'
        );
      }
      console.log('🔨 Creating temp account for transfer to:', toAccountName);
      const tempAcc = new Account({
        userId,
        name: toAccountName,
        accountType: 'temp',
        balance: 0,
        isManual: false,
      });
      await tempAcc.save({ session });
      console.log('✅ Temp account created:', tempAcc._id);
      destId = tempAcc._id;
    }

    // 4) Auto-categorize with GPT (only for Expense and Income)
    const { category, subCategory, isAutoCategorized } =
      type !== 'Transfer'
        ? await categorizeWithGPT({ description, amount })
        : {
            category: 'Transfer',
            subCategory: '',
            isAutoCategorized: false,
          };

    // 5) Load affected accounts in session
    const fromAcc = fromAccountId
      ? await Account.findById(fromAccountId).session(session)
      : null;
    const toAcc = destId
      ? await Account.findById(destId).session(session)
      : null;

    if ((type === 'Expense' || type === 'Transfer') && !fromAcc) {
      throw new Error('Source account not found');
    }
    if ((type === 'Income' || type === 'Transfer') && !toAcc) {
      throw new Error('Destination account not found');
    }

    // 6) Pre-check balances and limits
    if (type === 'Expense' || type === 'Transfer') {
      if (fromAcc.accountType !== 'credit' && fromAcc.balance < amount) {
        throw new Error('Insufficient funds');
      }
      if (
        fromAcc.accountType === 'credit' &&
        fromAcc.usedBalance + amount > fromAcc.cardLimit
      ) {
        throw new Error('Credit limit exceeded');
      }
    }

    if (type === 'Transfer' && toAcc.accountType === 'credit') {
      if (amount > toAcc.usedBalance) {
        throw new Error('Payment exceeds owed credit balance');
      }
    }

    // 7) Apply balance updates
    const updates = [];
    if (type === 'Expense') {
      // Debit expense
      if (fromAcc.accountType === 'credit') {
        fromAcc.usedBalance += amount;
        fromAcc.balance = -fromAcc.usedBalance;
      } else {
        fromAcc.balance -= amount;
      }
      updates.push(fromAcc.save({ session }));
    } else if (type === 'Income') {
      // Credit income
      if (toAcc.accountType === 'credit') {
        toAcc.usedBalance -= amount;
        toAcc.balance = -toAcc.usedBalance;
      } else {
        toAcc.balance += amount;
      }
      updates.push(toAcc.save({ session }));
    } else {
      // Transfer: debit source
      if (fromAcc.accountType === 'credit') {
        fromAcc.usedBalance -= amount;
        fromAcc.balance = -fromAcc.usedBalance;
      } else {
        fromAcc.balance -= amount;
      }
      updates.push(fromAcc.save({ session }));

      // Transfer: credit destination
      if (toAcc.accountType === 'credit') {
        toAcc.usedBalance = Math.max(0, toAcc.usedBalance - amount);
        toAcc.balance = -toAcc.usedBalance;
      } else {
        toAcc.balance += amount;
      }
      updates.push(toAcc.save({ session }));
    }

    // 8) Create the transaction document
    const txn = new Transaction({
      userId,
      type,
      amount,
      fromAccountId: fromAccountId || null,
      toAccountId: type === 'Expense' ? null : destId,
      description,
      date,
      category,
      subCategory,
      isAutoCategorized,
    });
    await txn.save({ session });

    // 9) Commit updates
    await Promise.all(updates);
    await session.commitTransaction();
    session.endSession();

    // 10) Return transaction + updated balances
    const response = {
      transaction: txn,
      updatedBalances: {},
    };

    if (fromAcc) {
      response.updatedBalances[fromAcc._id] = fromAcc.balance;
    }
    if (toAcc) {
      response.updatedBalances[toAcc._id] = toAcc.balance;
    }

    return res.status(201).json(response);
  } catch (err) {
    // Rollback on error
    await session.abortTransaction();
    session.endSession();
    console.error('❌ [tx] Error:', err.message);
    await FailedTransaction.create({
      userId,
      rawData: req.body,
      error: err.message,
    });
    return res.status(400).json({ message: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      year,
      month,
      type,
      category,
      accountId,
      search,
      limit,
      skip,
      sort = '-date', // Default: newest first
    } = req.query;

    // Base filter - always filter by user
    const filters = { userId };

    // Type filter (case-insensitive exact match)
    if (type) {
      const validTypes = ['Expense', 'Income', 'Transfer'];
      if (validTypes.includes(type)) {
        filters.type = type;
      }
    }

    // Category filter (exact match)
    if (category) {
      filters.category = category;
    }

    // Account filter (transactions involving this account)
    if (accountId) {
      if (mongoose.Types.ObjectId.isValid(accountId)) {
        filters.$or = [
          { fromAccountId: accountId },
          { toAccountId: accountId },
        ];
      } else {
        return res.status(400).json({ message: 'Invalid account ID' });
      }
    }

    // Date range filter
    if (year || month) {
      try {
        const y = parseInt(year) || new Date().getFullYear();
        const m = month ? parseInt(month) - 1 : 0;

        if (isNaN(y) || isNaN(m) || m < 0 || m > 11) {
          return res.status(400).json({ message: 'Invalid date parameters' });
        }

        const start = new Date(y, m, 1);
        const end = month ? new Date(y, m + 1, 1) : new Date(y + 1, 0, 1);

        filters.date = { $gte: start, $lt: end };
      } catch (err) {
        return res.status(400).json({ message: 'Invalid date parameters' });
      }
    }

    // Search filter
    if (search) {
      const trimmedSearch = search.trim();
      if (trimmedSearch.length > 0) {
        const keyword = new RegExp(trimmedSearch, 'i');
        filters.$or = [
          { description: keyword },
          { category: keyword },
          { subCategory: keyword },
          { notes: keyword },
        ];
      }
    }

    // Build query
    let query = Transaction.find(filters)
      .populate('fromAccountId', 'name accountType')
      .populate('toAccountId', 'name accountType')
      .sort(sort);

    // Pagination
    if (limit) {
      const n = parseInt(limit);
      if (!isNaN(n) && n > 0) {
        query = query.limit(n);

        if (skip) {
          const s = parseInt(skip);
          if (!isNaN(s) && s >= 0) {
            query = query.skip(s);
          }
        }
      }
    }

    // Execute query
    const transactions = await query.lean();

    // Calculate totals if requested
    if (req.query.withTotals) {
      const totals = await Transaction.aggregate([
        { $match: filters },
        {
          $group: {
            _id: null,
            totalIncome: {
              $sum: {
                $cond: [{ $eq: ['$type', 'Income'] }, '$amount', 0],
              },
            },
            totalExpenses: {
              $sum: {
                $cond: [{ $eq: ['$type', 'Expense'] }, '$amount', 0],
              },
            },
            count: { $sum: 1 },
          },
        },
      ]);

      return res.json({
        transactions,
        totals: totals[0] || { totalIncome: 0, totalExpenses: 0, count: 0 },
      });
    }

    res.json(transactions);
  } catch (err) {
    console.error('GET /api/transactions error:', err);
    res.status(500).json({
      message: 'Failed to fetch transactions',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const txn = await Transaction.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!txn) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    console.error('DELETE error:', err);
    res.status(500).json({ message: 'Failed to delete transaction' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const updates = req.body;
    const txn = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      updates,
      { new: true }
    );

    if (!txn) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json(txn);
  } catch (err) {
    console.error('PUT error:', err);
    res.status(500).json({ message: 'Failed to update transaction' });
  }
});

export default router;
