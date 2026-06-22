import sys
import json
import subprocess
import re

def execute_curl(target, port, endpoint, protocol):
    # Ensure endpoint doesn't start with a slash if we append it
    endpoint = endpoint.lstrip('/')
    url = f"{protocol}://{target}:{port}/{endpoint}"
    
    # curl -i (headers) -k (insecure) --max-time 5 (timeout) -s (silent)
    command = ["curl", "-i", "-k", "-s", "--max-time", "5", url]
    
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='ignore'
        )
        stdout = result.stdout
        stderr = result.stderr
        
        status_match = re.search(r"HTTP/\d\.\d\s+(\d+)", stdout)
        status_code = status_match.group(1) if status_match else "Unknown"
        
        return {
            "status_code": status_code,
            "stdout": stdout,
            "stderr": stderr
        }
    except Exception as e:
        return {
            "status_code": "Error",
            "stdout": "",
            "stderr": str(e)
        }

def run_scan(target, port, endpoint):
    try:
        # ATTEMPT 1: HTTPS
        https_res = execute_curl(target, port, endpoint, "https")
        
        if https_res['status_code'] == "200":
            return {
                "status": "success",
                "findings": {
                    "triage_assessment": "True Positive",
                    "justification": "CONFIRMED: Vulnerable via HTTPS (200 OK).",
                    "protocol": "HTTPS",
                    "status_code": "200",
                    "raw_output": https_res['stdout'][:500].replace('\n', ' ')
                }
            }

        # ATTEMPT 2: HTTP
        http_res = execute_curl(target, port, endpoint, "http")
        
        if http_res['status_code'] == "200":
            return {
                "status": "success",
                "findings": {
                    "triage_assessment": "True Positive",
                    "justification": "CONFIRMED: Vulnerable via HTTP (HTTPS failed or protected).",
                    "protocol": "HTTP",
                    "status_code": "200",
                    "raw_output": http_res['stdout'][:500].replace('\n', ' ')
                }
            }

        # FALSE POSITIVE (Neither worked)
        if https_res['status_code'] in ["403", "401"] or http_res['status_code'] in ["403", "401"]:
            out = https_res['stdout'] if https_res['status_code'] in ["403", "401"] else http_res['stdout']
            return {
                "status": "success",
                "findings": {
                    "triage_assessment": "False Positive",
                    "justification": "REJECTED: Access Denied (ACL Active) on at least one protocol.",
                    "protocol": "Both Checked",
                    "status_code": "403/401",
                    "raw_output": out[:500].replace('\n', ' ')
                }
            }
        else:
            return {
                "status": "success",
                "findings": {
                    "triage_assessment": "False Positive",
                    "justification": "REJECTED: Connection Failed or Empty Reply on both protocols.",
                    "protocol": "Both Checked",
                    "status_code": f"HTTPS:{https_res['status_code']} / HTTP:{http_res['status_code']}",
                    "raw_output": (https_res['stderr'] + http_res['stderr'])[:500].replace('\n', ' ')
                }
            }

    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"status": "error", "error": "Missing arguments. Required: target, port, endpoint"}))
        sys.exit(1)
        
    target = sys.argv[1]
    port = sys.argv[2]
    endpoint = sys.argv[3]
    
    results = run_scan(target, port, endpoint)
    print(json.dumps(results, indent=2))
