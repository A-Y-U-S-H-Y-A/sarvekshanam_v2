'use strict';

require('dotenv').config({ override: true });

module.exports = {
  port:            parseInt(process.env.PORT || '3000', 10),
  nodeEnv:         process.env.NODE_ENV || 'development',

  // Auth
  jwtSecret:       process.env.JWT_SECRET || 'dev-secret-please-change',
  jwtExpiresIn:    process.env.JWT_EXPIRES_IN || '7d',
  bcryptRounds:    parseInt(process.env.BCRYPT_ROUNDS || '10', 10),

  // Database
  dbPath:          process.env.DB_PATH || './sarvekshanam.db',

  // AI providers
  groqApiKey:      process.env.GROQ_API_KEY || '',
  openaiApiKey:    process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  geminiApiKey:    process.env.GEMINI_API_KEY || '',
  mistralApiKey:   process.env.MISTRAL_API_KEY || '',
  cohereApiKey:    process.env.COHERE_API_KEY || '',
  ollamaBaseUrl:   process.env.OLLAMA_BASE_URL || 'http://localhost:11434',

  // Multi-system proxy
  proxyMode:       process.env.PROXY_MODE || 'none',   // none | hop | direct
  proxyTarget:     process.env.PROXY_TARGET || '',

  // Command execution
  allowedCommands: process.env.ALLOWED_COMMANDS || '*',

  // CORS
  corsOrigins:     (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim()),

  // Vector DB / RAG
  vectorDbBackend: process.env.VECTOR_DB_BACKEND || 'sqlite-vec',  // sqlite-vec | chromadb
  vectorDbUrl:     process.env.VECTOR_DB_URL || 'http://localhost:8000',  // ChromaDB URL
  vectorDbPath:    process.env.VECTOR_DB_PATH || './sarvekshanam_vectors.db',  // sqlite-vec file
  embeddingModel:  process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  embeddingDims:   parseInt(process.env.EMBEDDING_DIMS || '1536', 10),

  // OIDC / SSO
  oidcEnabled:     process.env.OIDC_ENABLED === 'true',
  oidcIssuer:      process.env.OIDC_ISSUER || '',
  oidcClientId:    process.env.OIDC_CLIENT_ID || '',
  oidcClientSecret:process.env.OIDC_CLIENT_SECRET || '',
  oidcRedirectUri: process.env.OIDC_REDIRECT_URI || 'http://localhost:3000/auth/oidc/callback',
  oidcScopes:      (process.env.OIDC_SCOPES || 'openid profile email').split(' '),

  // Frontend URL (for OIDC callback redirect)
  frontendUrl:     process.env.FRONTEND_URL || 'http://localhost:3000',

  isDev() {
    return this.nodeEnv === 'development';
  },

  isTest() {
    return this.nodeEnv === 'test';
  },

  /** Returns true when a given command passes the allowlist check */
  isCommandAllowed(command) {
    const list = this.allowedCommands.trim();
    if (list === '*') return true;
    const allowed = list.split(',').map(c => c.trim().toLowerCase());
    const first = command.trim().split(/\s+/)[0].toLowerCase();
    return allowed.includes(first);
  },
};
