'use strict';

const config = require('../../config');

/**
 * ChromaDBBackend
 *
 * HTTP client for ChromaDB vector database instance.
 * Communicates via the ChromaDB REST API.
 */
class ChromaDBBackend {
  constructor(opts = {}) {
    this._baseUrl = opts.url || config.vectorDbUrl;
    this._collection = opts.collection || 'sarvekshanam_chunks';
    this._dims = opts.dimensions || config.embeddingDims;
    this._initialized = false;
  }

  /**
   * Initialize — ensure collection exists in ChromaDB.
   */
  async init() {
    if (this._initialized) return;

    try {
      // Create or get collection
      const resp = await fetch(`${this._baseUrl}/api/v1/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this._collection,
          metadata: { 'hnsw:space': 'cosine' },
          get_or_create: true,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`ChromaDB collection creation failed: ${resp.status} ${text}`);
      }

      const data = await resp.json();
      this._collectionId = data.id;
      this._initialized = true;
    } catch (err) {
      console.error('[ChromaDBBackend] Failed to initialize:', err.message);
      throw new Error(`ChromaDB init failed: ${err.message}. Is ChromaDB running at ${this._baseUrl}?`);
    }
  }

  /**
   * Ingest document chunks with their embeddings.
   * @param {string} docId
   * @param {{ content: string, embedding: number[], tokenEstimate?: number }[]} chunks
   */
  async ingest(docId, chunks) {
    this._ensureInit();

    // Delete existing chunks for this docId first
    await this.delete(docId);

    if (chunks.length === 0) return;

    const ids        = chunks.map((_, i) => `${docId}__chunk_${i}`);
    const embeddings = chunks.map(c => c.embedding);
    const documents  = chunks.map(c => c.content);
    const metadatas  = chunks.map((c, i) => ({
      doc_id:        docId,
      chunk_index:   i,
      total_chunks:  chunks.length,
      token_estimate: c.tokenEstimate || 0,
    }));

    const resp = await fetch(
      `${this._baseUrl}/api/v1/collections/${this._collectionId}/add`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, embeddings, documents, metadatas }),
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`ChromaDB add failed: ${resp.status} ${text}`);
    }
  }

  /**
   * Search for similar chunks.
   * @param {number[]} queryEmbedding
   * @param {number} [topK=5]
   * @returns {Promise<{ docId: string, chunkIndex: number, content: string, distance: number, score: number }[]>}
   */
  async search(queryEmbedding, topK = 5, filter = {}) {
    this._ensureInit();

    const resp = await fetch(
      `${this._baseUrl}/api/v1/collections/${this._collectionId}/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_embeddings: [queryEmbedding],
          n_results: topK,
          include: ['documents', 'metadatas', 'distances'],
          ...(filter.docIds && filter.docIds.length > 0 ? { where: { doc_id: { $in: filter.docIds } } } : {})
        }),
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`ChromaDB query failed: ${resp.status} ${text}`);
    }

    const data = await resp.json();
    const results = [];

    if (data.ids && data.ids[0]) {
      for (let i = 0; i < data.ids[0].length; i++) {
        const meta = data.metadatas?.[0]?.[i] || {};
        const distance = data.distances?.[0]?.[i] ?? 1;
        results.push({
          docId:      meta.doc_id || data.ids[0][i],
          chunkIndex: meta.chunk_index ?? i,
          content:    data.documents?.[0]?.[i] || '',
          distance,
          score:      1 - distance,
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

    try {
      const resp = await fetch(
        `${this._baseUrl}/api/v1/collections/${this._collectionId}/delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            where: { doc_id: docId },
          }),
        }
      );
      // Ignore 404s — document may not exist yet
      if (!resp.ok && resp.status !== 404) {
        const text = await resp.text();
        console.warn(`[ChromaDBBackend] Delete warning: ${resp.status} ${text}`);
      }
    } catch (err) {
      console.warn('[ChromaDBBackend] Delete error:', err.message);
    }
  }

  /**
   * Get stats about the vector store.
   */
  async stats() {
    this._ensureInit();

    try {
      const resp = await fetch(
        `${this._baseUrl}/api/v1/collections/${this._collectionId}/count`
      );
      const count = resp.ok ? await resp.json() : 0;
      return {
        backend: 'chromadb',
        chunks: count,
        dimensions: this._dims,
        url: this._baseUrl,
        collection: this._collection,
      };
    } catch (err) {
      return {
        backend: 'chromadb',
        chunks: -1,
        error: err.message,
      };
    }
  }

  /**
   * Close — no-op for HTTP client.
   */
  async close() {
    this._initialized = false;
  }

  _ensureInit() {
    if (!this._initialized) {
      throw new Error('ChromaDBBackend not initialized. Call init() first.');
    }
  }
}

module.exports = ChromaDBBackend;
