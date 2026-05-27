# Sarvekshanam Remote Runner

The **Remote Runner** is an optional but powerful component of the Sarvekshanam platform. It acts as a distributed execution agent (or "Slave") that connects to your central Master Node.

You can deploy this runner on any server, VM, or local machine where you want to execute security scans (e.g., inside a secure internal network).

## Features
- 🛡️ **Isolated Execution**: Spawns unique, ephemeral sandboxes for every module to prevent cross-contamination.
- ⚡ **Dynamic Modules**: Hot-loads arbitrary scripts (Python, Bash, Go, etc.) without restarting.
- 🔒 **Secure Communcation**: JWKS-based JWT authentication and asymmetric RSA encryption for sensitive parameters.
- 🚦 **Concurrency Control**: Hard limits on simultaneous executions with crash recovery.
- 📡 **SSE Streaming**: Streams stdout/stderr back to the Master in real-time.

## Installation

### Prerequisites
- Go 1.25.5 or higher
- Node.js & Python (depending on which modules you plan to run)

### Running

Navigate to this directory and run the Go server:
```bash
go run .
```

By default, the server will start on port `8080` with a max concurrency of 5.

**CLI Flags:**
- `-port`: HTTP port to listen on (default: 8080)
- `-max-concurrent`: Max simultaneous module executions (default: 5)
- `-proxy`: Global proxy URL for all executions (e.g., `http://proxy:8080`)

### Registering with the Master

1. Log into your Sarvekshanam Dashboard.
2. Go to the **Runners** tab.
3. Click **+ Add Runner**.
4. Give it a name and provide its accessible URL (e.g., `http://192.168.1.50:8080`).

The Master will start polling the runner automatically.

## Writing Modules
You can easily write your own security tools. See [modules/README.md](modules/README.md) for details on how to write and structure a custom module. Simply drop the new folder into the `modules/` directory and it will hot-reload instantly.
