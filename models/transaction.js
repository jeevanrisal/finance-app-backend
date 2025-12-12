// models/transaction.js
import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['Income', 'Expense', 'Transfer'],
      required: true,
    },
    linkedTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    amount: { type: Number, required: true },
    fromAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    toAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    description: { type: String },
    category: { type: String },
    subCategory: { type: String },
    date: { type: Date, default: Date.now },
    notes: { type: String },
    isAutoCategorized: { type: Boolean, default: false },
    isFromUpload: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;
