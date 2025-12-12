// models/budget.js
import mongoose from 'mongoose';

const budgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: { type: String, required: true },
    amount: { type: Number, required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true }, // 1 - 12
  },
  { timestamps: true }
);

export default mongoose.model('Budget', budgetSchema);
