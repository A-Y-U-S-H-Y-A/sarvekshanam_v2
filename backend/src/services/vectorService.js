'use strict';

const config = require('../config');
const { getEmbeddingService } = require('./embeddingService');
const { getChunkingService }  = require('./chunkingService');

/**
 * VectorService
 *
 * Pluggable vector database interface for the RAG pipeline.
 * Coordinates embedding generation, chunking, and vector storage/retrieval.
 *
 * Backends: sqlite-vec (default), chromadb
 */
class VectorService {
  constructor() {
    this._backend = null;
    this._initialized = false;
  }

  /**
   * Lazy-initialize the configured backend.
   */
  async _ensureInit() {
    if (this._initialized) return;

    const backendType = config.vectorDbBackend;

    try {
      if (backendType === 'chromadb') {
        const ChromaDBBackend = require('./vectorBackends/chromaDBBackend');
        this._backend = new ChromaDBBackend();
      } else {
        // Default: sqlite-vec
        const SqliteVecBackend = require('./vectorBackends/sqliteVecBackend');
        this._backend = new SqliteVecBackend();
      }

      await this._backend.init();
      this._initialized = true;
      console.log(`[VectorService] Initialized with ${backendType} backend`);
    } catch (err) {
      console.error(`[VectorService] Failed to initialize ${backendType}:`, err.message);
      throw err;
    }
  }

  /**
   * Ingest a document into the vector store.
   * Handles chunking and embedding automatically.
   *
   * @param {string} docId - Unique document identifier (e.g. scan session ID)
   * @param {string} text - Raw text content to ingest
   * @param {object} [opts] - { chunkStrategy: 'fixed'|'sentence', maxTokens, overlap }
   */
  async ingest(docId, text, opts = {}) {
    await this._ensureInit();

    const chunker   = getChunkingService();
    const embedder  = getEmbeddingService();
    const strategy  = opts.chunkStrategy || 'sentence';
    const maxTokens = opts.maxTokens || 500;

    // Step 1: Chunk the text
    let rawChunks;
    switch (strategy) {
      case 'fixed':
        rawChunks = chunker.fixedSize(text, maxTokens, opts.overlap || 50);
        break;
      case 'sentence':
      default:
        rawChunks = chunker.sentenceBoundary(text, maxTokens);
        break;
    }

    if (rawChunks.length === 0) return { docId, chunksIngested: 0 };

    // Step 2: Generate embeddings for all chunks
    const texts = rawChunks.map(c => c.content);
    const embeddings = await embedder.embed(texts);

    // Step 3: Combine chunks with embeddings
    const chunks = rawChunks.map((chunk, i) => ({
      content:       chunk.content,
      embedding:     embeddings[i],
      tokenEstimate: chunk.tokenEstimate,
    }));

    // Step 4: Store in backend
    await this._backend.ingest(docId, chunks);

    return { docId, chunksIngested: chunks.length };
  }

  /**
   * Search the vector store for chunks relevant to a query.
   *
   * @param {string} query - Natural language query
   * @param {number} [topK=5] - Number of results to return
   * @returns {Promise<{ docId: string, chunkIndex: number, content: string, score: number }[]>}
   */
  async search(query, topK = 5, filter = {}) {
    await this._ensureInit();

    const embedder = getEmbeddingService();
    const queryEmbedding = await embedder.embedOne(query);

    return this._backend.search(queryEmbedding, topK, filter);
  }

  /**
   * Delete all chunks for a document.
   * @param {string} docId
   */
  async delete(docId) {
    await this._ensureInit();
    await this._backend.delete(docId);
  }

  /**
   * Get stats about the vector store.
   */
  async stats() {
    await this._ensureInit();
    return this._backend.stats();
  }

  /**
   * Close the backend connection.
   */
  async close() {
    if (this._backend) {
      await this._backend.close();
      this._backend = null;
      this._initialized = false;
    }
  }
}

// Singleton
let _instance = null;
function getVectorService() {
  if (!_instance) _instance = new VectorService();
  return _instance;
}
function _resetVectorService() {
  if (_instance) {
    _instance.close().catch(() => {});
  }
  _instance = null;
}

module.exports = { getVectorService, VectorService, _resetVectorService };
