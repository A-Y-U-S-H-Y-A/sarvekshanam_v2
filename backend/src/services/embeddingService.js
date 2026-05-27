'use strict';

const config = require('../config');

/**
 * EmbeddingService
 *
 * Generates vector embeddings from text using configured LLM providers.
 * Supports: OpenAI, Ollama, and a simple hash-based fallback for testing.
 */
class EmbeddingService {
  constructor() {
    this._dimensions = config.embeddingDims;
  }

  get dimensions() {
    return this._dimensions;
  }

  /**
   * Generate embeddings for one or more texts.
   * @param {string[]} texts
   * @returns {Promise<number[][]>} Array of embedding vectors
   */
  async embed(texts) {
    if (!texts.length) return [];

    // Determine provider from embedding model name
    if (config.embeddingModel.startsWith('text-embedding') || config.embeddingModel.startsWith('ada')) {
      return this._embedOpenAI(texts);
    }

    // Try Ollama for any other model name
    if (config.ollamaBaseUrl) {
      return this._embedOllama(texts);
    }

    // Fallback: deterministic hash-based embeddings (for testing / no-API scenarios)
    return texts.map(t => this._hashEmbed(t));
  }

  /**
   * Generate embedding for a single text.
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async embedOne(text) {
    const results = await this.embed([text]);
    return results[0];
  }

  // ── OpenAI Embeddings ───────────────────────────────────────────────────

  async _embedOpenAI(texts) {
    if (!config.openaiApiKey || config.openaiApiKey.includes('mock')) {
      console.warn('[EmbeddingService] No valid OPENAI_API_KEY set (mock detected), falling back to hash embeddings');
      return texts.map(t => this._hashEmbed(t));
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: config.embeddingModel,
          input: texts,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI embeddings API error: ${response.status} ${err}`);
      }

      const data = await response.json();
      // Sort by index to ensure correct ordering
      const sorted = data.data.sort((a, b) => a.index - b.index);
      this._dimensions = sorted[0].embedding.length;
      return sorted.map(d => d.embedding);
    } catch (err) {
      console.error('[EmbeddingService] OpenAI error:', err.message);
      return texts.map(t => this._hashEmbed(t));
    }
  }

  // ── Ollama Embeddings ───────────────────────────────────────────────────

  async _embedOllama(texts) {
    try {
      // Ollama embedding API processes one text at a time
      const results = [];
      for (const text of texts) {
        const response = await fetch(`${config.ollamaBaseUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: config.embeddingModel,
            prompt: text,
          }),
        });

        if (!response.ok) {
          throw new Error(`Ollama embeddings error: ${response.status}`);
        }

        const data = await response.json();
        results.push(data.embedding);
      }
      if (results.length > 0) {
        this._dimensions = results[0].length;
      }
      return results;
    } catch (err) {
      console.error('[EmbeddingService] Ollama error:', err.message);
      return texts.map(t => this._hashEmbed(t));
    }
  }

  // ── Hash-based fallback (deterministic, for testing) ────────────────────

  /**
   * Generates a deterministic pseudo-embedding from text using a simple hash.
   * NOT suitable for semantic search — only for testing and structure validation.
   * @param {string} text
   * @returns {number[]}
   */
  _hashEmbed(text) {
    // Ensure text is a string to prevent loop bound injection, and cap length
    const safeText = String(text).substring(0, 100000);

    const dims = this._dimensions;
    const vec = new Float64Array(dims);
    let hash = 0;
    const len = safeText.length;
    for (let i = 0; i < len; i++) {
      hash = ((hash << 5) - hash + safeText.charCodeAt(i)) | 0;
    }
    // Use hash as seed for deterministic pseudo-random vector
    let seed = Math.abs(hash);
    for (let i = 0; i < dims; i++) {
      seed = (seed * 16807 + 0) % 2147483647;
      vec[i] = (seed / 2147483647) * 2 - 1; // range [-1, 1]
    }
    // Normalize to unit length
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < dims; i++) vec[i] /= norm;
    }
    return Array.from(vec);
  }
}

// Singleton
let _instance = null;
function getEmbeddingService() {
  if (!_instance) _instance = new EmbeddingService();
  return _instance;
}
function _resetEmbeddingService() { _instance = null; }

module.exports = { getEmbeddingService, EmbeddingService, _resetEmbeddingService };
