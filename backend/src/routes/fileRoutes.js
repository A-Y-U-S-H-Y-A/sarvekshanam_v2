'use strict';

const router = require('express').Router();
const multer = require('multer');
const fileController = require('../controllers/fileController');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.post('/upload', upload.single('file'), fileController.uploadTargets);
router.post('/download', fileController.downloadTargets);

module.exports = router;
