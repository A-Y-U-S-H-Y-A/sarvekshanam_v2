'use strict';

/**
 * ChunkingService
 *
 * Splits text into smaller chunks suitable for embedding and vector storage.
 * Strategies: fixedSize, sentenceBoundary, llmSummary, customScript.
 */
class ChunkingService {
  /**
   * Split text into chunks of approximately maxTokens tokens.
   * Uses chars/4 heuristic for token estimation.
   *
   * @param {string} text
   * @param {number} [maxTokens=500] - Max tokens per chunk
   * @param {number} [overlap=50] - Overlap tokens between chunks
   * @returns {{ content: string, tokenEstimate: number }[]}
   */
  fixedSize(text, maxTokens = 500, overlap = 50) {
    if (!text || !text.trim()) return [];

    const maxChars = maxTokens * 4;
    const overlapChars = overlap * 4;
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + maxChars, text.length);
      const content = text.slice(start, end).trim();
      if (content) {
        chunks.push({
          content,
          tokenEstimate: Math.ceil(content.length / 4),
        });
      }
      // Advance by (maxChars - overlapChars) to create overlap
      start += maxChars - overlapChars;
      if (start >= text.length) break;
    }

    return chunks;
  }

  /**
   * Split text at sentence boundaries, grouping sentences until maxTokens is reached.
   * Respects sentence structure for more coherent chunks.
   *
   * @param {string} text
   * @param {number} [maxTokens=500]
   * @returns {{ content: string, tokenEstimate: number }[]}
   */
  sentenceBoundary(text, maxTokens = 500) {
    if (!text || !text.trim()) return [];

    const maxChars = maxTokens * 4;
    // Split on sentence-ending punctuation followed by whitespace
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
    const chunks = [];
    let currentChunk = [];
    let currentLen = 0;

    for (const sentence of sentences) {
      const sentLen = sentence.length;

      // If a single sentence exceeds maxChars, split it with fixedSize
      if (sentLen > maxChars) {
        // Flush current chunk first
        if (currentChunk.length > 0) {
          const content = currentChunk.join(' ').trim();
          chunks.push({ content, tokenEstimate: Math.ceil(content.length / 4) });
          currentChunk = [];
          currentLen = 0;
        }
        // Split the oversized sentence
        chunks.push(...this.fixedSize(sentence, maxTokens, 0));
        continue;
      }

      if (currentLen + sentLen > maxChars && currentChunk.length > 0) {
        // Flush current chunk
        const content = currentChunk.join(' ').trim();
        chunks.push({ content, tokenEstimate: Math.ceil(content.length / 4) });
        currentChunk = [];
        currentLen = 0;
      }

      currentChunk.push(sentence);
      currentLen += sentLen + 1; // +1 for space
    }

    // Flush remaining
    if (currentChunk.length > 0) {
      const content = currentChunk.join(' ').trim();
      if (content) {
        chunks.push({ content, tokenEstimate: Math.ceil(content.length / 4) });
      }
    }

    return chunks;
  }

  /**
   * Use an LLM to produce summaries of text sections.
   * Falls back to sentenceBoundary if no AI service is available.
   *
   * @param {string} text
   * @param {object} [opts] - { provider, model }
   * @returns {Promise<{ content: string, tokenEstimate: number }[]>}
   */
  async llmSummary(text, opts = {}) {
    if (!text || !text.trim()) return [];

    try {
      const { getAIService } = require('./aiService');
      const ai = getAIService();

      // First split into manageable sections
      const sections = this.sentenceBoundary(text, 1000);
      const chunks = [];

      for (const section of sections) {
        const response = await ai.invoke({
          provider: opts.provider || 'groq',
          model:    opts.model || 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: 'Summarize the following text concisely, preserving key technical details. Respond with only the summary.' },
            { role: 'user', content: section.content },
          ],
        });
        chunks.push({
          content: response,
          tokenEstimate: Math.ceil(response.length / 4),
        });
      }

      return chunks;
    } catch (err) {
      console.warn('[ChunkingService] LLM summary failed, falling back to sentenceBoundary:', err.message);
      return this.sentenceBoundary(text);
    }
  }

  /**
   * Use a custom script to chunk text.
   * The script must export a function: (text) => string[]
   *
   * @param {string} text
   * @param {string} scriptPath - Absolute path to the chunking script
   * @returns {Promise<{ content: string, tokenEstimate: number }[]>}
   */
  async customScript(text, scriptPath) {
    if (!text || !text.trim()) return [];

    try {
      const chunker = require(scriptPath);
      if (typeof chunker !== 'function') {
        throw new Error('Custom chunking script must export a function');
      }
      const rawChunks = await chunker(text);
      return rawChunks.map(content => ({
        content,
        tokenEstimate: Math.ceil(content.length / 4),
      }));
    } catch (err) {
      console.warn('[ChunkingService] Custom script failed, falling back to fixedSize:', err.message);
      return this.fixedSize(text);
    }
  }

  /**
   * Estimate token count for a text string.
   * Uses chars/4 heuristic (close to tiktoken for English).
   * @param {string} text
   * @returns {number}
   */
  estimateTokens(text) {
    return Math.ceil((text || '').length / 4);
  }
}

// Singleton
let _instance = null;
function getChunkingService() {
  if (!_instance) _instance = new ChunkingService();
  return _instance;
}
function _resetChunkingService() { _instance = null; }

module.exports = { getChunkingService, ChunkingService, _resetChunkingService };
