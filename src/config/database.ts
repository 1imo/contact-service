import { Pool } from 'pg';
import { config } from './index';

export const pools = {
    auth: new Pool({
        ...config.db.auth,
        ssl: config.isProduction ? { rejectUnauthorized: false } : false
    }),
    contact: new Pool({
        ...config.db.contact,
        ssl: config.isProduction ? { rejectUnauthorized: false } : false
    })
}; 