<div align="center">
  <img src="docs/assets/architecture.png" alt="Sarvekshanam Architecture" width="100%" style="border-radius: 8px;" />
  
  <br/>
  
  <h1>Sarvekshanam</h1>
  
  <p><b>Advanced Multi-System Security Operations & AI Analysis Platform</b></p>

  <p>
    <a href="https://github.com/yourusername/sarvekshanam/actions"><img src="https://img.shields.io/badge/build-passing-brightgreen.svg" alt="Build Status"></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D%2018.0.0-brightgreen.svg" alt="Node Version"></a>
    <a href="https://go.dev/"><img src="https://img.shields.io/badge/go-%3E%3D%201.25.5-blue.svg" alt="Go Version"></a>
    <a href="https://opensource.org/licenses/GPL-3.0"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="License: GPL v3"></a>
  </p>
</div>

<br/>

**Sarvekshanam (v2 Beta)** is a vulnerability and security tool orchestration platform comprising a centralized Node.js Master and distributed Go Slaves (Remote Runners). It features an agentic AI assistant capable of digesting massive scan outputs via RAG, generating actionable security insights, and directly interacting with your security fleet.

> **Note:** This is Version 2 (currently in Beta) of the original [Sarvekshanam project](https://github.com/A-Y-U-S-H-Y-A/sarvekshanam). V2 introduces distributed Go Slaves, RAG, and an Agentic AI assistant while maintaining the powerful orchestration capabilities of the original.

---

## ✨ Features

- **🚀 Fleet Orchestration**: Manage distributed Go Slaves to execute arbitrary security scripts.
- **🤖 Agentic AI**: Chat with your security data. AI can summarize findings, query via RAG, and execute new tools.
- **🛡️ Ephemeral Sandboxes**: Slaves run each task in isolated temp directories to prevent data contamination.
- **📦 Multi-Language Modules**: Dynamically hot-load Python, Node, Go, or Bash security modules simply by dropping a folder.
- **🔒 Enterprise Security**: Asymmetric RSA-OAEP payload encryption, JWKS authentication, and OIDC SSO integration.
- **🚄 Bulk Operations**: Orchestrate module execution across hundreds of targets simultaneously.

---

## 📸 Screenshots

| Power User Dashboard | AI Chat Interface |
| :---: | :---: |
| <img src="docs/assets/dashboard.png" width="400"> | <img src="docs/assets/ai_chat.png" width="400"> |

---

## 📚 Documentation

The full documentation is available in the [`docs/`](docs/) directory and can be hosted via GitHub Pages:

- [**Architecture Overview**](docs/architecture.md)
- [**Getting Started & Installation**](docs/getting-started.md)
- [**Configuration Guide (.env)**](docs/configuration.md)
- [**Module Development Guide**](docs/modules-guide.md)
- [**Security & Fleet Management**](docs/security.md)
- [**AI & Context Integration**](docs/ai-integration.md)

---

## ⚡ Quick Start

### 1. Requirements
- Node.js (v18+)
- Go (v1.25.5+) *(optional, if you want to run the local remote runner)*

### 2. Setup the Master Server
```bash
# Clone the repository
git clone https://github.com/yourusername/sarvekshanam.git
cd sarvekshanam/backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your LLM API keys and JWT secret
```

### 3. Start the Master
```bash
# Windows
../start.bat

# Linux/Mac
npm run start
```
The platform will now be accessible at `http://localhost:3000`.

### 4. Remote Runners (Optional)
The system is designed to delegate work to `remote-runners`. A default Go runner is included but completely optional.
See the [**Remote Runner README**](remote-runner/README.md) to set up distributed execution nodes.

---

## 🧩 Tech Stack

| Component | Technology |
|---|---|
| **Frontend** | Vanilla JS, Pure HTML/CSS, Monospace minimalist theme |
| **Backend** | Node.js, Express, Sequelize ORM |
| **Databases** | SQLite (default), sqlite-vec (Vector RAG) |
| **Authentication** | Passport.js, JWKS, Asymmetric RSA |
| **AI Integration** | LangChain (Ollama, Anthropic, Gemini, Groq, OpenAI) |
| **Remote Node** | Go 1.25, SSE Streaming |

---

## 📜 License

This project is licensed under the **GNU General Public License v3.0 (GPLv3)**.  
See the [LICENSE](LICENSE) file for more details.
