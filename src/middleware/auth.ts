import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { PostgresCredentialRepository } from '../repositories/CredentialRepository';

const credentialRepository = new PostgresCredentialRepository();
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3003';

export interface AuthenticatedRequest extends Request {
    service?: {
        id: string;
        name: string;
        allowedServices: string[];
    };
}

/**
 * Middleware to validate API key from request headers
 */
export async function validateApiKey(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'];
    const credentialId = req.body.credentialId;

    if (!apiKey || typeof apiKey !== 'string') {
        return res.status(401).json({ error: 'API key is required' });
    }

    if (!credentialId) {
        return res.status(400).json({ error: 'Credential ID is required' });
    }

    try {
        const isValid = await credentialRepository.validateApiKey(credentialId, apiKey);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid API key' });
        }
        next();
    } catch (error) {
        console.error('API key validation failed:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'API key validation failed'
        });
    }
}

/**
 * Middleware to validate service authentication via auth-service
 */
export async function serviceAuth(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'];
    const serviceName = req.headers['x-service-name'];

    if (!apiKey || !serviceName) {
        return res.status(401).json({ error: 'Missing authentication credentials' });
    }

    try {
        const response = await axios.post(`${AUTH_SERVICE_URL}/api/auth/verify`, {}, {
            headers: {
                'X-API-Key': apiKey,
                'X-Service-Name': serviceName,
                'X-Target-Service': 'contact-service',
                'Content-Type': 'application/json'
            }
        });

        (req as AuthenticatedRequest).service = response.data;
        next();
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
            return res.status(401).json({ error: 'Invalid authentication credentials' });
        }
        console.error('Service authentication error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
} 