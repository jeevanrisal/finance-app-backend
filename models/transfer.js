import mongoose from 'mongoose';

const transferSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    fromAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    toAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    amount: { type: Number, required: true },
    note: { type: String },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Transfer = mongoose.model('Transfer', transferSchema);
export default Transfer;
