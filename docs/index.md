# Sarvekshanam Documentation

Welcome to the official documentation for **Sarvekshanam** — the Advanced Multi-System Security Operations & AI Analysis Platform.

## 📑 Table of Contents

1. [**Architecture Overview**](architecture.md)
   * High-level design, Master-Slave topology, Database schema, and Data flows.
2. [**Getting Started & Installation**](getting-started.md)
   * Prerequisites, installation instructions, and quick-start guide.
3. [**Configuration Guide**](configuration.md)
   * Comprehensive guide to all `.env` variables and system settings.
4. [**Module Development Guide**](modules-guide.md)
   * How to write, package, and deploy custom security scripts to remote runners.
5. [**Security & Fleet Management**](security.md)
   * Details on JWKS authentication, payload encryption, API keys, and admin gatekeeping.
6. [**AI & Context Integration**](ai-integration.md)
   * Setting up LLMs, using the RAG pipeline, and managing Appointment contexts.

---

### What is Sarvekshanam?

Sarvekshanam is designed for distributed security orchestration. Instead of running all your heavy or sensitive security tools (like nmap, vulnerability scanners, or custom python scripts) on a single machine, you deploy lightweight Go-based **Remote Runners** (slaves) across your infrastructure or client networks. 

The centralized **Master Node** manages these slaves, queues execution requests, streams results back to your browser in real-time, and feeds those results into an **Agentic AI Assistant** that can analyze the data, search past scans, and even trigger new scans on your behalf.
