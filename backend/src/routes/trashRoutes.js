'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const authenticate = require('../middleware/authenticate');
const router = express.Router();

/**
 * Middleware to restrict access to Admins only.
 */
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden: Admins only' });
  }
}

/**
 * GET /api/trash
 * Returns all soft-deleted records grouped by model name.
 */
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const db = getDb();
    const models = [
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

    const trash = {};

    for (const modelName of models) {
      const Model = db[modelName];
      if (!Model) continue;

      const records = await Model.findAll({
        where: {
          deleted_at: {
            [db.Sequelize.Op.not]: null
          }
        },
        paranoid: false // Include soft-deleted records
      });

      if (records.length > 0) {
        trash[modelName] = records;
      }
    }

    res.json(trash);
  } catch (err) {
    console.error('Failed to fetch trash:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/trash/:model/:id/restore
 * Restores a soft-deleted record.
 */
router.post('/:model/:id/restore', authenticate, requireAdmin, async (req, res) => {
  try {
    const { model, id } = req.params;
    const db = getDb();
    const Model = db[model];

    if (!Model) return res.status(400).json({ error: 'Invalid model' });

    const record = await Model.findByPk(id, { paranoid: false });
    if (!record) return res.status(404).json({ error: 'Record not found' });

    await record.restore();
    res.json({ success: true, message: 'Record restored' });
  } catch (err) {
    console.error('Failed to restore record:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * DELETE /api/trash/:model/:id/force
 * Permanently deletes a soft-deleted record.
 */
router.delete('/:model/:id/force', authenticate, requireAdmin, async (req, res) => {
  try {
    const { model, id } = req.params;
    const db = getDb();
    const Model = db[model];

    if (!Model) return res.status(400).json({ error: 'Invalid model' });

    const record = await Model.findByPk(id, { paranoid: false });
    if (!record) return res.status(404).json({ error: 'Record not found' });

    // Manually cascade delete related records to avoid SQLite foreign key constraint failures
    if (Model.associations) {
      for (const assoc of Object.values(Model.associations)) {
        if (assoc.associationType === 'HasMany') {
          const targetModel = assoc.target;
          const foreignKey = assoc.foreignKey;
          await targetModel.destroy({ where: { [foreignKey]: id }, force: true });
        }
      }
    }

    await record.destroy({ force: true });
    res.json({ success: true, message: 'Record permanently deleted' });
  } catch (err) {
    console.error('Failed to force delete record:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
