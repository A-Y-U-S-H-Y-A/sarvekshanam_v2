'use strict';

const { getVectorService } = require('../services/vectorService');

// POST /api/rag/search
exports.search = async (req, res, next) => {
  try {
    const { query, topK = 5 } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: { message: 'query is required' } });
    }

    const vectorService = getVectorService();
    const results = await vectorService.search(query, topK);

    return res.json({ success: true, data: { results } });
  } catch (err) {
    next(err);
  }
};

// POST /api/rag/ingest
exports.ingest = async (req, res, next) => {
  try {
    const { docId, text, chunkStrategy, maxTokens, overlap } = req.body;
    if (!docId || !text) {
      return res.status(400).json({ success: false, error: { message: 'docId and text are required' } });
    }

    const vectorService = getVectorService();
    const result = await vectorService.ingest(docId, text, { chunkStrategy, maxTokens, overlap });

    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// GET /api/rag/stats
exports.stats = async (req, res, next) => {
  try {
    const vectorService = getVectorService();
    const stats = await vectorService.stats();

    return res.json({ success: true, data: { stats } });
  } catch (err) {
    next(err);
  }
};
