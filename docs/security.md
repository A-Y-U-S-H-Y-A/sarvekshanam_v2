# Security & Fleet Management

Sarvekshanam implements multiple layers of security to ensure distributed remote execution is safe.

## Master ↔ Slave Authentication (JWKS)
The Go Slaves DO NOT blindly execute incoming HTTP requests.
1. The Master generates an RSA keypair on startup and exposes its public key via a `.well-known/jwks.json` endpoint.
2. The Master signs short-lived (5 min) JWTs for every execution request.
3. The Slave fetches the Master's JWKS and verifies the JWT signature before executing any module.

## Asymmetric Payload Encryption
To prevent interception of sensitive module parameters (e.g., passwords or auth tokens passed to a scan):
1. Slaves generate their own RSA-2048 keypair on startup.
2. Slaves expose their public key at `/pubkey`.
3. The Master encrypts sensitive parameters using the Slave's public key (RSA-OAEP SHA-256) before sending them.
4. Only the specific Slave can decrypt the payload.

## Execution Isolation
Every time a module runs on a Slave, a unique, ephemeral sandbox directory (`/tmp/sarv_<uuid>`) is created.
- The module files are copied into the sandbox.
- The process executes with the sandbox as its working directory.
- After execution and file retrieval, the sandbox is entirely deleted.

## Admin Gatekeeping
Certain modules can be marked with `"requires_strict_approval": true` in their `manifest.json`.
When a user attempts to run these modules, the request is queued in a `pending_approval` state. An administrator must approve the execution from the UI before the Master dispatches it to the Slave.
