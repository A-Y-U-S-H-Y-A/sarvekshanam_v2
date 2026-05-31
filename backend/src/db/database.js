'use strict';

const db = require('./models');

/**
 * Returns the sequelize db object containing all models.
 * For backwards compatibility in structure, though usage changes.
 */
function getDb() {
  return db;
}

/** Close and destroy the singleton (used in tests between suites). */
async function closeDb() {
  try {
    await db.sequelize.close();
  } catch (err) {
    console.error('Error closing database:', err);
  }
}

/** Replace the internal singleton – for tests only. */
function _setDb(instance) {
  // this might not be needed anymore, but keeping for interface match
  // you can overwrite db.sequelize etc if needed
}

/**
 * Convenience method to sync db (useful in tests)
 */
async function syncDb() {
  await db.sequelize.sync({ force: true });
}

module.exports = { getDb, closeDb, _setDb, syncDb, db };
