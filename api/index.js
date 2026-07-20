// Vercel serverless function entry point
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json());

// Database Connection
let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;
    
    const dbUrl = process.env.DATABASE_URL || process.env.MONGODB_URI;
    if (!dbUrl) {
        console.error('Error: DATABASE_URL or MONGODB_URI is not defined');
        throw new Error('Database URL not configured');
    }

    try {
        await mongoose.connect(dbUrl);
        isConnected = true;
        console.log('MongoDB connected successfully.');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        throw err;
    }
};

// Routes
const analyticsRoutes = require('../backend/routes/analytics');
const athleteRoutes = require('../backend/routes/athletes');
const teamRoutes = require('../backend/routes/teams');
const performanceRoutes = require('../backend/routes/performance');
const multiSeasonTrendsRoutes = require('../backend/routes/multiSeasonTrends');
const dataManagementRoutes = require('../backend/routes/dataManagement');
const enhancedPerformanceRoutes = require('../backend/routes/enhancedPerformanceRoutes');

app.use('/analytics', analyticsRoutes);
app.use('/athletes', athleteRoutes);
app.use('/teams', teamRoutes);
app.use('/performance', performanceRoutes);
app.use('/multi-season', multiSeasonTrendsRoutes);
app.use('/data', dataManagementRoutes);
app.use('/enhanced-performance', enhancedPerformanceRoutes);

// Health check
app.get('/', (req, res) => {
    res.json({ message: 'XC Analytics API is running!' });
});

// Export for Vercel
module.exports = async (req, res) => {
    await connectDB();
    return app(req, res);
};
