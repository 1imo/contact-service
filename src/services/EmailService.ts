import nodemailer, { Transporter } from 'nodemailer';
import axios from 'axios';
import { EmailCredential } from '../interfaces/Credential';
import { CredentialRepository } from '../repositories/CredentialRepository';
import { pools } from '../config/database';
import FormData from 'form-data';

/**
 * Interface for email message data
 */
interface EmailAttachment {
    filename: string;
    content: string | Buffer;  // Can be base64 string or Buffer
    contentType: string;
}

interface EmailMessage {
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
    attachments?: EmailAttachment[];
}

interface ZohoTokenResponse {
    access_token: string;
    expires_in: number;
    token_type: string;
}

// Add interface for attachment details
interface ZohoAttachmentDetails {
    storeName: string;
    attachmentPath: string;
    attachmentName: string;
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

    private async getZohoAccessToken(clientId: string, clientSecret: string): Promise<string> {
        try {
            const response = await axios.post('https://accounts.zoho.eu/oauth/v2/token', null, {
                params: {
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'client_credentials',
                    scope: 'ZohoMail.messages.ALL,ZohoMail.accounts.READ'
                }
            });

            console.log('Token response:', response.data);
            return response.data.access_token;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('Token error details:', {
                    status: error.response?.status,
                    data: error.response?.data
                });
            }
            throw new Error(`Failed to get Zoho access token: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async getZohoAccountId(accessToken: string): Promise<string> {
        try {
            const response = await axios.get('https://mail.zoho.eu/api/accounts', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('Account response:', JSON.stringify(response.data, null, 2));

            if (!response.data?.data?.[0]?.accountId) {
                throw new Error('No Zoho account found in response: ' + JSON.stringify(response.data));
            }

            const accountId = response.data.data[0].accountId;
            console.log('Found account ID:', accountId);
            return accountId;
        } catch (error) {
            throw new Error(`Failed to get Zoho account ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async uploadAttachment(accountId: string, accessToken: string, file: Buffer, filename: string): Promise<ZohoAttachmentDetails> {
        try {
            // Create form data using form-data package
            const formData = new FormData();
            formData.append('attach', file, {
                filename: filename,
                contentType: 'application/octet-stream'
            });

            console.log('Uploading attachment to:', `https://mail.zoho.eu/api/accounts/${accountId}/messages/attachments?uploadType=multipart`);

            // Upload attachment with multipart query parameter
            const response = await axios.post(
                `https://mail.zoho.eu/api/accounts/${accountId}/messages/attachments?uploadType=multipart`,
                formData,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        ...formData.getHeaders()
                    }
                }
            );

            console.log('Upload response:', response.data);

            if (!response.data?.data?.[0]) {
                throw new Error('Invalid upload response: ' + JSON.stringify(response.data));
            }

            return {
                storeName: response.data.data[0].storeName,
                attachmentPath: response.data.data[0].attachmentPath,
                attachmentName: response.data.data[0].attachmentName
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('Upload error details:', {
                    status: error.response?.status,
                    data: error.response?.data,
                    headers: error.response?.headers
                });
            }
            throw new Error(`Failed to upload attachment: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Sends an email using the specified credential
     * @param credentialId - ID of the credential to use
     * @param message - Email message to send
     * @throws Error if credential is invalid or sending fails
     */
    async sendEmail(credentialId: string, message: EmailMessage): Promise<void> {
        const client = await this.db.connect();

        try {
            await client.query('BEGIN');

            // Create message record first
            const messageResult = await client.query(
                `INSERT INTO outgoing_messages 
                (credential_id, type, recipient, subject, body_text, body_html, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING id`,
                [
                    credentialId,
                    'email',
                    message.to,
                    message.subject,
                    message.text || '',
                    message.html || '',
                    'pending'
                ]
            );
            const messageId = messageResult.rows[0].id;

            // Get credential and validate
            const credential = await this.credentialRepository.findById(credentialId);
            if (!credential) {
                throw new Error('Credential not found');
            }

            // Get access token using client credentials
            const accessToken = await this.getZohoAccessToken(
                credential.username,
                credential.password
            );

            // Get Zoho account ID
            const accountId = await this.getZohoAccountId(accessToken);

            // Handle attachments first if they exist
            let attachmentDetails: ZohoAttachmentDetails[] = [];
            if (message.attachments && message.attachments.length > 0) {
                attachmentDetails = await Promise.all(
                    message.attachments.map(async (attachment) => {
                        const content = Buffer.isBuffer(attachment.content)
                            ? attachment.content
                            : Buffer.from(attachment.content, 'base64');
                        return this.uploadAttachment(accountId, accessToken, content, attachment.filename);
                    })
                );
            }

            // Modified Zoho API email request
            const emailResponse = await axios.post(
                `https://mail.zoho.eu/api/accounts/${accountId}/messages`,
                {
                    fromAddress: credential.name,
                    toAddress: message.to,
                    ccAddress: message.cc,
                    bccAddress: message.bcc,
                    subject: message.subject,
                    content: message.html || message.text,
                    mailFormat: message.html ? 'html' : 'plaintext',
                    attachments: attachmentDetails.map(detail => ({
                        attachmentName: detail.attachmentName,
                        attachmentPath: detail.attachmentPath,
                        storeName: detail.storeName
                    }))
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Update message status
            await client.query(
                `UPDATE outgoing_messages 
                 SET status = 'sent', sent_at = CURRENT_TIMESTAMP 
                 WHERE id = $1`,
                [messageId]
            );

            await client.query('COMMIT');
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