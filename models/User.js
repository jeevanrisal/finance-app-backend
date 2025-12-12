import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    passwordHash: { type: String, required: true },
    preferences: {
      currency: { type: String, default: 'AUD' },
      notification: {
        email: { type: Boolean, default: true },
      },
    },
  },
  { timestamps: true }
);

const User = mongoose.model('user', userSchema);
export default User;
