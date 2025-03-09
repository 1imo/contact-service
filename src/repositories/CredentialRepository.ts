import { Pool } from 'pg';
import { Credential, CommunicationType } from '../interfaces/Credential';
import { pools } from '../config/database';
import { hash, compare } from 'bcrypt';

/**
 * Repository interface for credential persistence operations
 */
export interface CredentialRepository {
    /** Find a credential by its ID */
    findById(id: string): Promise<Credential | null>;
    /** Validate an API key for a given credential */
    validateApiKey(id: string, apiKey: string): Promise<boolean>;
    /** Find all credentials of a specific type */
    findByType(type: CommunicationType): Promise<Credential[]>;
}

/**
 * PostgreSQL implementation of the CredentialRepository
 */
export class PostgresCredentialRepository implements CredentialRepository {
    private readonly db: Pool;

    /**
     * Creates an instance of PostgresCredentialRepository
     */
    constructor() {
        this.db = pools.auth;  // Using auth database pool
    }

    /**
     * Finds a credential by its ID
     * @param id - Credential ID
     * @returns Promise resolving to the credential if found, null otherwise
     * @throws Error if database query fails
     */
    async findById(id: string): Promise<Credential | null> {
        try {
            const result = await this.db.query(
                'SELECT * FROM credentials WHERE id = $1',
                [id]
            );

            return result.rows[0] ? this.mapToCredential(result.rows[0]) : null;
        } catch (error) {
            throw new Error(`Failed to find credential: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Validates an API key for a given credential
     * @param id - Credential ID
     * @param apiKey - API key to validate
     * @returns Promise resolving to whether the API key is valid
     * @throws Error if database query fails
     */
    async validateApiKey(id: string, apiKey: string): Promise<boolean> {
        try {
            const result = await this.db.query(
                'SELECT api_key FROM credentials WHERE id = $1',
                [id]
            );

            if (!result.rows[0]) return false;
            return compare(apiKey, result.rows[0].api_key);
        } catch (error) {
            throw new Error(`Failed to validate API key: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Finds all credentials of a specific type
     * @param type - Communication type
     * @returns Promise resolving to array of credentials
     * @throws Error if database query fails
     */
    async findByType(type: CommunicationType): Promise<Credential[]> {
        try {
            const result = await this.db.query(
                'SELECT * FROM credentials WHERE type = $1 ORDER BY created_at DESC',
                [type]
            );

            return result.rows.map(row => this.mapToCredential(row));
        } catch (error) {
            throw new Error(`Failed to find credentials by type: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Maps a database row to a Credential object
     * @param row - Database row
     * @returns Credential object
     * @private
     */
    private mapToCredential(row: any): Credential {
        return {
            id: row.id,
            name: row.name,
            type: row.type as CommunicationType,
            apiKey: row.api_key,
            host: row.host,
            port: row.port,
            secure: row.secure,
            username: row.username,
            password: row.password,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
} 