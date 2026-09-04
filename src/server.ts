import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import connectDB from './config/database';

// Routes
import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import itemRoutes from './routes/items';
import stockRoutes from './routes/stock';
import repairRoutes from './routes/repairs';
import disposalRoutes from './routes/disposals';
import locationRoutes from './routes/locations';
import userRoutes from './routes/users';
import managerRoutes from './routes/managers';
import transactionRoutes from './routes/transactions';

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const checkFCMConfig = () => {
  console.log('\nFCM Configuration Check:');
  if (process.env.FCM_SERVICE_ACCOUNT) {
    try {
      const fcmConfig = JSON.parse(process.env.FCM_SERVICE_ACCOUNT);
      console.log('FCM_SERVICE_ACCOUNT: Found');
      console.log('   Project ID:', fcmConfig.project_id || 'Not set');
      console.log('   Client Email:', fcmConfig.client_email || 'Not set');
      console.log('   Has Private Key:', fcmConfig.private_key ? 'Yes' : 'No');
    } catch (error: any) {
      console.error('FCM_SERVICE_ACCOUNT: Invalid JSON format', error.message);
    }
  } else {
    console.error('FCM_SERVICE_ACCOUNT: Not set in environment variables');
  }
};

checkFCMConfig();

connectDB().catch((error) => {
  console.error('Failed to connect to database:', error);
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/*', limit: '10mb' }));
import parseTextJson from './middleware/parseTextJson';
app.use(parseTextJson);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/repairs', repairRoutes);
app.use('/api/disposals', disposalRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/managers', managerRoutes);
app.use('/api/transactions', transactionRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'StockBuddy Backend API is LIVE!',
    timestamp: new Date().toISOString(),
    status: 'Server Running',
    version: '1.0.0',
    environment: NODE_ENV
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} (${NODE_ENV})`);
});