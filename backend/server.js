const path = require('path');
// Only load .env file in development (Railway provides env vars directly)
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}
const express = require('express');
const cors = require('cors');

const main = async () => {
    console.log('Using Supabase for database operations.');

    const app = express();
    const PORT = process.env.PORT || 3001;

    // Middleware
    const allowedOrigins = [
        'http://localhost:8080', 
        'http://localhost:5173', 
        'http://127.0.0.1:5173', 
        'http://localhost:3000',
        'https://xcapp-production.up.railway.app'
    ];
    
    app.use(cors({
        origin: process.env.NODE_ENV === 'production' ? 'https://xcapp-production.up.railway.app' : allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }));
    app.use(express.json());

    const { authenticate } = require('./middleware/auth');

    // Import routes
    const authRoutes = require('./routes/auth');
    const profileRoutes = require('./routes/profile');
    const teamRoutes = require('./routes/teamsSupabase');
    const resultRoutes = require('./routes/results');
    const userRoutes = require('./routes/users');
    const analyticsRoutes = require('./routes/analytics');
    const athleteRoutes = require('./routes/athletes');
    const performanceRoutes = require('./routes/performanceRoutes');
    const seasonRoutes = require('./routes/seasons');
    const multiSeasonTrendsRoutes = require('./routes/multiSeasonTrends');
    const dataManagementRoutes = require('./routes/dataManagement');
    const meetRoutes = require('./routes/meets');
    const teamPerformanceRoutes = require('./routes/teamSupabase');
    const splitsRoutes = require('./routes/splits');
    const meetGroupsRoutes = require('./routes/meetGroups');
    const coachesToolsRoutes = require('./routes/coachesTools');


    app.get('/api', (req, res) => {
        res.send('XC Analytics Backend API is running!');
    });

    // Use routes
    app.use('/api/auth', authRoutes);
    app.use('/api/profile', profileRoutes);
    app.use('/api/teams', teamRoutes);
    app.use('/api/results', resultRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/analytics', analyticsRoutes);
    app.use('/api/athletes', athleteRoutes);
    app.use('/api/performance', performanceRoutes);
    app.use('/api/meets', meetRoutes);
    app.use('/api/team', teamPerformanceRoutes);
    app.use('/api/seasons', seasonRoutes);
    app.use('/api/multi-season', multiSeasonTrendsRoutes);
    app.use('/api/data', dataManagementRoutes);
    app.use('/api/splits', splitsRoutes);
    app.use('/api/meet-groups', meetGroupsRoutes);
    app.use('/api/coaches-tools', coachesToolsRoutes);
    
    // Enhanced performance routes
    const enhancedPerformanceRoutes = require('./routes/enhancedPerformanceRoutes');
    app.use('/api/enhanced-performance', enhancedPerformanceRoutes);

    // Example of a protected route
    app.get('/api/test-auth', authenticate, (req, res) => {
        res.send({ message: `Authenticated as user: ${req.user.email}` });
    });

    // Serve static files from web/dist in production
    if (process.env.NODE_ENV === 'production') {
        const path = require('path');
        app.use(express.static(path.join(__dirname, '../web/dist')));
        
        // Serve React app for all non-API routes (must be last)
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../web/dist/index.html'));
        });
        
        // Catch-all handler for client-side routing
        app.get(/^(?!\/api).*/, (req, res) => {
            res.sendFile(path.join(__dirname, '../web/dist/index.html'));
        });
    }

    // Start server (Railway needs this, not module.exports)
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}`);
    });
};

// For Vercel, we need to initialize immediately
if (process.env.NODE_ENV === 'production') {
    main().catch(err => {
        console.error("Failed to start server:", err);
    });
} else {
    main().catch(err => {
        console.error("Failed to start server:", err);
    });
}
