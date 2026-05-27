'use strict';

const db = require('../../src/db/models');

/**
 * Creates an isolated in-memory SQLite database with migrations applied.
 * Use in test files – each call returns a fresh, independent instance.
 */
async function createTestDb() {
  await db.sequelize.sync({ force: true });
  return db;
}

module.exports = { createTestDb };
