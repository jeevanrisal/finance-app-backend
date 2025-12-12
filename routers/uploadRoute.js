import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { createRequire } from 'module';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import auth from '../middleware/auth.js';
import Account from '../models/account.js';
import Transaction from '../models/transaction.js';
import FailedTransaction from '../models/failedTransaction.js';
import transactionRouter from './transactionRoute.js';

dotenv.config();
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Mount existing transaction routes under /transactions
router.use('/transactions', transactionRouter);

// GPT-based categorization helper (same as in transactionRoute)
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

// Regex fallback parser
function fallbackTransactionParser(text) {
  const rx = /(\d{2} \w{3} \d{4})\s+(.*?)\s+(-?\d+\.\d{2})\s+(-?\d+\.\d{2})/g;
  const transactions = [];
  let m;
  while ((m = rx.exec(text)) !== null) {
    transactions.push({
      date: new Date(m[1]),
      description: m[2].trim(),
      amount: parseFloat(m[3]),
      balance: parseFloat(m[4]),
    });
  }
  return transactions;
}

// Extract transactions via AI, fallback to regex
async function extractTransactionsFromPDF(text) {
  const start = text.indexOf('Date\nTransactionDebitCreditBalance');
  const end = text.indexOf('Closing balance');
  const snippet = text.slice(start, end);
  const prompt = `Extract transactions from this bank statement snippet as JSON array. Each transaction should have date (DD MMM YYYY), description, amount (negative for debits, positive for credits), and balance. Text:\n${snippet.slice(0, 10000)}`;
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });
    const { transactions = [] } = JSON.parse(resp.choices[0].message.content);
    return transactions
      .map((tx) => ({
        ...tx,
        date: new Date(tx.date),
        amount: parseFloat(tx.amount),
        balance: parseFloat(tx.balance),
      }))
      .filter((tx) => tx.description && !isNaN(tx.amount));
  } catch (e) {
    console.error('Extraction failed, using fallback:', e);
    return fallbackTransactionParser(snippet);
  }
}

// Process, de-duplicate, categorize, save & update balances
async function processUploadedTransactions(
  userId,
  transactions,
  sourceAccountId
) {
  const session = await mongoose.startSession();
  session.startTransaction();
  const results = {
    success: [],
    failed: [],
    duplicates: [],
    updatedAccounts: {},
  };
  try {
    for (const tx of transactions) {
      const exists = await Transaction.findOne({
        userId,
        description: tx.description,
        amount: Math.abs(tx.amount),
        date: {
          $gte: new Date(tx.date.setHours(0, 0, 0, 0)),
          $lt: new Date(tx.date.setHours(23, 59, 59, 999)),
        },
      }).session(session);
      if (exists) {
        results.duplicates.push(tx);
        continue;
      }

      const isCredit = tx.amount > 0;
      const type = isCredit ? 'Income' : 'Expense';
      const amount = Math.abs(tx.amount);
      const { category, subCategory, isAutoCategorized } =
        await categorizeWithGPT({ description: tx.description, amount });

      const data = {
        userId,
        type,
        amount,
        description: tx.description,
        date: tx.date,
        category,
        subCategory,
        isAutoCategorized,
        isFromUpload: true,
        [isCredit ? 'toAccountId' : 'fromAccountId']: sourceAccountId,
      };

      const account = await Account.findById(sourceAccountId).session(session);
      if (!account) throw new Error('Account not found');

      if (type === 'Expense') {
        if (account.accountType !== 'credit' && account.balance < amount)
          throw new Error('Insufficient funds');
        if (
          account.accountType === 'credit' &&
          account.usedBalance + amount > account.cardLimit
        )
          throw new Error('Credit limit exceeded');
      }
      const newTx = new Transaction(data);
      await newTx.save({ session });

      if (type === 'Income') account.balance += amount;
      else {
        if (account.accountType === 'credit') {
          account.usedBalance += amount;
          account.balance = -account.usedBalance;
        } else account.balance -= amount;
      }
      await account.save({ session });

      results.success.push(newTx);
      results.updatedAccounts[sourceAccountId] = account.balance;
    }
    await session.commitTransaction();
    return results;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

// Upload endpoint
router.post('/upload', auth, upload.single('statement'), async (req, res) => {
  const { accountId } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!accountId)
    return res.status(400).json({ error: 'accountId is required' });

  // Validate source account
  const sourceAcc = await Account.findOne({
    _id: accountId,
    userId: req.user.id,
  });
  if (!sourceAcc) return res.status(404).json({ error: 'Account not found' });

  try {
    const buffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(buffer);
    const rawTxs = await extractTransactionsFromPDF(pdfData.text);
    if (!rawTxs.length) throw new Error('No transactions extracted');

    const results = await processUploadedTransactions(
      req.user.id,
      rawTxs,
      sourceAcc._id
    );
    fs.unlinkSync(req.file.path);

    res.status(201).json({
      message: 'Statement processed successfully',
      stats: {
        processed: results.success.length,
        failed: results.failed.length,
        duplicates: results.duplicates.length,
      },
      accountBalances: results.updatedAccounts,
    });
  } catch (err) {
    console.error('Upload failed:', err);
    if (req.file?.path) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

export default router;
