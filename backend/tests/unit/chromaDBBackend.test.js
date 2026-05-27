'use strict';

process.env.NODE_ENV = 'test';

const ChromaDBBackend = require('../../src/services/vectorBackends/chromaDBBackend');

describe('ChromaDBBackend Unit Tests', () => {
  let backend;
  let originalFetch;

  beforeEach(() => {
    backend = new ChromaDBBackend({ url: 'http://localhost:8000', collection: 'test', dimensions: 3 });
    originalFetch = global.fetch;
    global.fetch = jest.fn();
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('throws if methods called before init', async () => {
    await expect(backend.stats()).rejects.toThrow('ChromaDBBackend not initialized');
  });

  it('init() sets initialized to true on success', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'collection-id' })
    });
    await backend.init();
    expect(backend._initialized).toBe(true);
    expect(backend._collectionId).toBe('collection-id');
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/api/v1/collections', expect.any(Object));
  });

  it('init() safely ignores multiple calls', async () => {
    backend._initialized = true;
    await backend.init();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('init() throws if creation fails', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad Request'
    });
    await expect(backend.init()).rejects.toThrow('ChromaDB collection creation failed');
  });

  it('init() throws if network error occurs', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    await expect(backend.init()).rejects.toThrow('ChromaDB init failed');
  });

  it('ingest() adds chunks and embeddings', async () => {
    backend._initialized = true;
    backend._collectionId = 'coll-1';
    
    // Mock delete and add
    global.fetch
      .mockResolvedValueOnce({ ok: true }) // delete
      .mockResolvedValueOnce({ ok: true }); // add

    await backend.ingest('doc-1', [
      { content: 'Chunk 1', embedding: [0.1, 0.2, 0.3], tokenEstimate: 2 }
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'http://localhost:8000/api/v1/collections/coll-1/add', expect.any(Object));
  });

  it('ingest() does not call add if chunks are empty', async () => {
    backend._initialized = true;
    backend._collectionId = 'coll-1';
    
    // Mock delete
    global.fetch.mockResolvedValueOnce({ ok: true });

    await backend.ingest('doc-1', []);
    
    expect(global.fetch).toHaveBeenCalledTimes(1); // Only delete called
  });

  it('ingest() throws if add fails', async () => {
    backend._initialized = true;
    
    global.fetch
      .mockResolvedValueOnce({ ok: true }) // delete
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Server error' }); // add

    await expect(backend.ingest('doc-1', [{ content: 'c', embedding: [1] }]))
      .rejects.toThrow('ChromaDB add failed');
  });

  it('search() returns formatted results', async () => {
    backend._initialized = true;
    backend._collectionId = 'coll-1';
    
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ids: [['doc1__chunk_0']],
        metadatas: [[{ doc_id: 'doc1', chunk_index: 0 }]],
        documents: [['content chunk']],
        distances: [[0.1]]
      })
    });

    const results = await backend.search([0.1, 0.2, 0.3], 5);
    
    expect(results).toHaveLength(1);
    expect(results[0].docId).toBe('doc1');
    expect(results[0].distance).toBe(0.1);
    expect(results[0].score).toBe(0.9);
  });

  it('search() throws if query fails', async () => {
    backend._initialized = true;
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad request'
    });
    
    await expect(backend.search([0.1])).rejects.toThrow('ChromaDB query failed');
  });

  it('delete() ignores 404s', async () => {
    backend._initialized = true;
    global.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await backend.delete('doc-2');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('delete() catches network errors', async () => {
    backend._initialized = true;
    global.fetch.mockRejectedValueOnce(new Error('Net error'));
    await backend.delete('doc-2');
    // Should not throw
    expect(global.fetch).toHaveBeenCalled();
  });

  it('stats() returns chunks count', async () => {
    backend._initialized = true;
    backend._collectionId = 'coll-1';
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => 10
    });
    const stats = await backend.stats();
    expect(stats.chunks).toBe(10);
    expect(stats.backend).toBe('chromadb');
  });

  it('stats() returns -1 on error', async () => {
    backend._initialized = true;
    global.fetch.mockRejectedValueOnce(new Error('Error'));
    const stats = await backend.stats();
    expect(stats.chunks).toBe(-1);
    expect(stats.error).toBe('Error');
  });

  it('close() sets initialized to false', async () => {
    backend._initialized = true;
    await backend.close();
    expect(backend._initialized).toBe(false);
  });
});
