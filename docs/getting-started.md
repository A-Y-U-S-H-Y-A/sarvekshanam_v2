# Getting Started & Installation

## Prerequisites
- **Node.js**: v18.0.0 or higher
- **Go**: v1.25.5 or higher (only if deploying the Remote Runner locally)
- *(Optional)* nmap and python installed for bundled modules

## 1. Setting up the Master Node

Clone the repository and install dependencies:

```bash
git clone https://github.com/yourusername/sarvekshanam.git
cd sarvekshanam/backend

npm install
```

Set up your environment variables:

```bash
cp .env.example .env
```
*(See the [Configuration Guide](configuration.md) for details on setting up LLM keys and JWT secrets).*

Start the backend:
```bash
npm run dev
```

The application will be available at **http://localhost:3000**.

> **Note on Initial User Setup:**
> The first user to register via the web UI is granted the `viewer` role by default. To make yourself an admin, run `npm run make-admin` in the backend directory.

## 2. Setting up a Remote Runner

The Master Node needs Remote Runners to execute tasks. A default runner is provided in the `remote-runner/` directory.

```bash
cd sarvekshanam/remote-runner
go run .
```

By default, the runner starts on `http://localhost:8080`.

### Registering the Runner
1. Log into the Sarvekshanam Web UI.
2. Navigate to the **Runners** tab.
3. Click **+ Add Runner**.
4. Enter a name (e.g., "Local Node") and the URL (e.g., `http://localhost:8080`).

The Master will immediately start polling the runner and discovering its modules.

## 3. Your First Scan
1. Navigate to the **Power User** tab.
2. Select a module from the left sidebar (e.g., "Ping Test").
3. Enter a target (e.g., `8.8.8.8`).
4. Click **Run Scan**.
5. Watch the real-time terminal output stream in!
