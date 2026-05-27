import sys
import urllib.request
import json
import ssl

def check_headers(url):
    results = {}
    try:
        if not url.startswith('http'):
            url = 'https://' + url
            
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

        req = urllib.request.Request(url, method='HEAD')
        req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        req.add_header('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8')
        with urllib.request.urlopen(req, timeout=10, context=ctx) as response:
            headers = dict(response.headers)
            
            # Key security headers to check
            security_headers = [
                'Strict-Transport-Security',
                'Content-Security-Policy',
                'X-Frame-Options',
                'X-Content-Type-Options',
                'Referrer-Policy',
                'Permissions-Policy'
            ]
            
            found = {}
            missing = []
            
            for lower_key, value in headers.items():
                for sh in security_headers:
                    if lower_key.lower() == sh.lower():
                        found[sh] = value

            for sh in security_headers:
                if sh not in found:
                    missing.append(sh)
                    
            results = {
                "status": "success",
                "target": url,
                "found_headers": found,
                "missing_headers": missing
            }

    except Exception as e:
        results = {
            "status": "error",
            "target": url,
            "error": str(e)
        }

    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "error": "Missing URL argument"}))
        sys.exit(1)
        
    target_url = sys.argv[1]
    check_headers(target_url)
