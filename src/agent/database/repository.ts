/**
 * Database repository for conversation metadata.
 *
 * Uses better-sqlite3 for database operations.
 * Messages and tool executions are handled by LangGraph's checkpointer.
 * This only manages thread/conversation metadata for listing and search.
 */

import { createLogger } from '../UnityConnection/config';
import { getDatabase } from './engine';
import {
    type Conversation,
    createConversation,
    rowToConversation,
} from './models';

const logger = createLogger('movesia.database');

/**
 * Repository for conversation metadata operations.
 */
export class ConversationRepository {
    /**
     * Get an existing conversation or create a new one.
     *
     * Called when a chat session starts to ensure we have metadata.
     */
    async getOrCreate(
        sessionId: string,
        options: {
            unityProjectPath?: string | null;
            unityVersion?: string | null;
        } = {}
    ): Promise<Conversation> {
        const db = getDatabase();

        // Try to get existing
        const existing = db.prepare(
            'SELECT * FROM conversations WHERE session_id = ?'
        ).get(sessionId) as Record<string, unknown> | undefined;

        if (existing) {
            // Update metadata if provided
            const updates: string[] = [];
            const values: unknown[] = [];

            if (options.unityProjectPath && !existing.unity_project_path) {
                updates.push('unity_project_path = ?');
                values.push(options.unityProjectPath);
            }
            if (options.unityVersion && !existing.unity_version) {
                updates.push('unity_version = ?');
                values.push(options.unityVersion);
            }

            if (updates.length > 0) {
                updates.push('updated_at = ?');
                values.push(new Date().toISOString());
                values.push(sessionId);

                db.prepare(
                    `UPDATE conversations SET ${updates.join(', ')} WHERE session_id = ?`
                ).run(...values);
            }

            return rowToConversation(existing);
        }

        // Create new
        const conversation = createConversation(sessionId, {
            unityProjectPath: options.unityProjectPath,
            unityVersion: options.unityVersion,
        });

        db.prepare(`
            INSERT INTO conversations (id, session_id, title, unity_project_path, unity_version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            conversation.id,
            conversation.sessionId,
            conversation.title,
            conversation.unityProjectPath,
            conversation.unityVersion,
            conversation.createdAt.toISOString(),
            conversation.updatedAt.toISOString()
        );

        logger.info(`Created conversation: ${conversation.id.slice(0, 8)} for session ${sessionId.slice(0, 8)}`);
        return conversation;
    }

    /**
     * Get a conversation by session_id.
     */
    async get(sessionId: string): Promise<Conversation | null> {
        const db = getDatabase();
        const row = db.prepare(
            'SELECT * FROM conversations WHERE session_id = ?'
        ).get(sessionId) as Record<string, unknown> | undefined;

        return row ? rowToConversation(row) : null;
    }

    /**
     * List conversations, ordered by most recently updated.
     */
    async listAll(limit: number = 50, offset: number = 0): Promise<Conversation[]> {
        const db = getDatabase();
        const rows = db.prepare(`
            SELECT * FROM conversations
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset) as Record<string, unknown>[];

        return rows.map(rowToConversation);
    }

    /**
     * Update conversation title (auto-generated from first user message).
     */
    async updateTitle(sessionId: string, title: string): Promise<void> {
        const db = getDatabase();
        db.prepare(`
            UPDATE conversations
            SET title = ?, updated_at = ?
            WHERE session_id = ?
        `).run(title.slice(0, 500), new Date().toISOString(), sessionId);
    }

    /**
     * Update the updated_at timestamp (call on each message).
     */
    async touch(sessionId: string): Promise<void> {
        const db = getDatabase();
        db.prepare(`
            UPDATE conversations
            SET updated_at = ?
            WHERE session_id = ?
        `).run(new Date().toISOString(), sessionId);
    }

    /**
     * Delete a conversation. Returns true if deleted.
     */
    async delete(sessionId: string): Promise<boolean> {
        const db = getDatabase();
        const result = db.prepare(
            'DELETE FROM conversations WHERE session_id = ?'
        ).run(sessionId);

        return result.changes > 0;
    }

    /**
     * Count total conversations.
     */
    async count(): Promise<number> {
        const db = getDatabase();
        const result = db.prepare(
            'SELECT COUNT(*) as count FROM conversations'
        ).get() as { count: number };

        return result.count;
    }

    /**
     * Search conversations by title.
     */
    async search(query: string, limit: number = 20): Promise<Conversation[]> {
        const db = getDatabase();
        const rows = db.prepare(`
            SELECT * FROM conversations
            WHERE title LIKE ?
            ORDER BY updated_at DESC
            LIMIT ?
        `).all(`%${query}%`, limit) as Record<string, unknown>[];

        return rows.map(rowToConversation);
    }
}

// Global repository instance
let _repository: ConversationRepository | null = null;

/**
 * Get the global repository instance.
 */
export function getRepository(): ConversationRepository {
    if (_repository === null) {
        _repository = new ConversationRepository();
    }
    return _repository;
}
