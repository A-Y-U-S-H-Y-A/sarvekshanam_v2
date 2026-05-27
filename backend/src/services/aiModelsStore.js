'use strict';

const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', '..', 'sarvekshanam_models.json');

const DEFAULT_MODELS = {
  groq: ['llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  ollama: ['llama3'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-opus-latest', 'claude-3-haiku-20240307'],
  gemini: ['gemini-1.5-pro', 'gemini-1.5-flash'],
  mistralai: ['mistral-large-latest', 'open-mistral-nemo'],
  cohere: ['command-r-plus', 'command-r']
};

function _loadStore() {
  if (!fs.existsSync(STORE_PATH)) {
    // Initialize with defaults
    fs.writeFileSync(STORE_PATH, JSON.stringify(DEFAULT_MODELS, null, 2));
    return JSON.parse(JSON.stringify(DEFAULT_MODELS));
  }
  try {
    const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    // Merge defaults for missing providers
    for (const p in DEFAULT_MODELS) {
      if (!data[p]) data[p] = DEFAULT_MODELS[p];
    }
    return data;
  } catch (err) {
    console.error('Failed to load ai models store:', err.message);
    return JSON.parse(JSON.stringify(DEFAULT_MODELS));
  }
}

function _saveStore(data) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function getModels(provider) {
  const store = _loadStore();
  return store[provider] || [];
}

function setModels(provider, models) {
  const store = _loadStore();
  store[provider] = [...new Set(models)]; // Unique
  _saveStore(store);
}

function addModel(provider, model) {
  const store = _loadStore();
  if (!store[provider]) store[provider] = [];
  if (!store[provider].includes(model)) {
    store[provider].push(model);
    _saveStore(store);
  }
}

function removeModel(provider, model) {
  const store = _loadStore();
  if (store[provider]) {
    store[provider] = store[provider].filter(m => m !== model);
    _saveStore(store);
  }
}

module.exports = {
  getModels,
  setModels,
  addModel,
  removeModel
};
