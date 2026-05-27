'use strict';

const { getAIService }          = require('../services/aiService');
const { getScanSessionService } = require('../services/scanSessionService');

// POST /api/ai/chat — streaming SSE response
exports.chat = async (req, res, next) => {
  try {
    const { provider = 'groq', model, messages, sessionIds, appointmentId } = req.body;

    if (!messages?.length) {
      return res.status(400).json({ success: false, error: { message: 'messages array is required' } });
    }
    if (!appointmentId) {
      return res.status(400).json({ success: false, error: { message: 'appointmentId is required' } });
    }

    // Build session context if sessionIds provided
    let sessionContext = null;
    if (sessionIds && Array.isArray(sessionIds) && sessionIds.length > 0) {
      const svc = require('../services/scanSessionService').getScanSessionService();
      let combinedStr = '';
      let combinedResultsStr = '';
      const validSessions = [];

      // Collect all sessions
      for (const sid of sessionIds) {
        const session = await svc.get(sid);
        if (session && session.results) {
          validSessions.push(session);
          combinedResultsStr += JSON.stringify(session.results) + '\n';
        }
      }

      if (validSessions.length > 0) {
        const { getChunkingService } = require('../services/chunkingService');
        const chunkSvc = getChunkingService();
        const tokenEst = chunkSvc.estimateTokens(combinedResultsStr);

        if (tokenEst > 4000) {
          const { getVectorService } = require('../services/vectorService');
          const vectorService = getVectorService();
          
          for (const session of validSessions) {
            combinedStr += `Scan Session ID: "${session.id}"\nName: "${session.name}"\nTargets: ${session.targets.join(', ')}\n`;
            await vectorService.ingest(session.id, JSON.stringify(session.results));
          }
          combinedStr += `\n[Results too large (>4000 tokens). They have been indexed into the vector DB. You MUST use your rag_search tool to query the contents of these scans to answer the user's question!]`;
        } else {
          for (const session of validSessions) {
            const resultDisplay = typeof session.results === 'string' ? session.results : JSON.stringify(session.results, null, 2);
            combinedStr += `Scan Session ID: "${session.id}"\nName: "${session.name}"\nTargets: ${session.targets.join(', ')}\n\nResults:\n${resultDisplay}\n\n---\n\n`;
          }
        }
        sessionContext = combinedStr.trim();
      }
    }

    // Set SSE headers
    res.setHeader('Content-Type',                'text/event-stream');
    res.setHeader('Cache-Control',               'no-cache');
    res.setHeader('Connection',                  'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const ai = getAIService();

    try {
      for await (const chunk of ai.stream({ 
        provider, 
        model, 
        messages, 
        sessionContext, 
        appointmentId, 
        userId: req.user?.id,
        chatId: req.body.chatId,
        pendingToolCalls: req.body.pendingToolCalls,
        denyTools: req.body.denyTools
      })) {
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }
    } catch (streamErr) {
      res.write(`data: ${JSON.stringify({ error: streamErr.message })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    // Headers may already be flushed — write error as SSE
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    } else {
      next(err);
    }
  }
};

// GET /api/ai/providers
exports.listProviders = async (req, res, next) => {
  try {
    const ai        = getAIService();
    const providers = await ai.listProviders();
    res.json({ success: true, data: { providers } });
  } catch (err) {
    next(err);
  }
};

const PROVIDER_PACKAGES = {
  groq:       { install: '@langchain/groq',                uninstall: '@langchain/groq' },
  openai:     { install: '@langchain/openai',              uninstall: '@langchain/openai' },
  ollama:     { install: '@langchain/ollama',              uninstall: '@langchain/ollama' },
  anthropic:  { install: '@langchain/anthropic',           uninstall: '@langchain/anthropic' },
  gemini:     { install: '@langchain/google-genai',        uninstall: '@langchain/google-genai' },
  mistralai:  { install: '@langchain/mistralai@0.2.3',     uninstall: '@langchain/mistralai' },
  cohere:     { install: '@langchain/cohere@0.3.4',        uninstall: '@langchain/cohere' },
};

// POST /api/ai/packages/install
exports.installPackage = async (req, res, next) => {
  try {
    const { providerId } = req.body;
    if (!providerId) return res.status(400).json({ success: false, error: { message: 'providerId required' } });
    
    const pkg = PROVIDER_PACKAGES[providerId];
    if (!pkg) {
      return res.status(400).json({ success: false, error: { message: 'Invalid or unsupported providerId for installation.' } });
    }

    const { exec } = require('child_process');

    exec(`npm install ${pkg.install}`, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ success: false, error: { message: error.message } });
      }
      res.json({ success: true, data: { message: 'Package installed successfully' } });
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/ai/packages/uninstall
exports.uninstallPackage = async (req, res, next) => {
  try {
    const { providerId } = req.body;
    if (!providerId) return res.status(400).json({ success: false, error: { message: 'providerId required' } });
    
    const pkg = PROVIDER_PACKAGES[providerId];
    if (!pkg) {
      return res.status(400).json({ success: false, error: { message: 'Invalid or unsupported providerId for uninstallation.' } });
    }

    const { exec } = require('child_process');

    exec(`npm uninstall ${pkg.uninstall}`, { cwd: process.cwd() }, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ success: false, error: { message: error.message } });
      }
      res.json({ success: true, data: { message: 'Package removed successfully' } });
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/ai/models/fetch
exports.fetchModels = async (req, res, next) => {
  try {
    const { providerId } = req.body;
    if (!providerId) return res.status(400).json({ success: false, error: { message: 'providerId required' } });
    
    const ai = getAIService();
    const models = await ai.fetchModelsFromAPI(providerId);
    res.json({ success: true, data: { models } });
  } catch (err) {
    next(err);
  }
};

// POST /api/ai/models/add
exports.addModel = async (req, res, next) => {
  try {
    const { providerId, model } = req.body;
    if (!providerId || !model) return res.status(400).json({ success: false, error: { message: 'providerId and model required' } });
    
    const aiModelsStore = require('../services/aiModelsStore');
    aiModelsStore.addModel(providerId, model);
    res.json({ success: true, data: { message: 'Model added' } });
  } catch (err) {
    next(err);
  }
};

// POST /api/ai/models/remove
exports.removeModel = async (req, res, next) => {
  try {
    const { providerId, model } = req.body;
    if (!providerId || !model) return res.status(400).json({ success: false, error: { message: 'providerId and model required' } });
    
    const aiModelsStore = require('../services/aiModelsStore');
    aiModelsStore.removeModel(providerId, model);
    res.json({ success: true, data: { message: 'Model removed' } });
  } catch (err) {
    next(err);
  }
};
