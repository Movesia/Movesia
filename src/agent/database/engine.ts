/**
 * Database engine and connection management using better-sqlite3.
 *
 * Uses better-sqlite3 (native SQLite) for high performance in Electron.
 * LangGraph checkpoints use the official @langchain/langgraph-checkpoint-sqlite
 * package (which also uses better-sqlite3 internally).
 *
 * Single SQLite database for:
 * - Conversation metadata (our table)
 * - LangGraph checkpoints (SqliteSaver tables)
 */

import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { createLogger } from '../UnityConnection/config';
import { CONVERSATIONS_SCHEMA } from './models';

const logger = createLogger('movesia.database');

// Global instances (initialized during startup)
let _db: BetterSqliteDatabase | null = null;
let _checkpointSaver: SqliteSaver | null = null;

// Database path - set from Electron app.getPath('userData')
let _storagePath: string | null = null;
let _dbPath: string | null = null;

/**
 * Set the storage path from Electron's app.getPath('userData').
 * Call this before initializing the database.
 */
export function setStoragePath(path: string): void {
    _storagePath = path;
}

/**
 * Get the path to the SQLite database file.
 *
 * Priority:
 * 1. DATABASE_PATH env var (for testing)
 * 2. Electron storage path (set via setStoragePath)
 * 3. Fallback to temp directory
 */
export function getDatabasePath(): string {
    const envPath = process.env.DATABASE_PATH;
    if (envPath) {
        return envPath;
    }

    if (_storagePath) {
        if (!existsSync(_storagePath)) {
            mkdirSync(_storagePath, { recursive: true });
        }
        return join(_storagePath, 'movesia.db');
    }

    // Fallback: use temp directory
    const tempDir = process.env.TEMP || process.env.TMP || '/tmp';
    const dataDir = join(tempDir, 'movesia-data');

    if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
    }

    logger.warn('No storage path set, using temp directory: ' + dataDir);
    return join(dataDir, 'movesia.db');
}

/**
 * Initialize the database and create tables.
 *
 * Unlike sql.js, better-sqlite3 is synchronous and writes to disk automatically.
 */
export function initDatabase(): BetterSqliteDatabase {
    _dbPath = getDatabasePath();
    logger.info(`Initializing database at: ${_dbPath}`);

    // Ensure directory exists
    const dbDir = dirname(_dbPath);
    if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
    }

    // Open or create database (better-sqlite3 handles both)
    _db = new Database(_dbPath);

    // Enable WAL mode for better concurrent read performance
    _db.pragma('journal_mode = WAL');

    logger.info('Opened database file');

    // Create our tables
    _db.exec(CONVERSATIONS_SCHEMA);
    logger.info('Database tables created/verified');

    // Initialize LangGraph checkpoint saver using the same db file path.
    // SqliteSaver from @langchain/langgraph-checkpoint-sqlite uses better-sqlite3
    // internally and manages its own connection to the same file.
    _checkpointSaver = SqliteSaver.fromConnString(_dbPath);
    logger.info('SqliteSaver initialized (official LangGraph checkpointer)');

    return _db;
}

/**
 * Close database connections gracefully.
 */
export async function closeDatabase(): Promise<void> {
    if (_checkpointSaver) {
        _checkpointSaver = null;
        logger.info('Checkpointer reference released');
    }

    if (_db) {
        _db.close();
        logger.info('Database connection closed');
    }

    _db = null;
}

/**
 * Get the database instance (must call initDatabase first).
 */
export function getDatabase(): BetterSqliteDatabase {
    if (_db === null) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return _db;
}

/**
 * Get the LangGraph checkpoint saver.
 */
export function getCheckpointSaver(): SqliteSaver {
    if (_checkpointSaver === null) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return _checkpointSaver;
}

/**
 * Check if database is initialized.
 */
export function isDatabaseInitialized(): boolean {
    return _db !== null;
}
