'use strict';

/* ── AI Chat module ───────────────────────────────────────────────────────── */

const AIChat = (() => {
  let _messages   = [];           // { role, content }
  let _sessionIds = [];           // array of session IDs
  let _streaming  = false;
  let _abortCtrl  = null;
  let _initialized = false;
  let _appointmentId = null;
  let _activeChatId = null;
  let _availableChats = [];

  // ── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    if (!_initialized) {
      WsClient.on('SCAN_UPDATE', (msg) => {
        if (msg.session?.id && _sessionIds.includes(msg.session.id) && msg.session.status === 'completed') {
          document.getElementById('ai-context-indicator').textContent =
            `📎 ${_sessionIds.length} Scan(s) attached (results updated)`;
        }
      });
      _initialized = true;
    }
    await loadProviders();
    await updateRagStats();
  }

  // ── Providers & Models ────────────────────────────────────────────────────

  let _allProviders = [];

  async function loadProviders() {
    try {
      const data = await API.ai.providers();
      _allProviders = data.providers || [];
      const pSel = document.getElementById('ai-provider');
      
      const installedProviders = _allProviders.filter(p => p.installed || p.local);
      const uninstalledProviders = _allProviders.filter(p => !p.installed && !p.local);

      let html = '';
      if (installedProviders.length > 0) {
        html += '<optgroup label="Installed">';
        html += installedProviders.map(p => {
          let label = p.name;
          if (!p.configured && !p.local) label += ' (No API Key)';
          return `<option value="${p.id}">${label}</option>`;
        }).join('');
        html += '</optgroup>';
      }

      if (uninstalledProviders.length > 0) {
        html += '<optgroup label="Available to Install">';
        html += uninstalledProviders.map(p => {
          return `<option value="${p.id}">${p.name} (Not installed)</option>`;
        }).join('');
        html += '</optgroup>';
      }

      // Preserve selection if possible, otherwise select first installed
      const currentVal = pSel.value;
      pSel.innerHTML = html;

      if (currentVal && _allProviders.find(p => p.id === currentVal)) {
        pSel.value = currentVal;
      } else if (installedProviders.length > 0) {
        pSel.value = installedProviders[0].id;
      } else if (_allProviders.length > 0) {
        pSel.value = _allProviders[0].id;
      }
      
      onProviderChange();
    } catch (_) {}
  }

  function onProviderChange() {
    const pid = document.getElementById('ai-provider').value;
    const p = _allProviders.find(x => x.id === pid);
    if (!p) return;
    
    // Update package install button
    const pkgBtn = document.getElementById('ai-pkg-btn');
    if (p.local) {
      pkgBtn.classList.add('hidden');
    } else {
      pkgBtn.classList.remove('hidden');
      if (p.installed) {
        pkgBtn.textContent = 'Uninstall';
        pkgBtn.className = 'btn btn-ghost btn-sm text-red-500';
      } else {
        pkgBtn.textContent = 'Install';
        pkgBtn.className = 'btn btn-primary btn-sm';
      }
    }
    
    renderModels(p);
  }

  function renderModels(provider) {
    const sel = document.getElementById('ai-model');
    const models = provider.models && provider.models.length > 0 ? provider.models : [provider.defaultModel];
    
    sel.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
    
    // Attempt to set previous or default model
    if (provider.defaultModel && models.includes(provider.defaultModel)) {
      sel.value = provider.defaultModel;
    } else if (models.length > 0) {
      sel.value = models[0];
    }
  }

  async function togglePackage() {
    const pid = document.getElementById('ai-provider').value;
    const p = _allProviders.find(x => x.id === pid);
    if (!p || p.local) return;
    
    const isInstalling = !p.installed;
    const btn = document.getElementById('ai-pkg-btn');
    btn.disabled = true;
    btn.textContent = isInstalling ? 'Installing...' : 'Uninstalling...';
    
    try {
      if (isInstalling) {
        await API.ai.installPackage(pid);
        showToast(`Successfully installed package for ${p.name}`);
      } else {
        await API.ai.uninstallPackage(pid);
        showToast(`Successfully uninstalled package for ${p.name}`);
      }
      await loadProviders();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      btn.disabled = false;
      onProviderChange();
    }
  }

  function manageModels() {
    const pid = document.getElementById('ai-provider').value;
    const p = _allProviders.find(x => x.id === pid);
    if (!p) return;

    document.getElementById('manage-models-title').textContent = `${p.name} Models`;
    const listEl = document.getElementById('model-list-ui');
    listEl.innerHTML = p.models.map(m => `
      <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);">
        <span>${m}</span>
        <button class="btn btn-ghost btn-sm text-red-500" onclick="AIChat.removeModel('${m}')">Remove</button>
      </div>
    `).join('');

    const modal = document.getElementById('manage-models-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }

  function closeManageModels() {
    const modal = document.getElementById('manage-models-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }

  async function fetchModels() {
    const pid = document.getElementById('ai-provider').value;
    const btn = document.getElementById('btn-fetch-models');
    btn.disabled = true;
    btn.textContent = 'Fetching...';
    try {
      await API.ai.fetchModels(pid);
      showToast('Successfully fetched latest models from API');
      await loadProviders();
      manageModels(); // refresh dialog UI
    } catch (e) {
      showToast('Failed to fetch models: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Fetch Latest API Models';
    }
  }

  async function addModel() {
    const pid = document.getElementById('ai-provider').value;
    const input = document.getElementById('new-model-name');
    const val = input.value.trim();
    if (!val) return;
    try {
      await API.ai.addModel(pid, val);
      input.value = '';
      await loadProviders();
      manageModels();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function removeModel(modelName) {
    const pid = document.getElementById('ai-provider').value;
    if (!(await Dialog.confirm(`Remove model ${modelName}?`))) return;
    try {
      await API.ai.removeModel(pid, modelName);
      await loadProviders();
      manageModels();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  // ── Session context ────────────────────────────────────────────────────────

  async function setAppointmentId(id) {
    _appointmentId = id;
    _activeChatId = null;
    clearChat();
    
    if (id) {
      try {
        const data = await API.appointments.chats(id);
        _availableChats = data.chats || [];
      } catch (e) {
        console.error('Failed to load chats for appointment', e);
      }
    } else {
      _availableChats = [];
    }
    _renderChatHistory();
  }

  function loadChat(chatId) {
    _activeChatId = chatId || null;
    if (_abortCtrl) { _abortCtrl.abort(); _abortCtrl = null; }
    _streaming = false;
    
    _renderChatHistory();
    
    if (!chatId) {
      // It's a new chat
      _messages = [];
      _renderMessages();
      return;
    }
    
    const chat = _availableChats.find(c => c.id === chatId);
    if (chat) {
      _messages = chat.messages || [];
      _renderMessages();
    }
  }

  function startNewChat() {
    loadChat('');
  }

  async function renameChat() {
    if (!_activeChatId) {
      showToast('No active chat selected to rename', 'error');
      return;
    }
    const chat = _availableChats.find(c => c.id === _activeChatId);
    const newTitle = await Dialog.prompt('Enter new chat title:', chat ? chat.title : '');
    if (newTitle && newTitle.trim()) {
      try {
        await API.appointments.updateChatTitle(_appointmentId, _activeChatId, newTitle.trim());
        if (chat) chat.title = newTitle.trim();
        _renderChatHistory();
        showToast('Chat renamed');
      } catch (e) {
        showToast('Failed to rename chat', 'error');
      }
    }
  }

  function _renderMessages() {
    const container = document.getElementById('chat-messages');
    if (_messages.length === 0) {
      container.innerHTML = `
        <div class="chat-welcome">
          <div class="chat-welcome-icon">◆</div>
          <h3>AI Security Assistant</h3>
          <p>Ask me to explain scan results, identify vulnerabilities, or suggest remediation steps.<br><br>
          <em style="color:var(--fg-4);">Tip: Run a scan in Power User, then click "📎 Attach" to add it as context.</em></p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = '';
    for (const msg of _messages) {
      if (msg.role === 'system') continue;
      _appendBubble(msg.role, msg.content);
    }
    _scrollToBottom();
  }

  function _renderChatHistory() {
    const list = document.getElementById('chat-history-list');
    if (!list) return;
    
    let html = '';
    for (const chat of _availableChats) {
      const activeCls = (chat.id === _activeChatId) ? 'active' : '';
      const title = chat.title || chat.id.split('-')[0] + '...';
      html += `
        <div class="chat-history-item ${activeCls}" onclick="AIChat.loadChat('${chat.id}')">
          <div class="chat-history-item-title">${_escHtml(title)}</div>
        </div>
      `;
    }
    list.innerHTML = html;
  }

  function attachSessionId(sessionId) {
    if (!sessionId) return;
    if (!_sessionIds.includes(sessionId)) {
      _sessionIds.push(sessionId);
      WsClient.subscribe(sessionId);
    }
    const ind = document.getElementById('ai-context-indicator');
    ind.textContent = `📎 ${_sessionIds.length} Scan session(s) attached`;
    ind.style.color = 'var(--accent-green)';
    const badgeName = document.getElementById('session-badge-name');
    if (badgeName) badgeName.textContent = `${_sessionIds.length} scan(s) attached`;
    document.getElementById('session-badge')?.classList.remove('hidden');
  }

  function clearAttachedSessions() {
    _sessionIds = [];
    const ind = document.getElementById('ai-context-indicator');
    ind.textContent = 'No scan context attached';
    ind.style.color = '';
    const badgeName = document.getElementById('session-badge-name');
    if (badgeName) badgeName.textContent = '';
    document.getElementById('session-badge')?.classList.add('hidden');
  }

  async function attachSession() {
    const sid = PowerUser.getActiveSession();
    if (sid) {
      attachSessionId(sid);
      showToast('Scan context attached');
      return;
    }

    const appointmentId = typeof Appointments !== 'undefined' ? Appointments.getActive() : null;
    if (appointmentId) {
      try {
        const res = await API.appointments.scans(appointmentId);
        const scans = res.scans || [];
        if (scans.length > 0) {
          scans.forEach(s => attachSessionId(s.id));
          showToast(`${scans.length} appointment scan(s) attached`);
          return;
        }
      } catch (err) {
        showToast(`Failed to load appointment scans: ${err.message}`, 'error');
        return;
      }
    }

    showToast('Run a scan first in Power User tab', 'error');
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  let _currentBubbleId = null;

  async function send(resumeArgs = null) {
    if (_streaming) return;

    const provider = document.getElementById('ai-provider').value;
    const model    = document.getElementById('ai-model').value;
    const providerMeta = _allProviders.find(p => p.id === provider);
    
    if (!resumeArgs) {
      const input   = document.getElementById('chat-input');
      const content = input.value.trim();
      if (!content) return;

      if (!_appointmentId) {
        showToast('Please create or select an active appointment first.', 'error');
        return;
      }

      if (providerMeta && !providerMeta.local) {
        if (providerMeta.installed === false) {
          showToast(`Install the ${providerMeta.name} package before chatting with this provider.`, 'error');
          return;
        }
        if (providerMeta.configured === false) {
          showToast(`Configure an API key for ${providerMeta.name} before chatting with this provider.`, 'error');
          return;
        }
      }

      input.value = '';
      _messages.push({ role: 'user', content });
      _appendBubble('user', content);
      _scrollToBottom();
    }

    const bubbleId = `bubble-${Date.now()}`;
    _currentBubbleId = bubbleId;
    _appendBubble('assistant', '', bubbleId, true);
    _streaming = true;

    let fullContent = '';
    let doneHandled = false;
    let hasError = false;
    let interceptedToolCalls = null;

    const payload = { 
      provider, 
      model, 
      messages: _messages, 
      sessionIds: _sessionIds, 
      appointmentId: _appointmentId, 
      chatId: _activeChatId 
    };

    if (resumeArgs) {
      payload.pendingToolCalls = resumeArgs.pendingToolCalls;
      payload.denyTools = resumeArgs.denyTools;
    }

    _abortCtrl = API.ai.chat(
      payload,
      (chunk) => {
        if (chunk.includes('__CHAT_CREATED__:')) {
          try {
            const match = chunk.match(/__CHAT_CREATED__:(.*)/);
            if (match && match[1]) {
              const info = JSON.parse(match[1]);
              _activeChatId = info.id;
              _availableChats.push({ id: info.id, title: info.title, messages: [..._messages] });
              _renderChatHistory();
            }
          } catch (e) {}
          return;
        }

        if (chunk.includes('__TOOL_CONFIRMATION__:')) {
          try {
            const match = chunk.match(/__TOOL_CONFIRMATION__:(.*)/);
            if (match && match[1]) {
              interceptedToolCalls = JSON.parse(match[1]);
              fullContent += chunk.split('__TOOL_CONFIRMATION__:')[0];
            }
          } catch (e) {}
          return;
        }

        fullContent += chunk;
        const el = document.getElementById(bubbleId);
        if (el && !hasError) el.innerHTML = _renderContent(fullContent);
        _scrollToBottom();
      },
      () => {
        if (doneHandled) return;
        doneHandled = true;
        
        if (!hasError) {
          const el = document.getElementById(bubbleId);
          if (el) {
            el.classList.remove('streaming');
            let finalHtml = _renderContent(fullContent);
            if (interceptedToolCalls) {
              finalHtml += `<br><span style="color:var(--amber);font-style:italic;font-size:0.75rem;">(Waiting for tool execution approval...)</span>`;
            } else if (!fullContent.replace(/🔧.*?\n/g, '').trim()) {
              finalHtml += `<br><span style="color:var(--fg-4);font-style:italic;font-size:0.75rem;">(The AI stopped responding after making tool calls)</span>`;
            }
            el.innerHTML = finalHtml;
          }
          
          if (interceptedToolCalls) {
            _messages.push({ role: 'assistant', content: fullContent, tool_calls: interceptedToolCalls });
          } else {
            _messages.push({ role: 'assistant', content: fullContent });
            _attachLaunchedScanIds(fullContent);
          }
          
          if (_activeChatId) {
             const chat = _availableChats.find(c => c.id === _activeChatId);
             if (chat) chat.messages = [..._messages];
          }
        }
        
        _streaming  = false;
        _abortCtrl = null;

        if (interceptedToolCalls) {
          _showToolConfirmation(interceptedToolCalls);
        }
      },
      (err) => {
        hasError = true;
        const el = document.getElementById(bubbleId);
        if (el) {
          el.classList.remove('streaming');
          el.textContent = `[Error] ${err.message}`;
          el.style.color = 'var(--accent-red)';
        }
        _streaming = false;
      }
    );
  }

  async function _showToolConfirmation(toolCalls) {
    const modal = document.getElementById('tool-confirm-modal');
    const detailsEl = document.getElementById('tool-confirm-details');
    const btnAllow = document.getElementById('tool-confirm-allow');
    const btnDeny = document.getElementById('tool-confirm-deny');

    detailsEl.innerHTML = '<span style="color:var(--fg-4);">Loading details...</span>';
    modal.classList.remove('hidden');
    btnAllow.disabled = true;
    btnDeny.disabled = true;

    try {
      const runScanTool = toolCalls.find(tc => tc.name === 'run_scan');
      if (runScanTool && runScanTool.args && runScanTool.args.moduleId) {
          const data = await API.modules.list();
          const categories = data.categories || {};
          let meta = null;
          const normalizedFetch = (runScanTool.args.moduleId || '').toLowerCase().replace(/[-_ ]/g, '');
          for (const mods of Object.values(categories)) {
            meta = mods.find(m => {
               const normId = m.id.toLowerCase().replace(/[-_ ]/g, '');
               const normName = m.name.toLowerCase().replace(/[-_ ]/g, '');
               return m.id === runScanTool.args.moduleId || 
                      m.id.endsWith('_' + runScanTool.args.moduleId) || 
                      m.id.endsWith('-' + runScanTool.args.moduleId) ||
                      normId.includes(normalizedFetch) || normalizedFetch.includes(normId) ||
                      normName.includes(normalizedFetch) || normalizedFetch.includes(normName) ||
                      m.name === runScanTool.args.moduleId;
            });
            if (meta) break;
          }
          
          if (meta) {
             let html = `
               <div style="margin-bottom: 16px;">
                 <h3 style="margin:0; font-size: 1.2rem; display:flex; align-items:center; gap:8px;">
                   <span class="role-badge" style="background:var(--bg-2); border-color:var(--border);">${meta.category}</span> ${meta.name}
                 </h3>
                 <p style="margin:4px 0 0 0; color:var(--fg-4); font-size:0.85rem; font-style:italic;">${meta.description}</p>
               </div>
               <div class="field-group" style="margin-bottom: 12px;">
                 <label class="input-label" style="font-family:var(--font-mono); font-size:0.65rem;">TARGET</label>
                 <div class="input" style="background:var(--bg-1); cursor:not-allowed; border-color:var(--bg-2);">${_escHtml(runScanTool.args.target)}</div>
               </div>
             `;
             if (runScanTool.args.params && Object.keys(runScanTool.args.params).length > 0) {
                html += `<div class="field-group"><label class="input-label" style="font-family:var(--font-mono); font-size:0.65rem;">PARAMETERS</label>`;
                for (const [k, v] of Object.entries(runScanTool.args.params)) {
                   html += `<div style="display:flex; justify-content:space-between; padding:6px 8px; border-bottom:1px solid var(--border); background:var(--bg-1); border-radius:4px; margin-bottom:4px;">
                              <span style="color:var(--fg-3); font-family:var(--font-mono); font-size:0.75rem; font-weight:bold;">${_escHtml(k)}</span>
                              <span style="font-family:var(--font-mono); font-size:0.75rem;">${_escHtml(String(v))}</span>
                            </div>`;
                }
                html += `</div>`;
             }
             detailsEl.innerHTML = html;
             detailsEl.style.whiteSpace = 'normal';
             detailsEl.style.fontFamily = 'var(--font-sans)';
          } else {
             detailsEl.innerHTML = `<pre style="margin:0; font-family:var(--font-mono); font-size:0.75rem; white-space:pre-wrap;">${_escHtml(JSON.stringify(toolCalls, null, 2))}</pre>`;
          }
      } else {
        detailsEl.innerHTML = `<pre style="margin:0; font-family:var(--font-mono); font-size:0.75rem; white-space:pre-wrap;">${_escHtml(JSON.stringify(toolCalls, null, 2))}</pre>`;
      }
    } catch (e) {
      detailsEl.innerHTML = `<pre style="margin:0; font-family:var(--font-mono); font-size:0.75rem; white-space:pre-wrap;">${_escHtml(JSON.stringify(toolCalls, null, 2))}</pre>`;
    } finally {
      btnAllow.disabled = false;
      btnDeny.disabled = false;
    }

    const handleDeny = () => {
      cleanup();
      send({ pendingToolCalls: toolCalls, denyTools: true });
    };

    const handleAllow = () => {
      cleanup();
      send({ pendingToolCalls: toolCalls, denyTools: false });
    };

    const cleanup = () => {
      modal.classList.add('hidden');
      btnAllow.removeEventListener('click', handleAllow);
      btnDeny.removeEventListener('click', handleDeny);
    };

    btnAllow.addEventListener('click', handleAllow);
    btnDeny.addEventListener('click', handleDeny);
  }

  function clearChat() {
    if (_abortCtrl) { _abortCtrl.abort(); _abortCtrl = null; }
    _messages = [];
    _streaming = false;
    clearAttachedSessions();
    const container = document.getElementById('chat-messages');
    container.innerHTML = `
      <div class="chat-welcome">
        <div class="chat-welcome-icon">◆</div>
        <h3>AI Security Assistant</h3>
        <p>Ask me to explain scan results, identify vulnerabilities, or suggest remediation steps.<br><br>
        <em style="color:var(--fg-4);">Tip: Run a scan in Power User, then click "📎 Attach" to add it as context.</em></p>
      </div>
    `;
  }

  function focusInput() {
    document.getElementById('chat-input')?.focus();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _appendBubble(role, content, id, streaming = false) {
    const welcome = document.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-bubble ${role === 'user' ? 'user' : 'assistant'}`;
    const avatarChar = role === 'user'
      ? (Auth.getUser()?.username?.[0] || 'U').toUpperCase()
      : '🤖';

    const finalContent = role === 'assistant' ? _renderContent(content) : _escHtml(content).replace(/\n/g, '<br>');

    div.innerHTML = `
      <div class="bubble-meta"><div class="bubble-meta-icon">${avatarChar}</div><span>${role === 'assistant' ? 'AI Assistant' : 'You'}</span></div>
      <div class="bubble-content ${streaming ? 'streaming' : ''}" ${id ? `id="${id}"` : ''}>${finalContent}</div>
    `;
    container.appendChild(div);
    _scrollToBottom();
    return div;
  }

  function _escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /** Render streamed AI content into styled HTML with tool-call action cards */
  function _renderContent(raw) {
    // Hide leaked <function=...> blocks from rendering
    const cleanedRaw = raw.replace(/<function=[^>]+>[\s\S]*?(?:<\/function>|$)/g, '').trim();
    const lines = cleanedRaw.split('\n');
    let html = '';
    let inToolGroup = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Tool-call action card: lines starting with 🔧
      const toolMatch = line.match(/^🔧\s*\*\*(.+?)\*\*(.*)$/);
      if (toolMatch) {
        if (!inToolGroup) {
          html += `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;">`;
          inToolGroup = true;
        }
        const toolName = _escHtml(toolMatch[1]);
        const extra = _escHtml(toolMatch[2] || '');
        html += `<div style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:var(--amber-glow);border:1px solid var(--amber-dim);border-left:3px solid var(--amber);font-size:0.75rem;border-radius:4px;"><span style="font-family:var(--font-mono);font-size:0.65rem;font-weight:700;text-transform:uppercase;color:var(--amber);">${toolName}</span>${extra ? `<span style="font-family:var(--font-mono);font-size:0.65rem;color:var(--fg-4);font-style:italic;">${extra}</span>` : ''}</div>`;
        continue;
      }

      if (!line.trim()) {
        if (inToolGroup) continue;
        if (i === 0 || i === lines.length - 1) continue;
      }

      if (inToolGroup) {
        html += `</div>`;
        inToolGroup = false;
      }

      // Normal line — basic markdown
      let safe = _escHtml(line);
      safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      safe = safe.replace(/`(.+?)`/g, '<code>$1</code>');
      html += safe + (i < lines.length - 1 ? '<br>' : '');
    }

    if (inToolGroup) {
      html += `</div>`;
    }

    return html;
  }

  function _scrollToBottom() {
    const c = document.getElementById('chat-messages');
    if (c) c.scrollTop = c.scrollHeight;
  }

  // ── RAG Search ────────────────────────────────────────────────────────────

  async function updateRagStats() {
    try {
      const { stats } = await API.rag.stats();
      const countEl = document.getElementById('rag-doc-count');
      if (countEl && stats) {
        const count = stats.totalCount ?? stats.documents ?? stats.chunks ?? 0;
        countEl.textContent = `${count} documents indexed`;
      }
    } catch (_) {}
  }

  async function ragSearch() {
    const input = document.getElementById('rag-search-input');
    const query = input.value.trim();
    if (!query) return;

    const listEl = document.getElementById('rag-results-list');
    const container = document.getElementById('rag-results');
    
    container.classList.remove('hidden');
    listEl.innerHTML = '<p style="padding:12px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">Searching vector database...</p>';

    try {
      const { results } = await API.rag.search(query);
      
      if (!results || results.length === 0) {
        listEl.innerHTML = '<p style="padding:12px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">No relevant context found.</p>';
        return;
      }

      listEl.innerHTML = results.map(r => {
        const text = _escHtml((r.content || '').substring(0, 150)) + ((r.content || '').length > 150 ? '...' : '');
        const rawScore = Number.isFinite(r.score) ? r.score : 0;
        const score = (Math.max(0, Math.min(1, rawScore)) * 100).toFixed(1);
        return `
          <div style="padding:10px 12px;border:1px solid var(--border);background:var(--bg-2);display:flex;flex-direction:column;gap:6px;">
            <div class="flex justify-between items-center">
              <span class="font-bold text-xs uppercase tracking-[0.1em]" style="font-family:var(--font-mono);">${_escHtml(r.docId)}</span>
              <span style="background:var(--amber);color:var(--bg);font-family:var(--font-mono);font-size:0.65rem;font-weight:700;padding:1px 6px;">${score}%</span>
            </div>
            <div style="font-size:0.75rem;color:var(--fg-3);overflow:hidden;text-overflow:ellipsis;font-style:italic;">${text}</div>
            <button class="btn btn-ghost btn-sm" style="align-self:flex-start;" onclick="AIChat.attachRagResult(this)" data-rag-text="${_escHtml(r.content || '').replace(/"/g, '&quot;')}">📎 Attach to Context</button>
          </div>
        `;
      }).join('');
    } catch (err) {
      listEl.innerHTML = `<p style="padding:12px;font-family:var(--font-mono);font-size:0.72rem;color:var(--red);">Search failed: ${err.message}</p>`;
    }
  }

  function attachRagResult(elOrText) {
    let text;
    if (typeof elOrText === 'string') {
      text = elOrText;
    } else {
      // Called from onclick with `this` — read data attribute
      text = elOrText.dataset.ragText || '';
    }
    const input = document.getElementById('chat-input');
    input.value = `[Context attached from previous scan]:\n\n${text}\n\n${input.value}`;
    input.focus();
    showToast('Context appended to input box');
    document.getElementById('rag-results').classList.add('hidden');
  }

  function _attachLaunchedScanIds(content) {
    const text = String(content || '');
    const matches = text.matchAll(/Approved and launched scan\s+`?([0-9a-f-]{36})`?/gi);
    for (const match of matches) {
      attachSessionId(match[1]);
    }
  }

  return { init, attachSessionId, clearAttachedSessions, attachSession, onProviderChange, handleKey, send, clearChat, focusInput, setAppointmentId, updateRagStats, ragSearch, attachRagResult, loadChat, startNewChat, renameChat, togglePackage, manageModels, closeManageModels, fetchModels, addModel, removeModel };
})();
