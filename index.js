// index.js
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';

// Routes
import userRoutes from './routers/userRoutes.js';
import accountRoutes from './routers/accountRoutes.js';
import transactionRoutes from './routers/transactionRoute.js';
import uploadRoutes from './routers/uploadRoute.js';
import summaryRoutes from './routers/summaryRoutes.js';
import duplicateRouter from './routers/transactionDuplicateRoutes.js';
import onboardingRoutes from './routers/onboardingRoutes.js';
import dashboardRoutes from './routers/dashboardRoutes.js';
import budgetRoute from './routers/budgetRoute.js';
import searchRoutes from './routers/searchRoutes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Mount routes
app.use('/api/users', userRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/upload', uploadRoutes); // PDF upload & nested transactions
app.use('/api/summary', summaryRoutes);
app.use('/api/transactions', duplicateRouter);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/budgets', budgetRoute);
app.use('/api/search', searchRoutes);

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((error) => console.error('MongoDB connection error:', error));
