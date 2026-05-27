'use strict';

const config = require('../config');

/**
 * AIService — unified LangChain.js wrapper over multiple AI providers.
 *
 * Providers:
 *   groq    → @langchain/groq     (GroqCloud)
 *   openai  → @langchain/openai   (OpenAI / Azure)
 *   ollama  → @langchain/ollama   (local Ollama)
 *
 * All providers expose the same interface:
 *   .stream(messages) → AsyncIterable<AIMessageChunk>
 *   .invoke(messages) → Promise<AIMessage>
 */
class AIService {
  /**
   * Get a configured LangChain chat model instance.
   * @param {'groq'|'openai'|'ollama'} provider
   * @param {string} model
   * @param {object} [opts]
   * @returns {BaseChatModel}
   */
  getModel(provider, model, opts = {}) {
    switch (provider) {
      case 'groq': {
        const { ChatGroq } = require('@langchain/groq');
        return new ChatGroq({
          apiKey:      config.groqApiKey,
          model:       model || 'llama-3.1-8b-instant',
          temperature: opts.temperature ?? 0.7,
          streaming:   true,
        });
      }
      case 'openai': {
        const { ChatOpenAI } = require('@langchain/openai');
        return new ChatOpenAI({
          openAIApiKey: config.openaiApiKey,
          modelName:    model || 'gpt-4o-mini',
          temperature:  opts.temperature ?? 0.7,
          streaming:    true,
        });
      }
      case 'ollama': {
        const { ChatOllama } = require('@langchain/ollama');
        return new ChatOllama({
          baseUrl:     config.ollamaBaseUrl,
          model:       model || 'llama3',
          temperature: opts.temperature ?? 0.7,
        });
      }
      case 'anthropic': {
        const { ChatAnthropic } = require('@langchain/anthropic');
        return new ChatAnthropic({
          anthropicApiKey: config.anthropicApiKey,
          modelName:       model || 'claude-3-5-sonnet-latest',
          temperature:     opts.temperature ?? 0.7,
          streaming:       true,
        });
      }
      case 'gemini': {
        const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
        return new ChatGoogleGenerativeAI({
          apiKey:      config.geminiApiKey,
          modelName:   model || 'gemini-1.5-pro',
          temperature: opts.temperature ?? 0.7,
          streaming:   true,
        });
      }
      case 'mistralai': {
        const { ChatMistralAI } = require('@langchain/mistralai');
        return new ChatMistralAI({
          apiKey:      config.mistralApiKey,
          model:       model || 'mistral-large-latest',
          temperature: opts.temperature ?? 0.7,
          streaming:   true,
        });
      }
      case 'cohere': {
        const { ChatCohere } = require('@langchain/cohere');
        return new ChatCohere({
          apiKey:      config.cohereApiKey,
          model:       model || 'command-r-plus',
          temperature: opts.temperature ?? 0.7,
          streaming:   true,
        });
      }
      default:
        throw Object.assign(new Error(`Unknown AI provider: "${provider}"`), { status: 400 });
    }
  }

  /**
   * Build LangChain message objects from a plain messages array.
   * @param {Array<{role: 'system'|'user'|'assistant'|'tool', content: string, tool_calls?: any[], tool_call_id?: string, name?: string}>} messages
   * @returns {BaseMessage[]}
   */
  buildMessages(messages) {
    const { SystemMessage, HumanMessage, AIMessage, ToolMessage } = require('@langchain/core/messages');
    return messages.map(m => {
      switch (m.role) {
        case 'system':
          return new SystemMessage(m.content);
        case 'assistant':
          if (m.tool_calls && m.tool_calls.length > 0) {
            return new AIMessage({ content: m.content || '', tool_calls: m.tool_calls });
          }
          return new AIMessage(m.content);
        case 'tool':
          return new ToolMessage({ content: m.content || '', tool_call_id: m.tool_call_id, name: m.name });
        default:
          return new HumanMessage(m.content);
      }
    });
  }

  /**
   * Build AI agent tools — lazy-discovery pattern for token efficiency.
   *
   * Tool 1: list_available_scans  → compact catalog (id, name, category)
   * Tool 2: get_scan_info         → full schema for ONE module (on-demand)
   * Tool 3: run_scan              → execute any module via ScanSessionService
   * Tool 4: get_scan_results      → poll session status + results
   */
  _getTools(appointmentId = null, userId = 'ai-agent') {
    const { DynamicTool } = require('@langchain/core/tools');
    const { getRegistry } = require('../modules/registry');
    const { getScanSessionService } = require('./scanSessionService');

    const tools = [
      // ── Tool 1: Compact catalog ──────────────────────────────────────────
      new DynamicTool({
        name: 'list_available_scans',
        description: 'List all available scan modules. Returns a compact JSON array of {id, name, category}. Call this first to discover what scans exist. No input required — pass an empty string.',
        func: async () => {
          try {
            const mods = getRegistry().getAll();
            // Compact: only id + name + category to save tokens
            const compact = mods.map(m => ({ id: m.id, name: m.name, cat: m.category }));
            return JSON.stringify(compact);
          } catch (e) {
            return JSON.stringify({ error: e.message });
          }
        }
      }),

      // ── Tool 2: On-demand detail for a single module ─────────────────────
      new DynamicTool({
        name: 'get_scan_info',
        description: 'Get full details (description, parameters) for a specific scan module. Input: the exact module ID string as returned by list_available_scans. Do NOT guess or shorten IDs.',
        func: async (moduleId) => {
          try {
            let idToFetch = moduleId.trim().replace(/^"|"$/g, '');
            try {
              const parsed = JSON.parse(idToFetch);
              if (parsed && typeof parsed === 'object') idToFetch = parsed.moduleId || parsed.id || parsed.input || idToFetch;
            } catch (_) {}

            // Exact match first
            let mod = getRegistry().getById(idToFetch);
            // Fuzzy suffix match for convenience
            if (!mod) {
              const all = getRegistry().getAll();
              const normalizedFetch = idToFetch.toLowerCase().replace(/[-_ ]/g, '');
              const match = all.find(m => {
                const normId = m.id.toLowerCase().replace(/[-_ ]/g, '');
                const normName = m.name.toLowerCase().replace(/[-_ ]/g, '');
                return m.id.endsWith('_' + idToFetch) || m.id.endsWith('-' + idToFetch) ||
                       normId.includes(normalizedFetch) || normalizedFetch.includes(normId) ||
                       normName.includes(normalizedFetch) || normalizedFetch.includes(normName) ||
                       m.id === idToFetch || m.name === idToFetch;
              });
              if (match) mod = getRegistry().getById(match.id);
            }
            if (!mod) return JSON.stringify({ error: `Module "${idToFetch}" not found. Use list_available_scans to get valid IDs.` });
            return JSON.stringify(mod.meta);
          } catch (e) {
            return JSON.stringify({ error: e.message });
          }
        }
      }),

      // ── Tool 3: Execute any scan ─────────────────────────────────────────
      new DynamicTool({
        name: 'run_scan',
        description: 'Request execution of a scan module against a target. The UI will ask the user to approve before the scan actually runs. Input must be a JSON string: {"moduleId": "module-id", "target": "target-host-or-url", "params": {}}. params is optional extra parameters. Returns scan results after approval and execution.',
        func: async (inputStr) => {
          try {
            let input = JSON.parse(inputStr);
            if (input && typeof input === 'object' && Object.prototype.hasOwnProperty.call(input, 'input')) {
              input = typeof input.input === 'string' ? JSON.parse(input.input) : input.input;
            }
            if (!input.moduleId) return JSON.stringify({ error: 'moduleId is required' });
            if (!input.target) return JSON.stringify({ error: 'target is required' });

            const registry = getRegistry();
            // Exact match first, then fuzzy suffix match for convenience
            let mod = registry.getById(input.moduleId);
            let resolvedId = input.moduleId;
            if (!mod) {
              const all = registry.getAll();
              const normalizedFetch = input.moduleId.toLowerCase().replace(/[-_ ]/g, '');
              const match = all.find(m => {
                const normId = m.id.toLowerCase().replace(/[-_ ]/g, '');
                const normName = m.name.toLowerCase().replace(/[-_ ]/g, '');
                return m.id.endsWith('_' + input.moduleId) || m.id.endsWith('-' + input.moduleId) ||
                       normId.includes(normalizedFetch) || normalizedFetch.includes(normId) ||
                       normName.includes(normalizedFetch) || normalizedFetch.includes(normName) ||
                       m.id === input.moduleId || m.name === input.moduleId;
              });
              if (match) {
                mod = registry.getById(match.id);
                resolvedId = match.id;
              }
            }
            if (!mod) return JSON.stringify({ error: `Module "${input.moduleId}" not found. Use list_available_scans to get valid IDs.` });

            const svc = getScanSessionService();
            const session = await svc.create(userId || 'ai-agent', {
              name: `AI: ${mod.meta.name} → ${input.target}`,
              mode: 'single',
              targets: [input.target],
              moduleIds: [resolvedId],
              params: input.params ? { [resolvedId]: input.params } : {},
              appointmentId: appointmentId
            });

            // Queue execution, then briefly poll so fast scans return results inline.
            await svc.run(session.id);
            const completed = await this._waitForScanCompletion(svc, session.id);
            
            // Check if results are massive
            const resultsStr = JSON.stringify(completed.results);
            const { getChunkingService } = require('./chunkingService');
            const chunkSvc = getChunkingService();
            const tokenEst = chunkSvc.estimateTokens(resultsStr);

            let returnResults = completed.results;
            if (tokenEst > 4000) {
              const { getVectorService } = require('./vectorService');
              await getVectorService().ingest(completed.id, resultsStr);
              returnResults = `[Results too large (>4000 tokens). They have been indexed into the vector DB. You MUST use your rag_search tool to query the contents of this scan!]`;
            } else {
              returnResults = this._compactScanResults(returnResults);
            }

            // Return compact results
            return JSON.stringify({
              sessionId: completed.id,
              status: completed.status,
              results: returnResults,
              error: completed.error,
            });
          } catch (e) {
            return JSON.stringify({ error: e.message });
          }
        }
      }),

      // ── Tool 4: Poll existing session results ────────────────────────────
      new DynamicTool({
        name: 'get_scan_results',
        description: 'Get the status and results of a previously launched scan session. Input: the session ID string.',
        func: async (sessionId) => {
          try {
            let idToFetch = sessionId.trim().replace(/^"|"$/g, '');
            try {
              const parsed = JSON.parse(idToFetch);
              if (parsed && typeof parsed === 'object') idToFetch = parsed.sessionId || parsed.id || parsed.input || idToFetch;
            } catch (_) {}

            const svc = getScanSessionService();
            const session = await svc.get(idToFetch);
            if (!session) return JSON.stringify({ error: 'Session not found' });
            
            // Check if results are massive
            const resultsStr = JSON.stringify(session.results);
            const { getChunkingService } = require('./chunkingService');
            const chunkSvc = getChunkingService();
            const tokenEst = chunkSvc.estimateTokens(resultsStr);

            let returnResults = session.results;
            if (tokenEst > 4000) {
              const { getVectorService } = require('./vectorService');
              await getVectorService().ingest(session.id, resultsStr);
              returnResults = `[Results too large (>4000 tokens). They have been indexed into the vector DB. You MUST use your rag_search tool to query the contents of this scan!]`;
            } else {
              returnResults = this._compactScanResults(returnResults);
            }

            return JSON.stringify({
              sessionId: session.id,
              status: session.status,
              results: returnResults,
              error: session.error,
            });
          } catch (e) {
            return JSON.stringify({ error: e.message });
          }
        }
      }),
    ];

    // ── Tool 5: Search past scans / knowledge base via RAG ───────────────────
    tools.push(new DynamicTool({
      name: 'rag_search',
      description: 'Search past scan results and the security knowledge base using semantic search. Input: your search query (e.g. "which hosts have port 22 open?" or "find details about the nginx server"). Returns relevant chunks of information.',
      func: async (query) => {
        try {
          let q = query.trim().replace(/^"|"$/g, '');
          try {
            const parsed = JSON.parse(q);
            if (parsed && typeof parsed === 'object') q = parsed.query || parsed.q || parsed.input || q;
          } catch (_) {}

          const { getVectorService } = require('./vectorService');
          const filter = {};
          if (appointmentId) {
            try {
              const { getAppointmentService } = require('./appointmentService');
              const apptContext = await getAppointmentService().getFullContext(appointmentId);
              if (apptContext && apptContext.scans && apptContext.scans.length > 0) {
                filter.docIds = apptContext.scans.map(s => s.id);
              } else {
                filter.docIds = ['__none__'];
              }
            } catch (e) {}
          }
          const results = await getVectorService().search(q, 5, filter);
          if (!results || results.length === 0) return JSON.stringify({ message: 'No relevant information found.' });
          
          const compact = results.map(r => ({
            docId: r.docId,
            score: r.score.toFixed(3),
            content: r.content
          }));
          return JSON.stringify(compact);
        } catch (e) {
          return JSON.stringify({ error: `RAG search failed: ${e.message}` });
        }
      }
    }));

    return tools;
  }

  /**
   * Stream an AI response. Yields string chunks.
   * Supports a multi-turn agent loop: the AI can chain up to MAX_TOOL_ROUNDS
   * tool calls (e.g. list → inspect → run → check) before producing a final answer.
   *
   * IMPORTANT: Tool calls are accumulated via concat() across the entire stream
   * before extraction, because LangChain streams tool_call args incrementally
   * across many chunks (first chunk has name but empty args).
   *
   * @param {{ provider, model, messages, sessionContext? }} opts
   * @returns {AsyncGenerator<string>}
   */
  async *stream({ provider, model, messages, sessionContext, appointmentId, userId, chatId, pendingToolCalls, denyTools }) {
    const MAX_TOOL_ROUNDS = 5;
    const RECENT_MESSAGE_LIMIT = 20;
    const fullMessages = messages.length > RECENT_MESSAGE_LIMIT 
      ? messages.slice(-RECENT_MESSAGE_LIMIT) 
      : [...messages];

    const enableTools = this._shouldEnableTools(fullMessages, sessionContext);
    const systemParts = [
      'You are Sarvekshanam AI, a security operations assistant.',
      'You have tools to discover and run security scans.',
      'IMPORTANT RULES:',
      '1. Call list_available_scans ONCE to discover modules. Use the EXACT "id" field from the results when calling other tools.',
      '2. Do NOT guess or shorten module IDs. IDs may look like "remote_uuid_name" — use the full string.',
      '3. If a tool returns an error, do NOT retry the same call. Report the error to the user.',
      '4. When running a scan, pass the target the user specified.',
      '5. If the scan results are too large or truncated, you MUST use the rag_search tool to find the information the user is asking for. DO NOT try to get scan info instead.',
      '6. If the user message already includes pasted context such as "[Context attached from previous scan]", answer directly from that text before using rag_search.',
      '7. Do NOT repeat the same tool call with identical arguments. If a tool returns no results or an error, explain that result and answer from the available context.',
      '8. If the user asks to run a scan and their requested scan name uniquely matches one available module, proceed with that module after discovery instead of asking the user to select it again.',
      '9. Never ask for scan execution approval in natural language. When ready to launch a scan, call run_scan with a valid moduleId and target; the UI will pause and ask the user to approve before execution.',
      'Available tools: list_available_scans, get_scan_info, run_scan, get_scan_results, rag_search.',
    ];

    if (enableTools) {
      systemParts[2] = 'IMPORTANT TOOL RULES:';
    } else {
      systemParts.splice(
        1,
        systemParts.length - 1,
        'Answer normal conversation directly and concisely.',
        'No tools are available for this message. Do not mention or attempt tool calls.'
      );
    }

    if (sessionContext) {
      systemParts.push(`\nActive scan context:\n${sessionContext}`);
    }

    if (appointmentId) {
      try {
        const { getAppointmentService } = require('./appointmentService');
        const apptContext = await getAppointmentService().getFullContext(appointmentId);
        if (apptContext) {
          systemParts.push(`\nActive Appointment Context:\n${JSON.stringify(this._compactAppointmentContext(apptContext), null, 2)}`);
        }
      } catch (e) {
        console.warn(`Failed to get appointment context for ${appointmentId}:`, e.message);
      }
    }

    fullMessages.unshift({ role: 'system', content: systemParts.join('\n') });

    let lcMessages = this.buildMessages(fullMessages);
    let llm        = this.getModel(provider, model);

    if (enableTools && ['openai', 'groq', 'anthropic', 'gemini', 'mistralai', 'cohere'].includes(provider) && typeof llm.bindTools === 'function') {
      llm = llm.bindTools(this._getTools(appointmentId, userId));
    }

    const { AIMessage, ToolMessage } = require('@langchain/core/messages');
    const tools = this._getTools(appointmentId, userId);
    const toolMap = Object.fromEntries(tools.map(t => [t.name, t]));

    const responseChunks = [];
    const seenToolSignatures = new Set();
    const pendingToolSummaries = [];
    let skipModelAfterPendingTools = false;

    // If we are resuming after a user confirmed/denied tool execution, run it now.
    if (pendingToolCalls && pendingToolCalls.length > 0) {
      // Execute each pending tool call
      for (const tc of pendingToolCalls) {
        if (denyTools) {
          const denied = JSON.stringify({ error: `User denied permission to execute this tool.` });
          lcMessages.push(new ToolMessage({ tool_call_id: tc.id, content: denied, name: tc.name }));
          pendingToolSummaries.push(`Execution denied for ${this._toolDisplayName(tc.name)}. No scan was launched.`);
          continue;
        }

        const tool = toolMap[tc.name];
        if (!tool) {
          lcMessages.push(new ToolMessage({
            tool_call_id: tc.id, content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }), name: tc.name
          }));
          continue;
        }
        const argsStr = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args);
        try {
          const resultStr = await tool.func(argsStr);
          lcMessages.push(new ToolMessage({ tool_call_id: tc.id, content: resultStr, name: tc.name }));
          pendingToolSummaries.push(this._formatApprovedToolSummary(tc.name, resultStr));
        } catch (e) {
          const errStr = JSON.stringify({ error: e.message });
          lcMessages.push(new ToolMessage({ tool_call_id: tc.id, content: errStr, name: tc.name }));
          pendingToolSummaries.push(this._formatApprovedToolSummary(tc.name, errStr));
        }
      }

      skipModelAfterPendingTools = !!denyTools;
      let summary = pendingToolSummaries.filter(Boolean).join('\n\n');
      const requestedMarkers = this._extractRequestedMarkers(fullMessages);
      for (const marker of requestedMarkers) {
        if (denyTools && !marker.includes('DENY')) continue;
        if (!summary.includes(marker)) summary += `${summary ? '\n\n' : ''}${marker}`;
      }
      if (summary) {
        const summaryChunk = `${summary}\n\n`;
        responseChunks.push(summaryChunk);
        yield summaryChunk;
      }

      if (!denyTools && !/Results too large/i.test(summary)) {
        skipModelAfterPendingTools = true;
      }
    }

    if (!pendingToolCalls?.length && enableTools) {
      const inferredInitialToolCalls = this._inferToolCallsFromPrompt(fullMessages);
      if (inferredInitialToolCalls.some(tc => tc.name === 'run_scan')) {
        for (const tc of inferredInitialToolCalls) {
          const label = `\n🔧 **${this._toolDisplayName(tc.name)}**`;
          responseChunks.push(label);
          yield label;
          if (tc.name === 'run_scan' && tc.args) {
            const a = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
            if (a.target) {
              const targetLabel = ` → \`${a.target}\``;
              responseChunks.push(targetLabel);
              yield targetLabel;
            }
          }
          responseChunks.push('\n');
          yield '\n';
        }

        const confirmPayload = `\n__TOOL_CONFIRMATION__:${JSON.stringify(inferredInitialToolCalls)}\n`;
        responseChunks.push(confirmPayload);
        yield confirmPayload;
        skipModelAfterPendingTools = true;
      }
    }

    for (let round = 0; !skipModelAfterPendingTools && round < MAX_TOOL_ROUNDS; round++) {
      const stream = await llm.stream(lcMessages);

      let accumulated = null;
      let rawToolCalls = [];

      for await (const chunk of stream) {
        if (accumulated === null) {
          accumulated = chunk;
        } else {
          try { accumulated = accumulated.concat(chunk); } catch (_) { }
        }

        // Sequentially parse tool_call_chunks to bypass Langchain's buggy index-based concat
        if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
          for (const tc of chunk.tool_call_chunks) {
            if (tc.name) {
              rawToolCalls.push({ id: tc.id, name: tc.name, argsStr: tc.args || '' });
            } else {
              if (rawToolCalls.length > 0) {
                rawToolCalls[rawToolCalls.length - 1].argsStr += (tc.args || '');
              }
            }
          }
        }

        const content = typeof chunk.content === 'string'
          ? chunk.content
          : (chunk.content?.[0]?.text ?? '');
        if (content) {
          responseChunks.push(content);
          yield content;
        }
      }

      // Extract tool calls from our raw sequentially parsed list
      let toolCalls = [];
      if (rawToolCalls.length > 0) {
        toolCalls = rawToolCalls.map(tc => {
          let parsedArgs = {};
          try {
            if (tc.argsStr && tc.argsStr.trim()) {
              // Extract the first valid JSON object to handle LLM hallucinations (e.g. extra braces at the end)
              let openBraces = 0;
              let start = -1;
              let inString = false;
              let escape = false;
              let extracted = null;
              
              const str = tc.argsStr;
              for (let i = 0; i < str.length; i++) {
                const char = str[i];
                if (escape) { escape = false; continue; }
                if (char === '\\') { escape = true; continue; }
                if (char === '"') { inString = !inString; continue; }
                
                if (!inString) {
                  if (char === '{') {
                    if (start === -1) start = i;
                    openBraces++;
                  } else if (char === '}') {
                    openBraces--;
                    if (openBraces === 0 && start !== -1) {
                      extracted = str.substring(start, i + 1);
                      break;
                    }
                  }
                }
              }
              
              if (extracted) {
                parsedArgs = JSON.parse(extracted);
              } else {
                parsedArgs = JSON.parse(str); // fallback
              }
              if (parsedArgs && typeof parsedArgs === 'object' && Object.prototype.hasOwnProperty.call(parsedArgs, 'input')) {
                parsedArgs = typeof parsedArgs.input === 'string' ? JSON.parse(parsedArgs.input) : parsedArgs.input;
              }
            }
          } catch (e) {
            console.warn(`Failed to parse tool args for ${tc.name}:`, e.message);
          }
          return { id: tc.id, name: tc.name, args: parsedArgs };
        }).filter(tc => tc.name);
      } else {
        toolCalls = accumulated?.tool_calls?.filter(tc => tc.name) || [];
      }

      const fullText = this._chunkText(accumulated?.content);
      const funcRegex = /<function=([^>]+)>([\s\S]*?)<\/function>/g;
      let match;
      while ((match = funcRegex.exec(fullText)) !== null) {
        let parsedArgs = {};
        try { parsedArgs = JSON.parse(match[2]); } catch (_) {}
        toolCalls.push({
          id: `call_${Date.now()}_raw_${toolCalls.length}`,
          name: match[1],
          args: parsedArgs
        });
      }

      toolCalls.forEach((tc, i) => { if (!tc.id) tc.id = `call_${Date.now()}_${i}`; });
      this._repairRunScanToolCalls(toolCalls, fullMessages);

      if (toolCalls.length === 0 && !this._chunkText(accumulated?.content).trim()) {
        toolCalls = this._inferToolCallsFromPrompt(fullMessages);
      }

      if (toolCalls.length === 0) break;

      const toolSignatures = toolCalls.map(tc => {
        let argsKey = '';
        try { argsKey = JSON.stringify(tc.args || {}); } catch (_) { argsKey = String(tc.args || ''); }
        return `${tc.name}:${argsKey}`;
      });
      const repeatedToolBatch = toolSignatures.length > 0 && toolSignatures.every(sig => seenToolSignatures.has(sig));
      toolSignatures.forEach(sig => seenToolSignatures.add(sig));

      // Output tool call badges
      for (const tc of toolCalls) {
        const label = `\n🔧 **${this._toolDisplayName(tc.name)}**`;
        responseChunks.push(label);
        yield label;
        if (tc.name === 'run_scan' && tc.args) {
          const a = typeof tc.args === 'string' ? JSON.parse(tc.args) : tc.args;
          if (a.target) {
            const targetLabel = ` → \`${a.target}\``;
            responseChunks.push(targetLabel);
            yield targetLabel;
          }
        }
        responseChunks.push('\n');
        yield '\n';
      }

      if (repeatedToolBatch) {
        lcMessages.push(new AIMessage({ content: accumulated.content || '', tool_calls: toolCalls }));
        for (const tc of toolCalls) {
          lcMessages.push(new ToolMessage({
            tool_call_id: tc.id,
            content: JSON.stringify({ error: 'Repeated identical tool call skipped. Use the previous tool result and available conversation context to answer now.' }),
            name: tc.name
          }));
        }
        continue;
      }

      // Check if we need user confirmation (only for valid run_scan calls)
      const needsConfirmation = toolCalls.some(tc => {
        if (tc.name === 'run_scan') {
          // If the AI forgot to include required parameters, don't bother the user with a prompt.
          // Let it auto-execute so it harmlessly hits the tool's validation error and corrects itself.
          if (!tc.args || typeof tc.args !== 'object' || !tc.args.moduleId || !tc.args.target) {
            return false;
          }
          return true;
        }
        return false;
      });

      if (needsConfirmation) {
        // PAUSE for user confirmation
        const confirmPayload = `\n__TOOL_CONFIRMATION__:${JSON.stringify(toolCalls)}\n`;
        responseChunks.push(confirmPayload);
        yield confirmPayload;
        
        // Stop the AI loop to wait for client approval
        break;
      } else {
        // Execute safe tools immediately and continue the loop
        lcMessages.push(new AIMessage({ content: accumulated.content || '', tool_calls: toolCalls }));

        for (const tc of toolCalls) {
          const tool = toolMap[tc.name];
          if (!tool) {
            lcMessages.push(new ToolMessage({
              tool_call_id: tc.id, content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }), name: tc.name
            }));
            continue;
          }
          const argsStr = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args);
          try {
            const resultStr = await tool.func(argsStr);
            lcMessages.push(new ToolMessage({ tool_call_id: tc.id, content: resultStr, name: tc.name }));
          } catch (e) {
            lcMessages.push(new ToolMessage({
              tool_call_id: tc.id, content: JSON.stringify({ error: e.message }), name: tc.name
            }));
          }
        }
        // Continue the MAX_TOOL_ROUNDS loop
      }
    }

    if (appointmentId) {
      try {
        const { getAppointmentService } = require('./appointmentService');
        const apptSvc = getAppointmentService();
        let fullResponse = responseChunks.join('');
        if (!fullResponse.trim()) {
          fullResponse = 'I could not produce a response for that request. Please try again with a specific scan module and target.';
          yield fullResponse;
        }
        const chatMessages = [
          ...messages,
          { role: 'assistant', content: fullResponse }
        ];

        // If chatId is provided, we update the existing chat
        if (chatId) {
          await apptSvc.updateChatMessages(chatId, chatMessages);
        } else {
          // It's a new chat, generate a title
          let generatedTitle = 'New Chat';
          try {
            const firstUserMsg = messages.find(m => m.role === 'user')?.content || '';
            if (firstUserMsg) {
              const titleLlm = this.getModel(provider, model);
              const titleRes = await titleLlm.invoke([
                { role: 'system', content: 'Generate a short 3-5 word title for this chat based on the user request. Output ONLY the title, no quotes, no prefix.' },
                { role: 'user', content: firstUserMsg }
              ]);
              generatedTitle = this._sanitizeChatTitle(titleRes.content, firstUserMsg);
            }
          } catch (err) {
            console.warn('Failed to auto-generate title:', err.message);
          }

          const newChat = await apptSvc.linkChat(appointmentId, {
            provider,
            model,
            title: generatedTitle,
            messages: chatMessages
          });
          
          // Yield a special system message to the frontend so it knows the new chatId
          yield `\n__CHAT_CREATED__:${JSON.stringify({ id: newChat.id, title: newChat.title })}`;
        }
      } catch (err) { 
        console.warn('Failed to persist chat:', err.message);
      }
    }
  }

  _shouldEnableTools(messages, sessionContext) {
    const lastUser = [...(messages || [])].reverse().find(m => m.role === 'user');
    const text = String(lastUser?.content || '');
    const lower = text.toLowerCase();

    if (/\b(?:do not|don't|dont|without|no)\s+(?:use|call|invoke|run\s+)?tools?\b/.test(lower)) {
      return false;
    }

    if (/\b(?:list_available_scans|get_scan_info|run_scan|get_scan_results|rag_search)\b/.test(lower)) {
      return true;
    }

    if (sessionContext && /results too large|indexed into the vector db|rag_search/i.test(sessionContext)) {
      return true;
    }

    const asksForExecution = /\b(?:run|launch|execute|start)\b/.test(lower);
    const mentionsScanTarget = /\b(?:scan|nmap|module|modules?|port|ports?|service|services?|header|headers?)\b/.test(lower);
    if (asksForExecution && mentionsScanTarget) {
      return true;
    }

    if (/\b(?:available scans?|scan modules?|modules? available|scan catalog|get scan info|scan details)\b/.test(lower)) {
      return true;
    }

    if (/\b(?:rag|knowledge base|vector|indexed|search past|search previous|semantic search)\b/.test(lower)) {
      return true;
    }

    if (/\b(?:get|check|poll|show|fetch)\b.*\b(?:session|scan results?|results)\b/.test(lower)) {
      return true;
    }

    return false;
  }

  _chunkText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map(part => {
        if (typeof part === 'string') return part;
        return part?.text || '';
      }).join('');
    }
    return '';
  }

  _compactScanResults(results) {
    if (!results || typeof results !== 'object') return results;
    try {
      return JSON.parse(JSON.stringify(results, (key, value) => {
        if (key === 'raw') return undefined;
        return value;
      }));
    } catch (_) {
      return results;
    }
  }

  _compactAppointmentContext(context) {
    if (!context || typeof context !== 'object') return context;

    const chats = Array.isArray(context.chats) ? context.chats : [];
    return {
      id: context.id,
      name: context.name,
      mode: context.mode,
      status: context.status,
      createdAt: context.createdAt,
      scans: (context.scans || []).map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        createdAt: s.createdAt,
      })),
      chats: chats.slice(-5).map(c => {
        const messages = Array.isArray(c.messages) ? c.messages : [];
        return {
          id: c.id,
          title: c.title,
          provider: c.provider,
          model: c.model,
          createdAt: c.createdAt,
          messageCount: messages.length,
        };
      }),
    };
  }

  _extractRequestedMarkers(messages) {
    const lastUser = [...(messages || [])].reverse().find(m => m.role === 'user');
    const text = String(lastUser?.content || '');
    const markers = new Set();
    for (const match of text.matchAll(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){1,}\b/g)) {
      markers.add(match[0]);
    }
    return Array.from(markers).slice(0, 5);
  }

  _sanitizeChatTitle(rawTitle, firstUserMsg = '') {
    const fallback = String(firstUserMsg || 'New Chat')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60)
      .replace(/[.,;:!?-]+$/, '')
      || 'New Chat';

    let title = this._chunkText(rawTitle)
      .replace(/['"`#*_>|]/g, '')
      .split(/\r?\n/)
      .find(Boolean);

    title = String(title || '').replace(/\s+/g, ' ').trim();
    const words = title.split(/\s+/).filter(Boolean);
    if (!title || title.length > 70 || words.length > 8) return fallback;
    return title.replace(/[.,;:!?-]+$/, '') || fallback;
  }

  _repairRunScanToolCalls(toolCalls, messages) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return;

    const inferred = this._inferRunScanToolCall(messages);
    if (!inferred) return;

    for (const tc of toolCalls) {
      if (tc.name !== 'run_scan') continue;
      if (!tc.args || typeof tc.args !== 'object' || Array.isArray(tc.args)) {
        tc.args = {};
      }
      if (!tc.args.moduleId) tc.args.moduleId = inferred.args.moduleId;
      if (!tc.args.target) tc.args.target = inferred.args.target;
      if (!tc.args.params || Object.keys(tc.args.params).length === 0) {
        tc.args.params = inferred.args.params || {};
      }
    }
  }

  _inferToolCallsFromPrompt(messages) {
    const calls = [];
    const lastUser = [...(messages || [])].reverse().find(m => m.role === 'user');
    const text = String(lastUser?.content || '');
    if (!text.trim()) return calls;

    const inferredRunScan = this._inferRunScanToolCall(messages);
    if (inferredRunScan) {
      calls.push(inferredRunScan);
      return calls;
    }

    const lower = text.toLowerCase();
    const idBase = Date.now();

    if (/\b(?:list_available_scans|available scans?|scan modules?|modules? available|scan catalog)\b/.test(lower)) {
      calls.push({
        id: `call_${idBase}_${calls.length}_inferred_list_scans`,
        name: 'list_available_scans',
        args: '',
      });
    }

    if (/\b(?:get_scan_info|scan details|details for|info for|module details)\b/.test(lower)) {
      let modules = [];
      try {
        const { getRegistry } = require('../modules/registry');
        modules = getRegistry().getAll();
      } catch (_) {}

      const moduleMeta = modules.length ? this._matchModuleFromPrompt(text, modules) : null;
      if (moduleMeta?.id) {
        calls.push({
          id: `call_${idBase}_${calls.length}_inferred_scan_info`,
          name: 'get_scan_info',
          args: moduleMeta.id,
        });
      }
    }

    return calls;
  }

  _inferRunScanToolCall(messages) {
    const lastUser = [...(messages || [])].reverse().find(m => m.role === 'user');
    const text = String(lastUser?.content || '');
    if (!text.trim()) return null;

    const lower = text.toLowerCase();
    if (/\b(?:do not|don't|dont|without|no)\s+(?:run|launch|execute|start)\b/.test(lower)) {
      return null;
    }

    const asksForExecution = /\b(run|launch|execute|start|scan)\b/.test(lower);
    if (!asksForExecution) return null;

    let modules = [];
    try {
      const { getRegistry } = require('../modules/registry');
      modules = getRegistry().getAll();
    } catch (_) {
      return null;
    }
    if (!modules.length) return null;

    const target = this._extractTargetFromPrompt(text);
    if (!target) return null;

    const moduleMeta = this._matchModuleFromPrompt(text, modules);
    if (!moduleMeta) return null;

    const params = this._extractScanParamsFromPrompt(text, moduleMeta);
    let normalizedTarget = target;
    const moduleText = `${moduleMeta.id || ''} ${moduleMeta.name || ''}`.toLowerCase();
    if (moduleText.includes('header') && !/^https?:\/\//i.test(normalizedTarget)) {
      normalizedTarget = `https://${normalizedTarget}`;
    }

    return {
      id: `call_${Date.now()}_inferred_run_scan`,
      name: 'run_scan',
      args: {
        moduleId: moduleMeta.id,
        target: normalizedTarget,
        params,
      },
    };
  }

  _extractTargetFromPrompt(text) {
    const patterns = [
      /https?:\/\/[^\s"'<>),]+/i,
      /\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/,
      /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        let str = match[0];
        while (str.length > 0 && /[.,;:!?]/.test(str[str.length - 1])) {
          str = str.slice(0, -1);
        }
        return str;
      }
    }
    return null;
  }

  _matchModuleFromPrompt(text, modules) {
    const normalizedPrompt = this._normalizeToolText(text);
    const scored = modules.map(m => {
      const moduleText = `${m.id || ''} ${m.name || ''} ${m.description || ''}`;
      const normalizedModule = this._normalizeToolText(moduleText);
      let score = 0;

      if (m.id && text.includes(m.id)) score += 100;
      if ((m.id || '').toLowerCase().includes('http') && /\b(http|header|headers)\b/.test(text.toLowerCase())) score += 30;
      if ((m.id || '').toLowerCase().includes('port') && /\b(port|ports|service|services|version)\b/.test(text.toLowerCase())) score += 30;
      if ((m.id || '').toLowerCase().includes('quick') && /\b(host discovery|discover|ping|live hosts?|quick)\b/.test(text.toLowerCase())) score += 30;
      if ((m.name || '').toLowerCase().includes('header') && /\bheader|headers\b/.test(text.toLowerCase())) score += 25;
      if ((m.name || '').toLowerCase().includes('port') && /\bport|ports|service|services\b/.test(text.toLowerCase())) score += 25;

      for (const token of normalizedPrompt.split(' ').filter(Boolean)) {
        if (token.length >= 4 && normalizedModule.includes(token)) score += 1;
      }

      return { module: m, score };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);

    if (scored.length === 0) return null;
    if (scored.length === 1 || scored[0].score > scored[1].score) return scored[0].module;

    return null;
  }

  _extractScanParamsFromPrompt(text, moduleMeta) {
    const params = {};
    const moduleText = `${moduleMeta.id || ''} ${moduleMeta.name || ''}`.toLowerCase();

    if (moduleText.includes('port')) {
      const portsMatch = text.match(/\bports?(?:\s+(?:are|is))?\s*[:=]?\s*([0-9][0-9,\- ]*)\b/i);
      if (portsMatch && portsMatch[1]) {
        params.ports = portsMatch[1].replace(/\s+/g, '').replace(/,+$/, '');
      }

      const timingMatch = text.match(/\bT([0-5])\b/i) || text.match(/\btiming\s*(?:(?:is|=|:)\s*)?([0-5])\b/i);
      if (timingMatch && timingMatch[1]) {
        params.timing = `T${timingMatch[1]}`;
      }
    }

    return params;
  }

  _normalizeToolText(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  async _waitForScanCompletion(scanService, sessionId, timeoutMs = 45000) {
    const terminalStatuses = new Set(['completed', 'failed', 'failed_permanent']);
    const startedAt = Date.now();
    let lastSession = await scanService.get(sessionId);

    while (Date.now() - startedAt < timeoutMs) {
      if (lastSession && terminalStatuses.has(lastSession.status)) {
        return lastSession;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      lastSession = await scanService.get(sessionId);
    }

    return lastSession || await scanService.get(sessionId);
  }

  /** Human-friendly tool name for UI display */
  _toolDisplayName(name) {
    const map = {
      list_available_scans: 'Discovering available scans',
      get_scan_info: 'Reading scan details',
      run_scan: 'Launching scan',
      get_scan_results: 'Checking scan results',
      rag_search: 'Searching indexed results',
    };
    return map[name] || name;
  }

  _summarizeScanResults(results) {
    const lines = ['Scan result summary:'];
    for (const [target, modules] of Object.entries(results || {})) {
      lines.push(`Target: ${target}`);
      for (const [moduleId, res] of Object.entries(modules || {})) {
        lines.push(`- ${moduleId}: ${res?.status || 'unknown'}`);
        const parsedOutput = this._parseModuleOutput(res?.output);
        if (parsedOutput && (parsedOutput.found_headers || parsedOutput.missing_headers)) {
          const found = Object.entries(parsedOutput.found_headers || {});
          if (found.length > 0) {
            lines.push(`  Present headers: ${found.map(([k, v]) => `${k}=${v}`).join('; ')}`);
          } else {
            lines.push('  Present headers: none reported');
          }
          const missing = parsedOutput.missing_headers || [];
          lines.push(`  Missing headers: ${missing.length ? missing.join(', ') : 'none reported'}`);
          continue;
        }

        if (parsedOutput?.data?.ports || parsedOutput?.data?.openCount !== undefined) {
          const data = parsedOutput.data;
          if (data.host) lines.push(`  Host: ${data.host}`);
          if (data.openCount !== undefined) lines.push(`  Open ports: ${data.openCount}`);
          const ports = Array.isArray(data.ports) ? data.ports : [];
          if (ports.length > 0) {
            lines.push(`  Ports: ${ports.map(p => `${p.port} ${p.state || ''} ${p.service || ''}`.trim()).join('; ')}`);
          }
          continue;
        }

        if (parsedOutput?.data?.hosts || parsedOutput?.data?.hostsUp !== undefined) {
          const data = parsedOutput.data;
          if (data.totalScanned !== undefined && data.totalScanned !== null) lines.push(`  Total scanned: ${data.totalScanned}`);
          if (data.hostsUp !== undefined) lines.push(`  Hosts up: ${data.hostsUp}`);
          const hosts = Array.isArray(data.hosts) ? data.hosts : [];
          if (hosts.length > 0) {
            lines.push(`  Hosts: ${hosts.map(h => `${h.host}${h.latency ? ` (${h.latency})` : ''}`).join('; ')}`);
          }
          continue;
        }

        const output = typeof res?.output === 'string' ? res.output.trim() : '';
        if (output) {
          lines.push(`  Output: ${output.slice(0, 900)}${output.length > 900 ? '...' : ''}`);
        }
      }
    }
    return lines.join('\n');
  }

  _parseModuleOutput(output) {
    if (typeof output !== 'string' || !output.trim()) return null;
    try { return JSON.parse(output); } catch (_) { return null; }
  }

  _formatApprovedToolSummary(name, resultStr) {
    let result = null;
    try { result = JSON.parse(resultStr); } catch (_) {}

    if (result?.error) {
      return `${this._toolDisplayName(name)} failed: ${result.error}`;
    }

    if (name === 'run_scan') {
      const sessionId = result?.sessionId ? `\`${result.sessionId}\`` : 'a new session';
      const status = result?.status || 'started';
      let summary = `Approved and launched scan ${sessionId}. Current status: ${status}.`;

      if (result?.results && typeof result.results === 'object') {
        summary += `\n\n${this._summarizeScanResults(result.results)}`;
      } else if (result?.results) {
        summary += `\n\nResult snapshot: ${String(result.results).slice(0, 1200)}`;
      } else {
        summary += '\n\nThe scan is queued or running. Open Power User or the appointment details to follow progress.';
      }

      return summary;
    }

    if (resultStr) {
      return `${this._toolDisplayName(name)} completed: ${resultStr.slice(0, 1200)}${resultStr.length > 1200 ? '...' : ''}`;
    }

    return `${this._toolDisplayName(name)} completed.`;
  }

  /**
   * Non-streaming single response.
   */
  async invoke({ provider, model, messages, sessionContext, appointmentId }) {
    // Sliding window: keep only the last 20 messages
    const RECENT_MESSAGE_LIMIT = 20;
    const fullMessages = messages.length > RECENT_MESSAGE_LIMIT 
      ? messages.slice(-RECENT_MESSAGE_LIMIT) 
      : [...messages];
    if (sessionContext) {
      fullMessages.unshift({ role: 'system', content: sessionContext });
    }
    if (appointmentId) {
      try {
        const { getAppointmentService } = require('./appointmentService');
        const apptContext = await getAppointmentService().getFullContext(appointmentId);
        if (apptContext) {
          fullMessages.unshift({ role: 'system', content: `\nActive Appointment Context:\n${JSON.stringify(this._compactAppointmentContext(apptContext), null, 2)}` });
        }
      } catch (e) {
        console.warn(`Failed to get appointment context for ${appointmentId}:`, e.message);
      }
    }
    const lcMessages = this.buildMessages(fullMessages);
    const llm        = this.getModel(provider, model);
    const response   = await llm.invoke(lcMessages);
    return typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
  }

  /**
   * Helper to check if a module is installed
   */
  _isPackageInstalled(pkgName) {
    try {
      const fs = require('fs');
      const path = require('path');
      const pkgPath = path.join(__dirname, '../../package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.dependencies && pkg.dependencies[pkgName]) return true;
      if (pkg.devDependencies && pkg.devDependencies[pkgName]) return true;
      return false;
    } catch (_) {
      try {
        require.resolve(pkgName);
        return true;
      } catch (__) {
        return false;
      }
    }
  }

  /**
   * List available providers, their install status, and models from the store.
   */
  async listProviders() {
    const aiModelsStore = require('./aiModelsStore');
    
    // Check if anthropic API key is available
    const anthropicConfigured = !!config.anthropicApiKey && !config.anthropicApiKey.includes('mock');
    
    const providers = [
      {
        id:          'groq',
        name:        'GroqCloud',
        pkg:         '@langchain/groq',
        installed:   this._isPackageInstalled('@langchain/groq'),
        configured:  !!config.groqApiKey && !config.groqApiKey.includes('mock'),
        defaultModel: 'llama-3.1-8b-instant',
        models:      aiModelsStore.getModels('groq'),
      },
      {
        id:          'openai',
        name:        'OpenAI',
        pkg:         '@langchain/openai',
        installed:   this._isPackageInstalled('@langchain/openai'),
        configured:  !!config.openaiApiKey && !config.openaiApiKey.includes('mock'),
        defaultModel: 'gpt-4o-mini',
        models:      aiModelsStore.getModels('openai'),
      },
      {
        id:          'ollama',
        name:        'Ollama (Local)',
        pkg:         '@langchain/ollama',
        installed:   this._isPackageInstalled('@langchain/ollama'),
        configured:  true,
        local:       true,
        defaultModel: 'llama3',
        models:      await this._getOllamaModels(),
      },
      {
        id:          'anthropic',
        name:        'Anthropic',
        pkg:         '@langchain/anthropic',
        installed:   this._isPackageInstalled('@langchain/anthropic'),
        configured:  anthropicConfigured,
        defaultModel: 'claude-3-5-sonnet-latest',
        models:      aiModelsStore.getModels('anthropic'),
      },
      {
        id:          'gemini',
        name:        'Google Gemini',
        pkg:         '@langchain/google-genai',
        installed:   this._isPackageInstalled('@langchain/google-genai'),
        configured:  !!config.geminiApiKey && !config.geminiApiKey.includes('mock'),
        defaultModel: 'gemini-1.5-pro',
        models:      aiModelsStore.getModels('gemini'),
      },
      {
        id:          'mistralai',
        name:        'Mistral AI',
        pkg:         '@langchain/mistralai',
        installed:   this._isPackageInstalled('@langchain/mistralai'),
        configured:  !!config.mistralApiKey && !config.mistralApiKey.includes('mock'),
        defaultModel: 'mistral-large-latest',
        models:      aiModelsStore.getModels('mistralai'),
      },
      {
        id:          'cohere',
        name:        'Cohere',
        pkg:         '@langchain/cohere',
        installed:   this._isPackageInstalled('@langchain/cohere'),
        configured:  !!config.cohereApiKey && !config.cohereApiKey.includes('mock'),
        defaultModel: 'command-r-plus',
        models:      aiModelsStore.getModels('cohere'),
      }
    ];
    return providers;
  }

  /** Probe Ollama for installed models – returns [] on failure. */
  async _getOllamaModels() {
    try {
      const http = require('http');
      return await new Promise((resolve) => {
        const url = new URL(`${config.ollamaBaseUrl}/api/tags`);
        const req = http.get({ hostname: url.hostname, port: url.port || 11434, path: url.pathname, timeout: 2000 }, (res) => {
          let data = '';
          res.on('data', c => (data += c));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve((parsed.models || []).map(m => m.name));
            } catch (_) { resolve([]); }
          });
        });
        req.on('error', () => resolve([]));
        req.on('timeout', () => { req.destroy(); resolve([]); });
      });
    } catch (_) {
      return [];
    }
  }

  /** Dynamically fetch models from provider APIs and save to store */
  async fetchModelsFromAPI(provider) {
    const aiModelsStore = require('./aiModelsStore');
    let models = [];
    try {
      if (provider === 'openai' && config.openaiApiKey) {
        const res = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': `Bearer ${config.openaiApiKey}` }});
        if (res.ok) {
          const data = await res.json();
          models = data.data.map(m => m.id).filter(id => id.includes('gpt'));
        }
      } else if (provider === 'groq' && config.groqApiKey) {
        const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { 'Authorization': `Bearer ${config.groqApiKey}` }});
        if (res.ok) {
          const data = await res.json();
          models = data.data.map(m => m.id);
        }
      } else if (provider === 'gemini' && config.geminiApiKey) {
        // Simplified fetch for Gemini (requires proper endpoint structure)
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${config.geminiApiKey}`);
        if (res.ok) {
          const data = await res.json();
          models = data.models.map(m => m.name.replace('models/', ''));
        }
      } else if (provider === 'anthropic' && config.anthropicApiKey) {
        const res = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': config.anthropicApiKey, 'anthropic-version': '2023-06-01' }});
        if (res.ok) {
          const data = await res.json();
          models = data.data.map(m => m.id);
        }
      }
      
      if (models.length > 0) {
        aiModelsStore.setModels(provider, models);
        return models;
      }
      throw new Error('No models found or API returned an error.');
    } catch (err) {
      console.error('Failed to fetch models for %s:', provider, err);
      throw err;
    }
  }
}

let _instance = null;
function getAIService() {
  if (!_instance) _instance = new AIService();
  return _instance;
}
function _resetAIService() { _instance = null; }

module.exports = { getAIService, AIService, _resetAIService };
