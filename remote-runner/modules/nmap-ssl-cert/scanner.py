import sys
import json
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime

def analyze_certificate(xml_root, port):
    # Default Verdicts
    assessment = "False Positive"
    justification = "REJECTED: Unable to connect or port closed."
    
    if xml_root is None:
        return assessment, justification, None

    port_state = xml_root.find(f".//port[@portid='{port}']/state")
    if port_state is None or port_state.get('state') != 'open':
        return "False Positive", f"REJECTED: Port {port} is closed or unreachable.", None

    script_elem = xml_root.find(".//script[@id='ssl-cert']")
    if script_elem is None:
        return "False Positive", "REJECTED: Port open but no SSL service detected.", None

    subject_txt = "N/A"
    issuer_txt = "N/A"
    expiry_date = None
    not_before_date = None
    san_list = []
    
    for table in script_elem.findall("table"):
        key = table.get("key")
        
        if key == "subject":
            for elem in table.findall("elem"):
                if elem.get("key") == "commonName":
                    subject_txt = elem.text
        
        if key == "issuer":
            for elem in table.findall("elem"):
                if elem.get("key") == "commonName":
                    issuer_txt = elem.text
                    
        if key == "validity":
            for elem in table.findall("elem"):
                if elem.get("key") == "notAfter":
                    try:
                        expiry_date = datetime.strptime(elem.text.split('T')[0], '%Y-%m-%d')
                    except:
                        pass
                if elem.get("key") == "notBefore":
                    try:
                        not_before_date = datetime.strptime(elem.text.split('T')[0], '%Y-%m-%d')
                    except:
                        pass

        if key == "extensions":
            for sub_table in table.findall("table"):
                for elem in sub_table.findall("elem"):
                    if elem.get("key") == "name" and elem.text == "X509v3 Subject Alternative Name":
                        for val_elem in sub_table.findall("elem"):
                            if val_elem.get("key") == "value":
                                raw_sans = val_elem.text
                                items = [x.strip() for x in raw_sans.split(',')]
                                for item in items:
                                    if item.startswith("DNS:"): san_list.append(item[4:])
                                    elif item.startswith("IP Address:"): san_list.append(item[11:])
                                    elif item.startswith("IP:"): san_list.append(item[3:])

    # Calculate Validity Days
    validity_days = None
    if expiry_date and not_before_date:
        validity_days = (expiry_date - not_before_date).days

    cert_info = {
        "subject": subject_txt,
        "issuer": issuer_txt,
        "expiry_date": expiry_date.strftime('%Y-%m-%d') if expiry_date else None,
        "validity_days": validity_days,
        "san_list": san_list
    }

    if subject_txt != "N/A" and issuer_txt != "N/A":
        if subject_txt == issuer_txt:
            return "True Positive", f"CONFIRMED: Self-signed certificate detected (CN: {subject_txt}). Attackers can spoof this.", cert_info
    
    if expiry_date:
        if expiry_date < datetime.now():
            return "True Positive", f"CONFIRMED: Certificate expired on {expiry_date.strftime('%Y-%m-%d')}. Verification fails.", cert_info

    if subject_txt != "N/A" and issuer_txt != "N/A":
        return "False Positive", f"REJECTED: Valid certificate structure found. Issued by '{issuer_txt}'.", cert_info

    return assessment, justification, cert_info

def run_nmap_ssl(target, port):
    cmd = ["nmap", "-p", str(port), "-sV", "--script=ssl-cert", "-oX", "-", target, "-Pn", "--open"]
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stdout, stderr = process.communicate()
    
    if not stdout.strip() and process.returncode != 0:
        return None, stderr.strip() or "Unknown Nmap error"
    try:
        return ET.fromstring(stdout), None
    except ET.ParseError:
        return None, "Failed to parse nmap XML output"

def check_wildcard_match(input_host, cert_name):
    input_host = str(input_host).lower()
    cert_name = str(cert_name).lower()
    if input_host == cert_name:
        return True
    if cert_name.startswith('*.'):
        suffix = cert_name[2:]
        if input_host.endswith(suffix):
            prefix = input_host[:-len(suffix)-1]
            if '.' not in prefix:
                return True
    return False

def run_scan(target, port, fqdn=None):
    try:
        # Phase 1: IP Scan
        xml_out, err = run_nmap_ssl(target, port)
        if err:
            return {"status": "error", "error": err}
            
        assessment, justification, cert_info = analyze_certificate(xml_out, port)
        used_port = port
        
        # Check SAN Mismatch against Target/FQDN
        validation_target = fqdn if fqdn and str(fqdn).strip() != '' else target
        san_mismatch = False
        if cert_info and cert_info.get("subject") != "N/A":
            valid_names = [cert_info["subject"]] + cert_info.get("san_list", [])
            match_found = any(check_wildcard_match(validation_target, name) for name in valid_names)
            san_mismatch = not match_found
            cert_info["san_mismatch"] = san_mismatch
        
        # Phase 2: FQDN Smart Retry if False Positive
        if assessment == "False Positive" and fqdn and str(fqdn).strip() != '':
            # Retry A: FQDN on Supplied Port
            xml_fqdn, _ = run_nmap_ssl(fqdn, port)
            assess_fqdn, just_fqdn, cert_fqdn = analyze_certificate(xml_fqdn, port)
            
            if assess_fqdn == "True Positive":
                assessment = assess_fqdn
                justification = just_fqdn + f" (Detected via SNI/FQDN: {fqdn})"
                cert_info = cert_fqdn
            else:
                # Retry B: FQDN on Default Port (443)
                if str(port) != '443':
                    xml_443, _ = run_nmap_ssl(fqdn, '443')
                    assess_443, just_443, cert_443 = analyze_certificate(xml_443, '443')
                    
                    if assess_443 == "True Positive":
                        assessment = assess_443
                        justification = just_443 + f" (Detected via FQDN: {fqdn} on default port 443)"
                        used_port = '443'
                        cert_info = cert_443
        
        return {
            "status": "success",
            "findings": {
                "triage_assessment": assessment,
                "justification": justification,
                "scanned_port": used_port,
                "certificate_details": cert_info
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
    fqdn = None
    
    if len(sys.argv) > 2 and sys.argv[2].strip():
        port = sys.argv[2].strip()
    if len(sys.argv) > 3 and sys.argv[3].strip():
        fqdn = sys.argv[3].strip()
        
    results = run_scan(target, port, fqdn)
    print(json.dumps(results, indent=2))
