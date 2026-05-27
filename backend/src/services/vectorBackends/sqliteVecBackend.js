'use strict';

const path   = require('path');
const config = require('../../config');

/**
 * SqliteVecBackend
 *
 * Uses better-sqlite3 + sqlite-vec extension for local vector storage.
 * Stores embeddings in a virtual vec0 table with cosine distance search.
 */
class SqliteVecBackend {
  constructor(opts = {}) {
    this._db = null;
    this._dbPath = opts.dbPath || config.vectorDbPath;
    this._dims = opts.dimensions || config.embeddingDims;
    this._tableName = 'vec_chunks';
    this._metaTableName = 'vec_metadata';
  }

  /**
   * Initialize the database and load sqlite-vec extension.
   * Call this before any other operations.
   */
  async init() {
    if (this._db) return;

    try {
      const Database = require('better-sqlite3');
      const sqliteVec = require('sqlite-vec');

      // For tests, use in-memory; otherwise use configured path
      const dbPath = config.isTest() ? ':memory:' : this._dbPath;
      this._db = new Database(dbPath);
      sqliteVec.load(this._db);

      // Create metadata table (regular table for chunk text + metadata)
      this._db.exec(`
        CREATE TABLE IF NOT EXISTS ${this._metaTableName} (
          rowid INTEGER PRIMARY KEY AUTOINCREMENT,
          doc_id TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          total_chunks INTEGER NOT NULL,
          content TEXT NOT NULL,
          token_estimate INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      // Create index on doc_id for fast lookups
      this._db.exec(`
        CREATE INDEX IF NOT EXISTS idx_vec_meta_doc_id ON ${this._metaTableName}(doc_id)
      `);

      // Create vector virtual table using vec0
      this._db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${this._tableName} USING vec0(
          embedding float[${this._dims}]
        )
      `);
    } catch (err) {
      console.error('[SqliteVecBackend] Failed to initialize:', err.message);
      throw new Error(`SqliteVecBackend init failed: ${err.message}. Ensure better-sqlite3 and sqlite-vec are installed.`);
    }
  }

  /**
   * Ingest document chunks with their embeddings.
   * @param {string} docId - Unique document identifier
   * @param {{ content: string, embedding: number[], tokenEstimate?: number }[]} chunks
   */
  async ingest(docId, chunks) {
    this._ensureInit();

    // Delete existing data for this docId (upsert behavior)
    await this.delete(docId);

    const insertVec = this._db.prepare(`
      INSERT INTO ${this._tableName} (embedding)
      VALUES (?)
    `);

    const insertMeta = this._db.prepare(`
      INSERT INTO ${this._metaTableName} (rowid, doc_id, chunk_index, total_chunks, content, token_estimate)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this._db.transaction(() => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const vecResult = insertVec.run(JSON.stringify(chunk.embedding));
        const rowid = Number(vecResult.lastInsertRowid);

        insertMeta.run(
          rowid, docId, i, chunks.length, chunk.content, chunk.tokenEstimate || 0
        );
      }
    });

    transaction();
  }

  /**
   * Search for similar chunks using cosine distance.
   * @param {number[]} queryEmbedding
   * @param {number} [topK=5]
   * @returns {Promise<{ docId: string, chunkIndex: number, content: string, distance: number }[]>}
   */
  async search(queryEmbedding, topK = 5, filter = {}) {
    this._ensureInit();

    const queryBuf = new Float32Array(queryEmbedding);

    let rows;
    if (filter.docIds && filter.docIds.length > 0) {
      const placeholders = filter.docIds.map(() => '?').join(',');
      rows = this._db.prepare(`
        SELECT
          v.rowid,
          v.distance
        FROM ${this._tableName} v
        WHERE v.embedding MATCH ?
          AND v.rowid IN (SELECT rowid FROM ${this._metaTableName} WHERE doc_id IN (${placeholders}))
        ORDER BY v.distance
        LIMIT ?
      `).all(queryBuf, ...filter.docIds, topK);
    } else {
      rows = this._db.prepare(`
        SELECT
          v.rowid,
          v.distance
        FROM ${this._tableName} v
        WHERE v.embedding MATCH ?
        ORDER BY v.distance
        LIMIT ?
      `).all(queryBuf, topK);
    }

    // Join with metadata
    const results = [];
    const getMeta = this._db.prepare(`
      SELECT doc_id, chunk_index, content, token_estimate FROM ${this._metaTableName} WHERE rowid = ?
    `);

    for (const row of rows) {
      const meta = getMeta.get(row.rowid);
      if (meta) {
        results.push({
          docId:      meta.doc_id,
          chunkIndex: meta.chunk_index,
          content:    meta.content,
          distance:   row.distance,
          score:      1 - row.distance, // Convert distance to similarity score
        });
      }
    }

    return results;
  }

  /**
   * Delete all chunks for a document.
   * @param {string} docId
   */
  async delete(docId) {
    this._ensureInit();

    // Get rowids for this doc
    const rows = this._db.prepare(
      `SELECT rowid FROM ${this._metaTableName} WHERE doc_id = ?`
    ).all(docId);

    if (rows.length === 0) return;

    const deleteVec = this._db.prepare(
      `DELETE FROM ${this._tableName} WHERE rowid = ?`
    );
    const deleteMeta = this._db.prepare(
      `DELETE FROM ${this._metaTableName} WHERE doc_id = ?`
    );

    this._db.transaction(() => {
      for (const row of rows) {
        deleteVec.run(row.rowid);
      }
      deleteMeta.run(docId);
    })();
  }

  /**
   * Get stats about the vector store.
   */
  async stats() {
    this._ensureInit();
    const docCount = this._db.prepare(
      `SELECT COUNT(DISTINCT doc_id) as count FROM ${this._metaTableName}`
    ).get();
    const chunkCount = this._db.prepare(
      `SELECT COUNT(*) as count FROM ${this._metaTableName}`
    ).get();
    return {
      backend: 'sqlite-vec',
      documents: docCount.count,
      chunks: chunkCount.count,
      dimensions: this._dims,
    };
  }

  /**
   * Close the database connection.
   */
  async close() {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }

  _ensureInit() {
    if (!this._db) {
      throw new Error('SqliteVecBackend not initialized. Call init() first.');
    }
  }
}

module.exports = SqliteVecBackend;
