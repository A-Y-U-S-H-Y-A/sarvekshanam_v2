# Writing Custom Remote Modules

The Sarvekshanam Remote Runner system is designed to be highly extensible. You can write your custom security modules in any language (typically Python) and drop them into the `modules/` directory without ever needing to recompile the Go runner!

## Directory Structure

A module is simply a standalone folder residing in the `remote-runner/modules/` directory.

```
remote-runner/
└── modules/
    └── my-custom-module/
        ├── module.json
        └── scanner.py
```

## The `module.json` File

Every module **MUST** have a `module.json` mapping out its identity and inputs so the backend platform knows how to render it visually in the Dashboard.

```json
{
  "id": "my-custom-module",
  "name": "My Custom Module",
  "description": "Performs a specialized security check on the supplied target.",
  "entry": "scanner.py",
  "parameters": [
    { "name": "target", "required": true, "description": "Target IP or Domain" },
    { "name": "port", "required": false, "description": "Override port number" }
  ]
}
```

### Key Properties:
- `entry`: This is the exact filename of the script your runner will execute when triggered. Right now the runner defaults to expecting Python scripts (`python <entry> <parameters...>`).
- `parameters`: Defines the input boxes that will magically appear on the main Sarvekshanam "Power User" user interface! The arguments will be passed to your script as CLI arguments in the exact order they are listed out. 

> **Important**: You must define a parameter strictly named `"target"`, as the Power User platform currently enforces that all execution contexts bind to a target.

## Writing the Execution Script (`scanner.py`)

When the user clicks "Run Scan" on the UI, the Go server automatically launches your script like so:
```bash
python scanner.py [param1] [param2]
```

### Output Standard

Your script should parse `sys.argv[1]`, do its security check, and then output its findings directly to `stdout` (`print()`). 

If you output structured JSON, the backend will beautifully render it. If you output raw text, it drops as raw console logs.

**Example `scanner.py`:**
```python
import sys
import json

def run_scan(target):
    try:
        # DO ACTUAL RECON/SCAN WORK HERE
        
        results = {
            "status": "success",
            "findings": f"Successfully mapped target {target}!"
        }
    except Exception as e:
        results = {
            "status": "error",
            "error": str(e)
        }
        
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "error": "Missing target"}))
        sys.exit(1)
        
    # The first parameter passed into the list
    target = sys.argv[1]
    run_scan(target)
```

## Deployment

1. Make the folder.
2. Add your `.json` and `.py`.
3. Done! 

The `RunnerService` on the Node.js backend automatically polls your runner every 30 seconds. Within 30 seconds of adding the new folder, it will instantly pop up on the Sarvekshanam UI under your target Go runner's category!
