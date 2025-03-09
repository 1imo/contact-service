import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

/**
 * Environment variables schema
 */
const envSchema = z.object({
    // Service Configuration
    PORT: z.string().default('3005'),
    SERVICE_NAME: z.string().default('contact-service'),
    API_KEY: z.string(),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // Database Configuration
    DB_HOST: z.string(),
    DB_USER: z.string(),
    DB_PASSWORD: z.string(),
    DB_PORT: z.string().default('5432'),
    AUTH_DB_NAME: z.string(),
    CONTACT_DB_NAME: z.string(),

    // CORS Configuration
    ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
    RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),
});

/**
 * Validate and export environment variables
 */
const env = envSchema.parse(process.env);

// Common database config
const dbConfig = {
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    port: parseInt(env.DB_PORT),
};

export const config = {
    port: parseInt(env.PORT),
    serviceName: env.SERVICE_NAME,
    apiKey: env.API_KEY,
    nodeEnv: env.NODE_ENV,
    isDevelopment: env.NODE_ENV === 'development',
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',

    db: {
        auth: {
            ...dbConfig,
            database: env.AUTH_DB_NAME,
        },
        contact: {
            ...dbConfig,
            database: env.CONTACT_DB_NAME,
        }
    },

    cors: {
        origins: env.ALLOWED_ORIGINS.split(','),
    },

    rateLimit: {
        windowMs: parseInt(env.RATE_LIMIT_WINDOW_MS),
        max: parseInt(env.RATE_LIMIT_MAX_REQUESTS),
    },
} as const; 