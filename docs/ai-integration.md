# AI & Context Integration

Sarvekshanam features a deeply integrated Agentic AI assistant capable of analyzing security data and orchestrating the platform.

## Supported Providers
The backend uses LangChain to connect to multiple LLM providers:
- **Anthropic** (Claude 3.5 Sonnet, Haiku)
- **OpenAI** (GPT-4o)
- **Google Gemini** (1.5 Pro, Flash)
- **Groq** (Llama 3)
- **Ollama** (Local models)

## Retrieval-Augmented Generation (RAG)
When a scan completes, its output is automatically processed:
1. **Chunking**: Output is split into manageable chunks (using fixed size or LLM summarization).
2. **Embedding**: Chunks are embedded using an embedding model.
3. **Storage**: Vectors are stored locally using `sqlite-vec` (or ChromaDB).

In the AI Chat, you can use the RAG search bar to query past scan results and instantly inject them into the LLM's context window.

## Tool Calling (Agentic Mode)
The Go Slaves automatically convert their `manifest.json` definitions into OpenAI-compatible JSON function-calling schemas.
This allows the AI agent to understand exactly what tools are available on your network. If you ask the AI to "Scan my internal subnet", it can select the correct Nmap module, formulate the parameters, and request permission to execute it.
