import { Request, Response, NextFunction } from 'express';
import { PostgresCredentialRepository } from '../repositories/CredentialRepository';

const credentialRepository = new PostgresCredentialRepository();

/**
 * Middleware to validate email credential API key
 */
export async function validateApiKey(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-credential-key'];  // Changed to avoid conflict with service API key
    const credentialId = req.body.credentialId;

    if (!apiKey || typeof apiKey !== 'string') {
        return res.status(401).json({ error: 'Credential API key is required' });
    }

    if (!credentialId) {
        return res.status(400).json({ error: 'Credential ID is required' });
    }

    try {
        const isValid = await credentialRepository.validateApiKey(credentialId, apiKey);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credential API key' });
        }
        next();
    } catch (error) {
        console.error('Credential API key validation failed:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Credential API key validation failed'
        });
    }
} 