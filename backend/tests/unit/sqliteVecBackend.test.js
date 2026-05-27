'use strict';

process.env.NODE_ENV = 'test';

const SqliteVecBackend = require('../../src/services/vectorBackends/sqliteVecBackend');

jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => {
    const mockExec = jest.fn();
    const mockPrepareGet = jest.fn();
    const mockPrepareAll = jest.fn();
    const mockPrepareRun = jest.fn();

    return {
      exec: mockExec,
      prepare: jest.fn((sql) => {
        return {
          get: mockPrepareGet.mockReturnValue({ count: 1, doc_id: 'doc1', chunk_index: 0, content: 'text', token_estimate: 5 }),
          all: mockPrepareAll.mockReturnValue([{ rowid: 1, distance: 0.1 }]),
          run: mockPrepareRun.mockReturnValue({ lastInsertRowid: 1 })
        };
      }),
      transaction: jest.fn((fn) => fn),
      close: jest.fn(),
      
      // exposes for assertions in test
      mockExec,
      mockPrepareGet,
      mockPrepareAll,
      mockPrepareRun
    };
  });
});

jest.mock('sqlite-vec', () => ({
  load: jest.fn()
}));

describe('SqliteVecBackend Unit Tests', () => {
  let backend;

  beforeEach(() => {
    backend = new SqliteVecBackend({ dbPath: ':memory:', dimensions: 3 });
  });

  afterEach(async () => {
    if (backend._db) {
      await backend.close();
    }
    jest.clearAllMocks();
  });

  it('throws if methods called before init', async () => {
    await expect(backend.stats()).rejects.toThrow('SqliteVecBackend not initialized');
  });

  it('init() loads sqlite-vec and creates tables', async () => {
    await backend.init();
    expect(backend._db).toBeDefined();
    expect(require('sqlite-vec').load).toHaveBeenCalledWith(backend._db);
    expect(backend._db.mockExec).toHaveBeenCalledTimes(3); // meta, index, vec0
  });

  it('init() safely ignores multiple calls', async () => {
    await backend.init();
    await backend.init();
    expect(backend._db.mockExec).toHaveBeenCalledTimes(3);
  });

  it('ingest() replaces old chunks and inserts new ones', async () => {
    await backend.init();
    
    // override prepare to return row count for delete
    backend._db.prepare.mockImplementation((sql) => {
      if (sql.includes('SELECT rowid')) return { all: () => [{ rowid: 1 }] };
      if (sql.includes('DELETE FROM')) return { run: jest.fn() };
      return { run: () => ({ lastInsertRowid: 1 }) };
    });

    await backend.ingest('doc-1', [
      { content: 'Chunk 1', embedding: [0.1, 0.2, 0.3], tokenEstimate: 2 }
    ]);

    expect(backend._db.transaction).toHaveBeenCalled();
  });

  it('search() returns formatted results with similarity scores', async () => {
    await backend.init();
    
    // prepare mock already returns rowid=1, distance=0.1
    const results = await backend.search([0.1, 0.2, 0.3], 5);
    
    expect(results).toHaveLength(1);
    expect(results[0].docId).toBe('doc1');
    expect(results[0].distance).toBe(0.1);
    expect(results[0].score).toBe(0.9); // 1 - 0.1
  });

  it('delete() removes vector and meta rows', async () => {
    await backend.init();
    
    const mockAll = jest.fn().mockReturnValue([{ rowid: 1 }]);
    const mockRun = jest.fn();
    backend._db.prepare.mockImplementation((sql) => {
      if (sql.includes('SELECT rowid')) return { all: mockAll };
      return { run: mockRun };
    });

    await backend.delete('doc-2');
    
    expect(mockAll).toHaveBeenCalledWith('doc-2');
    expect(mockRun).toHaveBeenCalledTimes(2); // once for vec, once for meta
  });

  it('delete() skips if no rows found', async () => {
    await backend.init();
    
    const mockAll = jest.fn().mockReturnValue([]);
    backend._db.prepare.mockImplementation((sql) => {
      if (sql.includes('SELECT rowid')) return { all: mockAll };
      return { run: jest.fn() };
    });

    await backend.delete('doc-3');
    expect(backend._db.transaction).not.toHaveBeenCalled();
  });

  it('stats() returns document and chunk counts', async () => {
    await backend.init();
    const stats = await backend.stats();
    expect(stats.backend).toBe('sqlite-vec');
    expect(stats.documents).toBe(1);
    expect(stats.chunks).toBe(1);
    expect(stats.dimensions).toBe(3);
  });

  it('close() clears the db instance', async () => {
    await backend.init();
    await backend.close();
    expect(backend._db).toBeNull();
  });
});
