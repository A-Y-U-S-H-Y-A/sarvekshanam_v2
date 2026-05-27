'use strict';

const dbMod = require('../../src/db/database');
const models = require('../../src/db/models');

describe('database.js Unit Tests', () => {
  it('getDb() returns the models object', () => {
    const db = dbMod.getDb();
    expect(db).toBe(models);
  });

  it('closeDb() calls sequelize.close()', async () => {
    const originalClose = models.sequelize.close;
    models.sequelize.close = jest.fn().mockResolvedValue();
    
    await dbMod.closeDb();
    expect(models.sequelize.close).toHaveBeenCalled();
    
    models.sequelize.close = originalClose;
  });

  it('closeDb() ignores errors', async () => {
    const originalClose = models.sequelize.close;
    models.sequelize.close = jest.fn().mockRejectedValue(new Error('fail'));
    
    await expect(dbMod.closeDb()).resolves.toBeUndefined();
    
    models.sequelize.close = originalClose;
  });

  it('_setDb() exists (no-op)', () => {
    expect(() => dbMod._setDb({})).not.toThrow();
  });

  it('syncDb() calls sequelize.sync({ force: true })', async () => {
    const originalSync = models.sequelize.sync;
    models.sequelize.sync = jest.fn().mockResolvedValue();
    
    await dbMod.syncDb();
    expect(models.sequelize.sync).toHaveBeenCalledWith({ force: true });
    
    models.sequelize.sync = originalSync;
  });
});
