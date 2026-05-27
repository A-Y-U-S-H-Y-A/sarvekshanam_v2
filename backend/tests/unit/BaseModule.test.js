'use strict';

process.env.NODE_ENV = 'test';

const BaseModule = require('../../src/modules/base/BaseModule');

describe('BaseModule Unit Tests', () => {
  let mod;

  beforeEach(() => {
    mod = new BaseModule();
  });

  it('meta getter throws error if not implemented', () => {
    expect(() => mod.meta).toThrow('BaseModule must implement get meta()');
  });

  it('run() throws error if not implemented', async () => {
    await expect(mod.run({}, {})).rejects.toThrow('BaseModule must implement run()');
  });

  describe('validate()', () => {
    class TestModule extends BaseModule {
      get meta() {
        return {
          parameters: [
            { name: 'req1', required: true },
            { name: 'opt1', required: false }
          ]
        };
      }
    }

    it('returns empty array if all required params present', () => {
      const tMod = new TestModule();
      const errors = tMod.validate({ req1: 'val' });
      expect(errors).toEqual([]);
    });

    it('returns errors if required params are missing or empty', () => {
      const tMod = new TestModule();
      const err1 = tMod.validate({});
      expect(err1).toEqual(['Parameter "req1" is required']);

      const err2 = tMod.validate({ req1: '' });
      expect(err2).toEqual(['Parameter "req1" is required']);

      const err3 = tMod.validate({ req1: null });
      expect(err3).toEqual(['Parameter "req1" is required']);
    });
  });

  describe('_result()', () => {
    it('returns formatted result object', () => {
      const res = mod._result('success', 'done', { a: 1 });
      expect(res.status).toBe('success');
      expect(res.output).toBe('done');
      expect(res.raw).toEqual({ a: 1 });
      expect(res.timestamp).toBeDefined();
    });
  });
});
