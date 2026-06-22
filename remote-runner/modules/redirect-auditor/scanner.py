import json
import urllib.parse
import requests
import sys
from typing import List, Dict, Any

class RedirectAuditor:
    def __init__(self, max_depth: int = 5):
        self.max_depth = max_depth

    def classify_redirect(self, original_url: str, target_url: str) -> str:
        """Classifies the destination of a redirect relative to the original URL."""
        try:
            orig_parsed = urllib.parse.urlparse(original_url)
            target_parsed = urllib.parse.urlparse(target_url)
            
            # Handle scheme-relative or relative paths
            if not target_parsed.netloc:
                if target_url.startswith('//'):
                    return "Confirmed External Open Redirect (Protocol-Relative)"
                return "Confirmed Internal Redirect"
                
            # Check schemes like javascript:, data:, etc.
            if target_parsed.scheme in ['javascript', 'data', 'vbscript']:
                return f"Potential Redirect (Alternative Scheme: {target_parsed.scheme})"
                
            # Compare domains
            orig_domain = orig_parsed.netloc.split(':')[0]
            target_domain = target_parsed.netloc.split(':')[0]
            
            if orig_domain == target_domain:
                return "Confirmed Internal Redirect"
            elif target_domain.endswith('.' + orig_domain):
                return "Confirmed Subdomain/Sibling Redirect"
            else:
                return "Confirmed External Open Redirect"
        except Exception:
            return "Potential Redirect (Parsing Error)"

    def audit_url(self, base_url: str, payload: str, method: str = "GET", headers: Dict[str, str] = None) -> Dict[str, Any]:
        """
        Tests a specific URL and payload combination for redirect behavior.
        The base_url should contain a placeholder (e.g., '{payload}') or append the payload.
        """
        if headers is None:
            headers = {}
            
        # Construct the target URL with the payload
        if "{payload}" in base_url:
            request_url = base_url.format(payload=urllib.parse.quote(payload))
        else:
            # Fallback: append payload as a parameter or path element if no placeholder
            separator = '&' if '?' in base_url else '?'
            request_url = f"{base_url}{separator}url={urllib.parse.quote(payload)}"

        current_url = request_url
        chain = []
        depth = 0
        finding_classification = "No Redirect"
        
        session = requests.Session()
        
        while depth < self.max_depth:
            try:
                # Execute request without automatic redirect following
                response = session.request(
                    method=method,
                    url=current_url,
                    headers=headers,
                    allow_redirects=False,
                    timeout=10
                )
                
                status_code = response.status_code
                location = response.headers.get('Location')
                
                hop_info = {
                    "hop": depth + 1,
                    "url": current_url,
                    "status_code": status_code,
                    "location_header": location
                }
                chain.append(hop_info)
                
                # Check if it is a redirect status code
                if status_code in [300, 301, 302, 303, 307, 308] and location:
                    # Resolve relative URLs relative to the current URL
                    next_url = urllib.parse.urljoin(current_url, location)
                    
                    # Update classification based on the first external hop or final chain destination
                    current_classification = self.classify_redirect(request_url, next_url)
                    if "External" in current_classification or "Alternative Scheme" in current_classification:
                        finding_classification = current_classification
                    elif finding_classification == "No Redirect":
                        finding_classification = current_classification
                        
                    current_url = next_url
                    depth += 1
                else:
                    break
                    
            except requests.RequestException as e:
                chain.append({
                    "hop": depth + 1,
                    "url": current_url,
                    "error": str(e)
                })
                break

        return {
            "original_request_url": request_url,
            "payload_used": payload,
            "classification": finding_classification,
            "redirect_depth": len(chain) - 1,
            "final_destination": current_url,
            "chain": chain
        }

def run_scan(target_endpoint: str, method: str, custom_headers: Dict[str, str]):
    auditor = RedirectAuditor(max_depth=5)
    
    # Common test cases spanning variations, absolute/relative paths, and bypass structures
    test_payloads = [
        "https://attacker.com",
        "//attacker.com",
        "/internal/dashboard",
        "https:attacker.com",
        "javascript:alert(1)",
        "https://example.com@attacker.com",
        "\/attacker.com"
    ]
    
    try:
        results = []
        for payload in test_payloads:
            result = auditor.audit_url(
                base_url=target_endpoint,
                payload=payload,
                method=method,
                headers=custom_headers
            )
            results.append(result)
            
        return {
            "status": "success",
            "findings": results
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
    method = "GET"
    headers = {}
    
    if len(sys.argv) > 2 and sys.argv[2].strip():
        method = sys.argv[2].strip()
        
    if len(sys.argv) > 3 and sys.argv[3].strip():
        try:
            headers = json.loads(sys.argv[3])
        except json.JSONDecodeError:
            print(json.dumps({"status": "error", "error": "Invalid JSON in headers"}))
            sys.exit(1)

    results = run_scan(target, method, headers)
    print(json.dumps(results, indent=2))
