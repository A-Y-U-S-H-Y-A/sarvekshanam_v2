import sys
import json
import subprocess
import re
import requests
from datetime import date

def get_cycle_from_version(version):
    parts = version.split('.')
    if len(parts) >= 1:
        if parts[0] in ['18', '19', '21', '23', '26']:
            return parts[0]
        elif len(parts) >= 2:
            return f"{parts[0]}.{parts[1]}"
    return version

def check_eol(version):
    cycle = get_cycle_from_version(version)
    try:
        response = requests.get("https://endoflife.date/api/oracle-database.json", timeout=10)
        response.raise_for_status()
        data = response.json()
        
        latest_versions = [v['releaseLabel'] for v in data[:3]] # get top 3 latest
        
        for release in data:
            if release['cycle'] == cycle:
                eol_date = release.get('eol')
                is_deprecated = False
                today = date.today().isoformat()
                
                # eol can be boolean or string
                if isinstance(eol_date, bool):
                    is_deprecated = eol_date
                elif isinstance(eol_date, str):
                    is_deprecated = today > eol_date
                    
                return {
                    "matched_cycle": release['cycle'],
                    "release_label": release['releaseLabel'],
                    "is_deprecated": is_deprecated,
                    "eol_date": eol_date,
                    "latest_online_versions": latest_versions
                }
        
        return {
            "error": f"Cycle {cycle} not found in online EOL database.",
            "latest_online_versions": latest_versions
        }
    except Exception as e:
        return {"error": f"Failed to check online EOL database: {str(e)}"}

def run_scan(target, port):
    try:
        # Construct the command
        # nmap -p <PORT> -sV <IP>
        cmd = ["nmap", "-p", str(port), "-sV", target]
        
        # Execute the command
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate()
        
        if process.returncode != 0:
            return {
                "status": "error",
                "error": stderr.strip() or stdout.strip() or "Unknown Nmap error"
            }
            
        # Parse version
        match = re.search(r"oracle-tns\s+Oracle TNS listener\s+([0-9\.]+)", stdout, re.IGNORECASE)
        if match:
            version = match.group(1)
            eol_info = check_eol(version)
            
            return {
                "status": "success",
                "findings": {
                    "raw_output": stdout,
                    "tns_version_found": version,
                    "eol_analysis": eol_info
                }
            }
        else:
            return {
                "status": "success",
                "findings": {
                    "raw_output": stdout,
                    "message": "Could not determine Oracle TNS version from Nmap output."
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
    port = "1521" # Default TNS port
    
    if len(sys.argv) > 2 and sys.argv[2].strip():
        port = sys.argv[2].strip()
        
    results = run_scan(target, port)
    print(json.dumps(results, indent=2))
