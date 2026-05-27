'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const authenticate = require('../middleware/authenticate');
const router = express.Router();

router.use(authenticate);

// GET /api/groups
router.get('/', async (req, res, next) => {
  try {
    const { SlaveGroup } = getDb();
    const groups = await SlaveGroup.findAll();
    res.json(groups);
  } catch (err) {
    next(err);
  }
});

// GET /api/groups/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { SlaveGroup } = getDb();
    const group = await SlaveGroup.findByPk(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
  } catch (err) {
    next(err);
  }
});

// GET /api/groups/:id/runners
router.get('/:id/runners', async (req, res, next) => {
  try {
    const { SlaveGroup, SlaveGroupMember, RemoteHost } = getDb();
    const group = await SlaveGroup.findByPk(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const members = await SlaveGroupMember.findAll({
      where: { group_id: req.params.id },
      include: [{ model: RemoteHost, as: 'runner' }]
    });

    res.json(members.map(m => m.runner));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
