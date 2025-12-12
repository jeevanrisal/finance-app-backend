import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: { type: String, required: true },

    // one of 'bank' | 'wallet' | 'credit' | 'loan' | 'asset' | 'liability' | 'person'
    accountType: {
      type: String,
      enum: ['bank', 'wallet', 'credit', 'loan', 'asset', 'liability', 'temp'],
      required: true,
    },

    // generic provider field (e.g. ANZ, CBA, PayPal, etc)
    provider: { type: String },

    // overall balance – for credit cards you'll leave this at zero,
    // and use cardLimit/usedBalance instead
    balance: { type: Number, default: 0 },

    isManual: { type: Boolean, default: false },
    linkedTo: { type: String },
    notes: { type: String },

    // unique identifiers
    accountNumber: { type: String }, // for bank
    walletEmail: { type: String }, // for wallets
    cardNumber: { type: String }, // for credit cards

    // credit‐card specific fields:
    expiryDate: {
      type: String,
      required: function () {
        return this.accountType === 'credit';
      },
    },
    cardLimit: {
      type: Number,
      default: 0,
      required: function () {
        return this.accountType === 'credit';
      },
    },
    usedBalance: {
      type: Number,
      default: 0,
      required: function () {
        return this.accountType === 'credit';
      },
    },
  },
  { timestamps: true }
);

// compound indexes to prevent duplicates per user
accountSchema.index(
  { userId: 1, accountNumber: 1 },
  { unique: true, partialFilterExpression: { accountType: 'bank' } }
);
accountSchema.index(
  { userId: 1, walletEmail: 1 },
  { unique: true, partialFilterExpression: { accountType: 'wallet' } }
);
accountSchema.index(
  { userId: 1, cardNumber: 1 },
  { unique: true, partialFilterExpression: { accountType: 'credit' } }
);

const Account = mongoose.model('Account', accountSchema);
export default Account;
