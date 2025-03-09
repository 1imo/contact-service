/**
 * Base interface for communication credentials
 */
export interface Credential {
    /** Unique identifier */
    id: string;
    /** Friendly name for the credential */
    name: string;
    /** Type of communication this credential is for */
    type: CommunicationType;
    /** API key for authentication */
    apiKey: string;
    /** Service hostname */
    host?: string;
    /** Service port */
    port?: number;
    /** Whether to use secure connection */
    secure?: boolean;
    /** Service username */
    username: string;
    /** Service password */
    password: string;
    /** Creation timestamp */
    createdAt: Date;
    /** Last update timestamp */
    updatedAt: Date;
}

/**
 * Supported communication types
 */
export type CommunicationType = 'email' | 'sms' | 'whatsapp';

/**
 * Email-specific credential configuration
 */
export interface EmailCredential extends Credential {
    type: 'email';
    /** Service hostname */
    host: string;
    /** Service port */
    port: number;
    /** Whether to use secure connection */
    secure: boolean;
} 