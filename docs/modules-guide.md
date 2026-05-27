# Module Development Guide

Custom security modules can be written in Python, Node.js, Bash, Go, or provided as compiled binaries. 
You can deploy them to a Go Slave without restarting the Slave — the folder watcher will pick it up instantly.

## Directory Structure
Place a new folder inside the Slave's `modules/` directory:
```text
remote-runner/
└── modules/
    └── my-scanner/
        ├── manifest.json
        └── run.py
```

## The manifest.json
Every module must define its metadata and inputs:

```json
{
  "id": "my-scanner",
  "name": "My Custom Scanner",
  "description": "Performs an advanced scan.",
  "category": "Custom",
  "language": "python",
  "entry": "run.py",
  "requires_strict_approval": false,
  "parameters": [
    {
      "name": "target",
      "type": "string",
      "required": true,
      "description": "Target IP"
    }
  ]
}
```

## The Script
The parameters are passed to your script as CLI arguments.
Your script should output data to `stdout`. JSON output is highly recommended.

**Example (run.py):**
```python
import sys
import json

target = sys.argv[1]
print(json.dumps({"status": "success", "target_scanned": target}))
```
