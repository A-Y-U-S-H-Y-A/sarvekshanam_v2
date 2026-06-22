import sys
import json
import subprocess

def run_scan(target, port):
    try:
        # Construct the command
        # nmap -p <PORT> --script=ssl-enum-ciphers <IP> -Pn
        cmd = ["nmap", "-p", str(port), "--script=ssl-enum-ciphers", target, "-Pn"]
        
        # Execute the command
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate()
        
        if process.returncode != 0:
            return {
                "status": "error",
                "error": stderr.strip() or stdout.strip() or "Unknown Nmap error"
            }
        
        # Check for MD5 or other insecure things if requested
        insecure_md5 = "Insecure certificate signature (MD5)" in stdout
        tlsv1_1_found = "TLSv1.1:" in stdout
        
        return {
            "status": "success",
            "findings": {
                "raw_output": stdout,
                "insecure_md5_signature_found": insecure_md5,
                "tlsv1_1_found": tlsv1_1_found
            }
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "error": "Missing target"}))
        sys.exit(1)
        
    target = sys.argv[1]
    port = "443"
    
    if len(sys.argv) > 2 and sys.argv[2].strip():
        port = sys.argv[2].strip()
        
    results = run_scan(target, port)
    print(json.dumps(results, indent=2))
