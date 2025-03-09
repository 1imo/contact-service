import nodemailer, { Transporter } from 'nodemailer';
import { EmailCredential } from '../interfaces/Credential';
import { CredentialRepository } from '../repositories/CredentialRepository';
import { pools } from '../config/database';

/**
 * Interface for email message data
 */
export interface EmailMessage {
    /** Email recipient address */
    to: string;
    /** Email subject line */
    subject: string;
    /** Email text content */
    text?: string;
    /** Email HTML content */
    html?: string;
    /** CC recipients */
    cc?: string | string[];
    /** BCC recipients */
    bcc?: string | string[];
    /** Reply-to address */
    replyTo?: string;
    /** Email attachments */
    attachments?: Array<{
        filename: string;
        content: Buffer | string;
        contentType?: string;
    }>;
}

/**
 * Service for sending emails using SMTP credentials
 */
export class EmailService {
    private transporter: Transporter | null = null;
    private currentCredentialId: string | null = null;
    private readonly db = pools.contact;

    /**
     * Creates an instance of EmailService
     * @param credentialRepository - Repository for accessing credentials
     */
    constructor(
        private readonly credentialRepository: CredentialRepository
    ) { }

    /**
     * Sends an email using the specified credential
     * @param credentialId - ID of the credential to use
     * @param message - Email message to send
     * @throws Error if credential is invalid or sending fails
     */
    async sendEmail(credentialId: string, message: EmailMessage): Promise<void> {
        let messageId: string;

        // Start transaction
        const client = await this.db.connect();
        try {
            await client.query('BEGIN');

            // Insert initial message record
            const insertResult = await client.query(
                `INSERT INTO outgoing_messages (
                    credential_id, type, recipient, cc, bcc, reply_to,
                    subject, body_text, body_html, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id`,
                [
                    credentialId,
                    'email',
                    message.to,
                    message.cc ? Array.isArray(message.cc) ? message.cc : [message.cc] : null,
                    message.bcc ? Array.isArray(message.bcc) ? message.bcc : [message.bcc] : null,
                    message.replyTo,
                    message.subject,
                    message.text,
                    message.html,
                    'pending'
                ]
            );

            messageId = insertResult.rows[0].id;

            // Insert attachments if any
            if (message.attachments?.length) {
                const attachmentValues = message.attachments.map(attachment => {
                    const content = Buffer.isBuffer(attachment.content)
                        ? attachment.content
                        : Buffer.from(attachment.content, 'base64');

                    return {
                        message_id: messageId,
                        filename: attachment.filename,
                        content_type: attachment.contentType,
                        size_bytes: content.length,
                        content: content
                    };
                });

                for (const attachment of attachmentValues) {
                    await client.query(
                        `INSERT INTO message_attachments (
                            message_id, filename, content_type, size_bytes, content
                        ) VALUES ($1, $2, $3, $4, $5)`,
                        [
                            attachment.message_id,
                            attachment.filename,
                            attachment.content_type,
                            attachment.size_bytes,
                            attachment.content
                        ]
                    );
                }
            }

            // Get credential and validate
            const credential = await this.credentialRepository.findById(credentialId);
            if (!credential) {
                throw new Error('Credential not found');
            }
            if (credential.type !== 'email') {
                throw new Error('Invalid credential type: not an email credential');
            }
            if (!credential.host || !credential.port || credential.secure === undefined) {
                throw new Error('Invalid email credential: missing required SMTP configuration');
            }

            // Create or update transporter if needed
            if (this.currentCredentialId !== credentialId) {
                this.transporter = nodemailer.createTransport({
                    host: credential.host,
                    port: credential.port,
                    secure: credential.secure,
                    auth: {
                        user: credential.username,
                        pass: credential.password,
                    },
                });
                this.currentCredentialId = credentialId;
            }

            // Send email
            try {
                await this.transporter!.sendMail({
                    from: credential.username,
                    ...message,
                });

                // Update status to sent
                await client.query(
                    `UPDATE outgoing_messages 
                     SET status = 'sent', sent_at = CURRENT_TIMESTAMP 
                     WHERE id = $1`,
                    [messageId]
                );

                await client.query('COMMIT');
            } catch (error) {
                // Update status to failed with error message
                await client.query(
                    `UPDATE outgoing_messages 
                     SET status = 'failed', error_message = $2 
                     WHERE id = $1`,
                    [messageId, error instanceof Error ? error.message : 'Unknown error']
                );
                await client.query('COMMIT');
                throw error;
            }
        } catch (error) {
            await client.query('ROLLBACK');
            throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            client.release();
        }
    }

    /**
     * Verifies the connection with the email server
     * @param credentialId - ID of the credential to verify
     * @returns Promise resolving to true if connection is valid
     * @throws Error if credential is invalid or verification fails
     */
    async verifyConnection(credentialId: string): Promise<boolean> {
        const credential = await this.credentialRepository.findById(credentialId);
        if (!credential) {
            throw new Error('Credential not found');
        }
        if (credential.type !== 'email') {
            throw new Error('Invalid credential type: not an email credential');
        }
        if (!credential.host || !credential.port || credential.secure === undefined) {
            throw new Error('Invalid email credential: missing required SMTP configuration');
        }

        const testTransporter = nodemailer.createTransport({
            host: credential.host,
            port: credential.port,
            secure: credential.secure,
            auth: {
                user: credential.username,
                pass: credential.password,
            },
        });

        try {
            await testTransporter.verify();
            return true;
        } catch (error) {
            throw new Error(`Failed to verify email connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
} 