import sys
import json
import subprocess
import xml.etree.ElementTree as ET

DEPRECATED_ALGOS = {
    'kex_algorithms': ['diffie-hellman-group1-sha1', 'diffie-hellman-group14-sha1'],
    'server_host_key_algorithms': ['ssh-dss', 'ssh-rsa'],
    'mac_algorithms': ['hmac-sha1', 'hmac-sha1-96', 'hmac-md5']
}

def analyze_ssh_algos(xml_root, port):
    assessment = "False Positive"
    justification = "REJECTED: Port closed or SSH service not responding."
    found_issues = []

    if xml_root is None:
        return assessment, justification, []

    port_state = xml_root.find(f".//port[@portid='{port}']/state")
    if port_state is None or port_state.get('state') != 'open':
        return "False Positive", f"REJECTED: Port {port} is closed or unreachable.", []

    script_elem = xml_root.find(".//script[@id='ssh2-enum-algos']")
    if script_elem is None:
        return "False Positive", "REJECTED: Port open but no SSH protocol details found.", []

    for table in script_elem.findall("table"):
        algo_type = table.get("key") 
        if algo_type in DEPRECATED_ALGOS:
            for elem in table.findall("elem"):
                algo_name = elem.text
                if algo_name in DEPRECATED_ALGOS[algo_type]:
                    found_issues.append(f"{algo_type}: {algo_name}")

    if found_issues:
        assessment = "True Positive"
        details = ", ".join(found_issues[:3])
        if len(found_issues) > 3:
            details += f" (+{len(found_issues)-3} more)"
        justification = f"CONFIRMED: Deprecated SHA1/Weak algorithms supported: {details}"
    else:
        assessment = "False Positive"
        justification = "REJECTED: SSH configuration looks secure (No SHA1 primitives found)."

    return assessment, justification, found_issues

def run_scan(target, port):
    try:
        cmd = ["nmap", "-p", str(port), "--script", "ssh2-enum-algos", "-oX", "-", target, "-Pn", "--open"]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate()
        
        if not stdout.strip() and process.returncode != 0:
            return {
                "status": "error",
                "error": stderr.strip() or "Unknown Nmap error"
            }
        
        try:
            xml_root = ET.fromstring(stdout)
        except ET.ParseError:
            return {
                "status": "error",
                "error": "Failed to parse nmap XML output"
            }
            
        assessment, justification, issues = analyze_ssh_algos(xml_root, port)
        
        return {
            "status": "success",
            "findings": {
                "triage_assessment": assessment,
                "justification": justification,
                "weak_algorithms": issues
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
    port = "22"
    
    if len(sys.argv) > 2 and sys.argv[2].strip():
        port = sys.argv[2].strip()
        
    results = run_scan(target, port)
    print(json.dumps(results, indent=2))
