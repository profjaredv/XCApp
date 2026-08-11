const path = require('path');
// Only load .env file in development (Railway provides env vars directly)
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Fail fast on missing configuration rather than booting "healthy" and then
// throwing on every request that touches the database. A missing DATABASE_URL
// previously produced a server that logged "running on port 8080" and then
// 500'd every single API call, with the real cause buried in a Prisma stack
// trace — the logs said the app was fine while nothing worked.
const REQUIRED_ENV = ['DATABASE_URL', 'NEON_AUTH_JWKS_URL'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
    console.error(
        `CRITICAL: missing required environment variable(s): ${missingEnv.join(', ')}.\n` +
        'Set them on the service (Railway → Variables) and redeploy. ' +
        'Refusing to start, because every database-backed request would fail at runtime.'
    );
    process.exit(1);
}

const main = async () => {
    console.log('Using Neon (Postgres via Prisma) for database operations.');

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
    
    // This same Express app also serves the built frontend (see
    // express.static below) — helmet's default Content-Security-Policy
    // header lands on that HTML response too, and the browser then enforces
    // it against everything the SPA fetches: Neon Auth sign-in, Sentry,
    // any CDN asset. Helmet's default CSP is tuned for a server-rendered
    // app serving its own resources, not a SPA that legitimately talks to
    // several third-party origins — it broke sign-in outright. The other
    // headers helmet sets (X-Content-Type-Options, X-Frame-Options, HSTS,
    // etc.) have no such cross-origin side effect and stay on.
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(cors({
        origin: process.env.NODE_ENV === 'production' ? 'https://xcapp-production.up.railway.app' : allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }));
    app.use(express.json({ limit: '1mb' }));

    // These three routes let an authenticated-but-unprivileged account
    // change its own team/role standing (join a team, upgrade to coach) by
    // guessing a code — exactly the kind of endpoint worth throttling
    // per-IP regardless of how strong the code itself is.
    const roleChangeLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        limit: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { message: 'Too many attempts. Try again later.' },
    });
    app.use('/api/profile/join-team', roleChangeLimiter);
    app.use('/api/profile/upgrade-to-coach', roleChangeLimiter);
    app.use('/api/team/join', roleChangeLimiter);

    const { authenticate } = require('./middleware/auth');

    // Import routes
    const profileRoutes = require('./routes/profile');
    const teamRoutes = require('./routes/teams');
    const resultRoutes = require('./routes/results');
    const userRoutes = require('./routes/users');
    const analyticsRoutes = require('./routes/analytics');
    const athleteRoutes = require('./routes/athletes');
    const performanceRoutes = require('./routes/performanceRoutes');
    const seasonRoutes = require('./routes/seasons');
    const multiSeasonTrendsRoutes = require('./routes/multiSeasonTrends');
    const dataManagementRoutes = require('./routes/dataManagement');
    const meetRoutes = require('./routes/meets');
    const teamPerformanceRoutes = require('./routes/team');
    const splitsRoutes = require('./routes/splits');
    const meetGroupsRoutes = require('./routes/meetGroups');
    const coachesToolsRoutes = require('./routes/coachesTools');
    const feedbackRoutes = require('./routes/feedback');
    const guardianRoutes = require('./routes/guardian');
    const groupRoutes = require('./routes/groups');
    const practicePlanRoutes = require('./routes/practicePlans');
    const workoutTemplateRoutes = require('./routes/workoutTemplates');

    app.get('/api', (req, res) => {
        res.send('XC Analytics Backend API is running!');
    });

    // Use routes
    // Note: there is no /api/auth route anymore — Neon Auth (Stack) handles
    // sign-up/sign-in entirely client-side; the backend only verifies the
    // resulting access token (see middleware/auth.js).
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
    app.use('/api/feedback', feedbackRoutes);
    app.use('/api/guardian', guardianRoutes);
    app.use('/api/groups', groupRoutes);
    app.use('/api/practice-plans', practicePlanRoutes);
    app.use('/api/workout-templates', workoutTemplateRoutes);

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
