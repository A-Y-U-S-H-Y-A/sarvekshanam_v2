import sys
import json
import subprocess

def run_scan(target, port, match_string):
    try:
        # Run Nmap Service Scan (-sV)
        cmd = ["nmap", "-p", str(port), "-sV", "-Pn", target]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate()
        
        if process.returncode != 0 and not stdout.strip():
            return {
                "status": "error",
                "error": stderr.strip() or "Unknown Nmap error"
            }
            
        combined_output = stdout + stderr
        
        is_true_positive = match_string.lower() in combined_output.lower()
        
        if is_true_positive:
            assessment = "True Positive"
            justification = f"CONFIRMED: Target string '{match_string}' found in service output."
        else:
            assessment = "False Positive"
            justification = f"REJECTED: Target string '{match_string}' NOT found."

        return {
            "status": "success",
            "findings": {
                "triage_assessment": assessment,
                "justification": justification,
                "match_found": is_true_positive,
                "raw_output": combined_output
            }
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"status": "error", "error": "Missing arguments. Required: target, port, match_string"}))
        sys.exit(1)
        
    target = sys.argv[1]
    port = sys.argv[2]
    match_string = sys.argv[3]
    
    results = run_scan(target, port, match_string)
    print(json.dumps(results, indent=2))
