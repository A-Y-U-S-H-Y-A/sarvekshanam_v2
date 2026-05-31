'use strict';

const cron = require('node-cron');
const { getDb } = require('../db/database');
const { Op } = require('sequelize');

class CleanupService {
  constructor() {
    this._task = null;
  }

  /**
   * Initializes the cleanup service:
   * 1. Runs an immediate sweep.
   * 2. Schedules a cron job to run every 15 minutes.
   */
  start() {
    console.log('[CleanupService] Starting cleanup service...');
    
    // Run an initial sweep
    this.sweep()
      .then(() => console.log('[CleanupService] Initial sweep complete.'))
      .catch(err => console.error('[CleanupService] Initial sweep failed:', err));

    // Schedule the cron job (every 15 minutes)
    this._task = cron.schedule('*/15 * * * *', () => {
      console.log('[CleanupService] Running scheduled sweep...');
      this.sweep().catch(err => console.error('[CleanupService] Scheduled sweep failed:', err));
    });
  }

  stop() {
    if (this._task) {
      this._task.stop();
      this._task = null;
      console.log('[CleanupService] Stopped.');
    }
  }

  /**
   * Hard deletes all items that have a deleted_at timestamp older than 1 hour.
   */
  async sweep() {
    const db = getDb();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const modelsToClean = [
      'Appointment',
      'ScanSession',
      'AppointmentChat',
      'RemoteHost',
      'SlaveGroup',
      'SlaveGroupMember',
      'CommandHistory',
      'User',
      'ApiKey'
    ];

    for (const modelName of modelsToClean) {
      const Model = db[modelName];
      // Only clean up models that have paranoid: true (and thus have a deleted_at column)
      if (!Model || !Model.options || !Model.options.paranoid) continue;

      try {
        const result = await Model.destroy({
          where: {
            deleted_at: {
              [Op.lt]: oneHourAgo
            }
          },
          force: true // bypass paranoid to permanently delete
        });

        if (result > 0) {
          console.log(`[CleanupService] Permanently deleted ${result} records from ${modelName}`);
        }
      } catch (err) {
        console.error(`[CleanupService] Error cleaning up ${modelName}:`, err.message);
      }
    }
  }
}

// Singleton
let _instance = null;
function getCleanupService() {
  if (!_instance) {
    _instance = new CleanupService();
  }
  return _instance;
}

module.exports = {
  getCleanupService
};
