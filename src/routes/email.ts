import { Router } from 'express';
import { EmailService } from '../services/EmailService';
import { PostgresCredentialRepository } from '../repositories/CredentialRepository';
import { serviceAuth } from '../middleware/auth';
import { validateApiKey } from '../middleware/credentialAuth';
import { z } from 'zod';

const router = Router();
const credentialRepository = new PostgresCredentialRepository();
const emailService = new EmailService(credentialRepository);

/**
 * Email message validation schema
 */
const emailMessageSchema = z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    text: z.string().optional(),
    html: z.string().optional(),
    cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
    bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
    replyTo: z.string().email().optional(),
    attachments: z.array(z.object({
        filename: z.string().refine(
            (name) => !name.includes('..') && !name.includes('/') && !name.includes('\\'),
            'Invalid filename'
        ),
        content: z.union([
            z.instanceof(Buffer),
            z.string().refine(
                (str) => {
                    try {
                        return Buffer.from(str, 'base64').length <= 10 * 1024 * 1024; // 10MB limit
                    } catch {
                        return false;
                    }
                },
                'Invalid base64 content or file too large'
            )
        ]),
        contentType: z.string().optional()
    })).optional()
        .refine(
            (attachments) => !attachments || attachments.length <= 5,
            'Maximum 5 attachments allowed'
        )
}).refine(data => data.text || data.html, {
    message: "Either text or html content must be provided"
});

/**
 * Send an email
 * @route POST /api/email/send
 */
router.post('/send',
    serviceAuth,  // First validate the calling service
    validateApiKey,  // Then validate the email credential
    async (req, res) => {
        try {
            const { credentialId, message } = req.body;

            // Validate credential ID
            if (!credentialId) {
                return res.status(400).json({ error: 'Credential ID is required' });
            }

            // Validate message format
            try {
                emailMessageSchema.parse(message);
            } catch (error) {
                return res.status(400).json({
                    error: 'Invalid message format',
                    details: error instanceof z.ZodError ? error.errors : undefined
                });
            }

            await emailService.sendEmail(credentialId, message);
            res.status(200).json({ message: 'Email sent successfully' });
        } catch (error) {
            console.error('Failed to send email:', error);
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to send email'
            });
        }
    });

/**
 * Verify email connection
 * @route POST /api/email/verify
 */
router.post('/verify',
    serviceAuth,  // First validate the calling service
    validateApiKey,  // Then validate the email credential
    async (req, res) => {
        try {
            const { credentialId } = req.body;

            if (!credentialId) {
                return res.status(400).json({ error: 'Credential ID is required' });
            }

            const isValid = await emailService.verifyConnection(credentialId);
            res.status(200).json({ valid: isValid });
        } catch (error) {
            console.error('Failed to verify email connection:', error);
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Failed to verify email connection'
            });
        }
    });

export default router; 