'use strict';

const { getChunkingService } = require('../../src/services/chunkingService');

const mockInvoke = jest.fn().mockImplementation(async ({ messages }) => {
  const content = messages.find(m => m.role === 'user').content;
  return `Summary of: ${content.substring(0, 10)}`;
});

// Mock aiService for llmSummary tests
jest.mock('../../src/services/aiService', () => ({
  getAIService: () => ({
    invoke: mockInvoke
  })
}));

describe('ChunkingService Unit Tests', () => {
  let chunkingService;

  beforeEach(() => {
    chunkingService = getChunkingService();
  });

  describe('estimateTokens', () => {
    it('should estimate tokens correctly using chars/4 heuristic', () => {
      expect(chunkingService.estimateTokens('1234')).toBe(1);
      expect(chunkingService.estimateTokens('12345')).toBe(2);
      expect(chunkingService.estimateTokens('')).toBe(0);
      expect(chunkingService.estimateTokens(null)).toBe(0);
    });
  });

  describe('fixedSize', () => {
    it('should handle empty input', () => {
      expect(chunkingService.fixedSize('')).toEqual([]);
      expect(chunkingService.fixedSize('   ')).toEqual([]);
      expect(chunkingService.fixedSize(null)).toEqual([]);
    });

    it('should chunk text based on maxTokens and overlap', () => {
      const text = '1234567890';
      // maxTokens = 1 -> 4 chars, overlap = 0 -> 0 chars
      const chunks = chunkingService.fixedSize(text, 1, 0);
      expect(chunks.length).toBe(3);
      expect(chunks[0].content).toBe('1234');
      expect(chunks[1].content).toBe('5678');
      expect(chunks[2].content).toBe('90');
    });

    it('should include overlap between chunks', () => {
      const text = 'abcdefghijklmno';
      // maxTokens = 2 -> 8 chars, overlap = 1 -> 4 chars
      // Chunk 1: abcdefgh
      // Chunk 2: efghijkl
      // Chunk 3: ijklmno
      const chunks = chunkingService.fixedSize(text, 2, 1);
      expect(chunks.length).toBe(4);
      expect(chunks[0].content).toBe('abcdefgh');
      expect(chunks[1].content).toBe('efghijkl');
      expect(chunks[2].content).toBe('ijklmno');
      expect(chunks[3].content).toBe('mno');
    });
  });

  describe('sentenceBoundary', () => {
    it('should handle empty input', () => {
      expect(chunkingService.sentenceBoundary('')).toEqual([]);
      expect(chunkingService.sentenceBoundary('   ')).toEqual([]);
      expect(chunkingService.sentenceBoundary(null)).toEqual([]);
    });

    it('should group sentences up to maxTokens', () => {
      const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
      // maxTokens = 6 -> 24 chars
      const chunks = chunkingService.sentenceBoundary(text, 6);
      
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].content.length).toBeLessThanOrEqual(24);
    });

    it('should fallback to fixedSize for extremely long sentences', () => {
      const text = 'A'.repeat(50) + '.';
      // maxTokens = 5 -> 20 chars
      const chunks = chunkingService.sentenceBoundary(text, 5);
      
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].content.length).toBeLessThanOrEqual(20);
    });
  });

  describe('llmSummary', () => {
    it('should handle empty input', async () => {
      expect(await chunkingService.llmSummary('')).toEqual([]);
      expect(await chunkingService.llmSummary('   ')).toEqual([]);
      expect(await chunkingService.llmSummary(null)).toEqual([]);
    });

    it('should summarize text sections', async () => {
      const text = 'This is a test. We need to summarize it.';
      const chunks = await chunkingService.llmSummary(text);
      expect(chunks.length).toBe(1);
      expect(chunks[0].content).toContain('Summary of: This is a ');
      expect(chunks[0].tokenEstimate).toBeGreaterThan(0);
    });

    it('should fallback to sentenceBoundary if AI service throws', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('AI Failed'));
      
      const text = 'First sentence. Second sentence.';
      const chunks = await chunkingService.llmSummary(text);
      
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].content).toBe('First sentence. Second sentence.');
    });
  });

  describe('customScript', () => {
    it('should handle empty input', async () => {
      expect(await chunkingService.customScript('', 'dummyPath')).toEqual([]);
    });

    it('should use custom script if it exports a valid function', async () => {
      jest.mock('dummy-script', () => {
        return (text) => [text.substring(0, 5), text.substring(5)];
      }, { virtual: true });

      const chunks = await chunkingService.customScript('helloworld', 'dummy-script');
      expect(chunks.length).toBe(2);
      expect(chunks[0].content).toBe('hello');
      expect(chunks[1].content).toBe('world');
    });

    it('should fallback to fixedSize if custom script fails or invalid', async () => {
      jest.mock('bad-script', () => ({ notAFunction: true }), { virtual: true });
      
      const chunks = await chunkingService.customScript('12345', 'bad-script');
      // Should fallback to fixedSize, maxTokens=500 -> 2000 chars, so 1 chunk
      expect(chunks.length).toBe(1);
      expect(chunks[0].content).toBe('12345');
    });
  });
});
