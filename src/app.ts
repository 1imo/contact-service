import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { pools } from './config/database';
import emailRoutes from './routes/email';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
    origin: config.cors.origins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'x-api-key']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    message: { error: 'Too many requests, please try again later' }
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' })); // Increased limit for attachments
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: config.serviceName,
        environment: config.nodeEnv
    });
});

// Routes
app.use('/api/email', emailRoutes);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: config.isDevelopment ? err.message : 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Start server
async function startServer() {
    try {
        // Test database connections
        await Promise.all([
            pools.auth.query('SELECT 1'),
        ]);

        console.log(`Database connections established in ${config.nodeEnv} mode`);

        app.listen(config.port, () => {
            console.log(`${config.serviceName} listening on port ${config.port} in ${config.nodeEnv} mode`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log(`${config.serviceName} received SIGTERM, shutting down gracefully`);

    try {
        // Close database pools
        await Promise.all([
            pools.auth.end(),
        ]);

        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

startServer();

export default app; 