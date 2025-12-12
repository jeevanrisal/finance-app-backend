import mongoose from 'mongoose';

const failedTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  rawData: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  error: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending_review', 'resolved'],
    default: 'pending_review',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const FailedTransaction = mongoose.model(
  'FailedTransaction',
  failedTransactionSchema
);

export default FailedTransaction;
