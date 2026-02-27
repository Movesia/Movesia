/**
 * SQLite-backed BaseStore for LangGraph persistent key-value storage.
 *
 * Used by the deepagents StoreBackend to persist /memories/ files
 * across conversations, scoped per Unity project via namespaces.
 *
 * Implements the single abstract method `batch()` from BaseStore.
 * All other methods (get, put, search, delete, listNamespaces) have
 * default implementations that delegate to batch().
 */

import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import {
  BaseStore,
  type Operation,
  type OperationResults,
  type Item,
  type SearchItem,
  type GetOperation,
  type SearchOperation,
  type PutOperation,
  type ListNamespacesOperation,
} from '@langchain/langgraph-checkpoint';

const SEPARATOR = ':';

/**
 * Join a namespace array into a string key.
 */
function joinNamespace(namespace: string[]): string {
  return namespace.join(SEPARATOR);
}

/**
 * Split a namespace string back into an array.
 */
function splitNamespace(ns: string): string[] {
  return ns.split(SEPARATOR);
}

/**
 * Compare a stored value against a filter value.
 * Supports both direct equality and operator-based comparisons ($eq, $ne, $gt, $gte, $lt, $lte).
 */
function compareValues(stored: unknown, filter: unknown): boolean {
  if (filter === null || filter === undefined) {
    return stored === filter;
  }

  // Operator-based comparison
  if (typeof filter === 'object' && filter !== null && !Array.isArray(filter)) {
    const ops = filter as Record<string, unknown>;
    for (const [op, val] of Object.entries(ops)) {
      switch (op) {
        case '$eq':
          if (stored !== val) return false;
          break;
        case '$ne':
          if (stored === val) return false;
          break;
        case '$gt':
          if (typeof stored !== 'number' || typeof val !== 'number' || stored <= val) return false;
          break;
        case '$gte':
          if (typeof stored !== 'number' || typeof val !== 'number' || stored < val) return false;
          break;
        case '$lt':
          if (typeof stored !== 'number' || typeof val !== 'number' || stored >= val) return false;
          break;
        case '$lte':
          if (typeof stored !== 'number' || typeof val !== 'number' || stored > val) return false;
          break;
        default:
          // Unknown operator — treat as no match
          return false;
      }
    }
    return true;
  }

  // Direct equality
  return stored === filter;
}

/**
 * Check if a namespace matches a MatchCondition (prefix or suffix with wildcard support).
 */
function doesMatch(
  condition: { matchType: 'prefix' | 'suffix'; path: (string | '*')[] },
  namespace: string[],
): boolean {
  const { matchType, path } = condition;

  if (matchType === 'prefix') {
    if (namespace.length < path.length) return false;
    return path.every((part, i) => part === '*' || part === namespace[i]);
  }

  if (matchType === 'suffix') {
    if (namespace.length < path.length) return false;
    const offset = namespace.length - path.length;
    return path.every((part, i) => part === '*' || part === namespace[offset + i]);
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQL Statements (prepared lazily)
// ─────────────────────────────────────────────────────────────────────────────

const KV_STORE_SCHEMA = `
CREATE TABLE IF NOT EXISTS kv_store (
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (namespace, key)
);
CREATE INDEX IF NOT EXISTS idx_kv_store_namespace ON kv_store(namespace);
`;

/**
 * SQLite-backed implementation of LangGraph's BaseStore.
 *
 * Uses better-sqlite3's synchronous API (results wrapped in Promise.resolve).
 * Shares the same SQLite database file as the checkpointer and conversation metadata.
 */
export class SqliteStore extends BaseStore {
  private db: BetterSqliteDatabase;

  constructor(db: BetterSqliteDatabase) {
    super();
    this.db = db;
    this.db.exec(KV_STORE_SCHEMA);
  }

  /**
   * Execute a batch of operations.
   *
   * Operation discrimination follows the same pattern as InMemoryStore:
   *   - GetOperation:            has `key` + `namespace`, no `value`
   *   - SearchOperation:         has `namespacePrefix`
   *   - PutOperation:            has `value`
   *   - ListNamespacesOperation: has `matchConditions`
   */
  async batch<Op extends Operation[]>(operations: Op): Promise<OperationResults<Op>> {
    const results: unknown[] = [];

    for (const op of operations) {
      if ('key' in op && 'namespace' in op && !('value' in op)) {
        // GetOperation
        results.push(this.getOp(op as GetOperation));
      } else if ('namespacePrefix' in op) {
        // SearchOperation
        results.push(this.searchOp(op as SearchOperation));
      } else if ('value' in op) {
        // PutOperation
        this.putOp(op as PutOperation);
        results.push(undefined);
      } else if ('matchConditions' in op) {
        // ListNamespacesOperation
        results.push(this.listNamespacesOp(op as ListNamespacesOperation));
      } else {
        results.push(undefined);
      }
    }

    return results as OperationResults<Op>;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Operation handlers
  // ───────────────────────────────────────────────────────────────────────────

  private getOp(op: GetOperation): Item | null {
    const nsKey = joinNamespace(op.namespace);
    const row = this.db
      .prepare('SELECT value, created_at, updated_at FROM kv_store WHERE namespace = ? AND key = ?')
      .get(nsKey, op.key) as { value: string; created_at: string; updated_at: string } | undefined;

    if (!row) return null;

    return {
      value: JSON.parse(row.value),
      key: op.key,
      namespace: op.namespace,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private searchOp(op: SearchOperation): SearchItem[] {
    const prefix = joinNamespace(op.namespacePrefix);
    const pattern = prefix ? `${prefix}${SEPARATOR}%` : '%';

    // Also match exact namespace (not just children)
    let rows: Array<{ namespace: string; key: string; value: string; created_at: string; updated_at: string }>;
    if (prefix) {
      rows = this.db
        .prepare('SELECT namespace, key, value, created_at, updated_at FROM kv_store WHERE namespace = ? OR namespace LIKE ?')
        .all(prefix, pattern) as typeof rows;
    } else {
      rows = this.db
        .prepare('SELECT namespace, key, value, created_at, updated_at FROM kv_store')
        .all() as typeof rows;
    }

    // Convert to items
    let items: SearchItem[] = rows.map((row) => ({
      value: JSON.parse(row.value),
      key: row.key,
      namespace: splitNamespace(row.namespace),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));

    // Apply filter in-memory
    if (op.filter) {
      items = items.filter((item) =>
        Object.entries(op.filter!).every(([key, filterVal]) => compareValues(item.value[key], filterVal)),
      );
    }

    // Sort by updatedAt descending (most recent first)
    items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    // Apply offset and limit
    const offset = op.offset ?? 0;
    const limit = op.limit ?? 10;
    return items.slice(offset, offset + limit);
  }

  private putOp(op: PutOperation): void {
    const nsKey = joinNamespace(op.namespace);
    const now = new Date().toISOString();

    if (op.value === null) {
      // Delete
      this.db.prepare('DELETE FROM kv_store WHERE namespace = ? AND key = ?').run(nsKey, op.key);
    } else {
      // Upsert
      this.db
        .prepare(
          `INSERT INTO kv_store (namespace, key, value, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(namespace, key) DO UPDATE SET
             value = excluded.value,
             updated_at = excluded.updated_at`,
        )
        .run(nsKey, op.key, JSON.stringify(op.value), now, now);
    }
  }

  private listNamespacesOp(op: ListNamespacesOperation): string[][] {
    const rows = this.db.prepare('SELECT DISTINCT namespace FROM kv_store').all() as Array<{ namespace: string }>;

    let namespaces = rows.map((row) => splitNamespace(row.namespace));

    // Apply match conditions
    if (op.matchConditions && op.matchConditions.length > 0) {
      namespaces = namespaces.filter((ns) =>
        op.matchConditions!.every((condition: { matchType: 'prefix' | 'suffix'; path: (string | '*')[] }) =>
          doesMatch(condition, ns),
        ),
      );
    }

    // Apply maxDepth — truncate and deduplicate
    if (op.maxDepth !== undefined) {
      const seen = new Set<string>();
      namespaces = namespaces
        .map((ns) => ns.slice(0, op.maxDepth))
        .filter((ns) => {
          const key = joinNamespace(ns);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }

    // Sort
    namespaces.sort((a, b) => joinNamespace(a).localeCompare(joinNamespace(b)));

    // Apply offset and limit
    const offset = op.offset ?? 0;
    const limit = op.limit ?? namespaces.length;
    return namespaces.slice(offset, offset + limit);
  }
}
