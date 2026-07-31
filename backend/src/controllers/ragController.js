'use strict';

const { sendSuccess, sendError, sendNotFound, sendForbidden } = require('../utils/responseHelper');

const asyncHandler = require('../utils/asyncHandler');

const { getVectorService } = require('../services/vectorService');

// POST /api/rag/search
exports.search = asyncHandler(async (req, res, next) => {
    const { query, topK = 5 } = req.body;
    if (!query) {
      return sendError(res, 'query is required');
    }

    const vectorService = getVectorService();
    const results = await vectorService.search(query, topK);

    return sendSuccess(res, { results });
  });

// POST /api/rag/ingest
exports.ingest = asyncHandler(async (req, res, next) => {
    const { docId, text, chunkStrategy, maxTokens, overlap } = req.body;
    if (!docId || !text) {
      return sendError(res, 'docId and text are required');
    }

    const vectorService = getVectorService();
    const result = await vectorService.ingest(docId, text, { chunkStrategy, maxTokens, overlap });

    return sendSuccess(res, result, 201);
  });

// GET /api/rag/stats
exports.stats = asyncHandler(async (req, res, next) => {
    const vectorService = getVectorService();
    const stats = await vectorService.stats();

    return sendSuccess(res, { stats });
  });
