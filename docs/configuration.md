# Configuration Guide

The Master node is configured via a `.env` file located in `backend/.env`.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Port for the Node.js Master server |
| `NODE_ENV` | development | Environment (development/production) |
| `JWT_SECRET` | (required) | Secret key for signing JWTs. Must be long and random. |
| `JWT_EXPIRES_IN` | 7d | Expiration time for user sessions |
| `DB_PATH` | ./sarvekshanam.db | Path to SQLite database |
| `VECTOR_DB_BACKEND` | sqlite-vec | Backend for vector RAG (sqlite-vec or chromadb) |
| `PROXY_MODE` | none | Global proxy mode (`none`, `hop`, `direct`) |
| `ALLOWED_COMMANDS`| * | Comma-separated list of allowed shell commands for admin |
| `OIDC_ENABLED` | false | Set to true to enable Enterprise SSO |

## AI Provider Keys
To use the AI chat features, you must configure at least one provider key:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `OLLAMA_BASE_URL` (default: http://localhost:11434)
