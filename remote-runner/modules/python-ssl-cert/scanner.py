import socket
import ssl
import sys
import json
import struct
from time import sleep
from datetime import datetime

try:
    from cryptography import x509
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import hashes
    import OpenSSL.crypto as crypto
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False

# TDS Protocol Constants for MSSQL
TDS_PRELOGIN = bytearray([
    0x12, 0x01, 0x00, 0x2f, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x06, 0x01, 0x00, 0x20,
    0x00, 0x01, 0x02, 0x00, 0x21, 0x00, 0x01, 0x03, 0x00, 0x22, 0x00, 0x04, 0x04, 0x00, 0x26, 0x00,
    0x01, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
])

def prep_tds_header(data):
    data_len = len(data)
    prelogin_head = bytearray([0x12, 0x01])
    header_len = 8
    total_len = header_len + data_len
    data_head = prelogin_head + total_len.to_bytes(2, 'big')
    data_head += bytearray([0x00, 0x00, 0x01, 0x00])
    return data_head + data

def read_tds_header(data):
    if len(data) != 8:
        raise ValueError("TDS header must be 8 bytes", data)
    sct = struct.Struct(">bbhhbb")
    unpacked = sct.unpack(data)
    return {
        "type": unpacked[0],
        "status": unpacked[1],
        "length": unpacked[2],
        "channel": unpacked[3],
        "packet": unpacked[4],
        "window": unpacked[5]
    }

def recv_tds_packet(sock, tdspbuf=bytearray()):
    tdspacket = tdspbuf
    header = {}
    
    for _ in range(5):
        try:
            data = sock.recv(4096)
            if not data:
                break
            tdspacket += data
            
            if len(tdspacket) >= 8:
                header = read_tds_header(tdspacket[:8])
                if len(tdspacket) >= header['length']:
                    remaining = tdspacket[header['length']:]
                    return header, tdspacket[8:header['length']], remaining
            
            sleep(0.05)
        except socket.timeout:
            if len(tdspacket) >= 8:
                break
            raise
    
    if len(tdspacket) >= 8:
        header = read_tds_header(tdspacket[:8])
        return header, tdspacket[8:], bytearray()
    
    raise Exception("Failed to receive complete TDS packet")

def get_certificate_mssql(hostname, port=1433, timeout=10):
    try:
        ssl_proto = ssl.PROTOCOL_TLS if hasattr(ssl, 'PROTOCOL_TLS') else ssl.PROTOCOL_SSLv23
        sslctx = ssl.SSLContext(ssl_proto)
        sslctx.check_hostname = False
        sslctx.verify_mode = ssl.CERT_NONE
        
        tls_in_buf = ssl.MemoryBIO()
        tls_out_buf = ssl.MemoryBIO()
        tlssock = sslctx.wrap_bio(tls_in_buf, tls_out_buf, server_hostname=hostname)
        
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        s.connect((hostname, port))
        s.send(TDS_PRELOGIN)
        
        tdspbuf = bytearray()
        header, data, tdspbuf = recv_tds_packet(s, tdspbuf)
        while header['status'] == 0:
            header, ext_data, tdspbuf = recv_tds_packet(s, tdspbuf)
            data += ext_data
        
        for _ in range(10):
            try:
                tlssock.do_handshake()
                cert_der = tlssock.getpeercert(binary_form=True)
                s.close()
                return cert_der
            except ssl.SSLWantReadError:
                tls_data = tls_out_buf.read()
                if tls_data:
                    s.sendall(prep_tds_header(tls_data))
                
                header, data, tdspbuf = recv_tds_packet(s, tdspbuf)
                while header['status'] == 0:
                    header, ext_data, tdspbuf = recv_tds_packet(s, tdspbuf)
                    data += ext_data
                
                tls_in_buf.write(data)
        
        s.close()
        raise Exception("TLS handshake did not complete")
    except Exception as e:
        raise Exception(f"MSSQL connection error: {e}")

def get_certificate_standard(hostname, port=443, timeout=10):
    try:
        context = ssl.create_default_context()
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        
        with socket.create_connection((hostname, port), timeout=timeout) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as secure_sock:
                cert_der = secure_sock.getpeercert(binary_form=True)
                return cert_der
    except Exception as e:
        raise Exception(f"Standard connection error: {e}")

def format_name(name):
    components = []
    for attr, value in name.get_components():
        components.append(f"{attr.decode()}={value.decode()}")
    return ", ".join(components)

def analyze_certificate_der(cert_der):
    if not CRYPTO_AVAILABLE:
        return {"error": "cryptography and pyOpenSSL libraries are required for full analysis"}

    cert = x509.load_der_x509_certificate(cert_der, default_backend())
    cert_openssl = crypto.load_certificate(crypto.FILETYPE_ASN1, cert_der)

    subject_str = format_name(cert_openssl.get_subject())
    issuer_str = format_name(cert_openssl.get_issuer())
    is_self_signed = str(cert_openssl.get_subject()) == str(cert_openssl.get_issuer())

    not_before = cert.not_valid_before_utc
    not_after = cert.not_valid_after_utc
    now = datetime.now(not_before.tzinfo)

    status = "Valid"
    if now < not_before:
        status = "Not Yet Valid"
    elif now > not_after:
        status = "Expired"

    try:
        san_ext = cert.extensions.get_extension_for_oid(x509.oid.ExtensionOID.SUBJECT_ALTERNATIVE_NAME)
        sans = [dns.value for dns in san_ext.value]
    except x509.ExtensionNotFound:
        sans = []

    fingerprint_sha256 = cert.fingerprint(hashes.SHA256()).hex(':').upper()
    fingerprint_sha1 = cert.fingerprint(hashes.SHA1()).hex(':').upper()

    return {
        "subject": subject_str,
        "issuer": issuer_str,
        "is_self_signed": is_self_signed,
        "status": status,
        "not_before": not_before.isoformat(),
        "not_after": not_after.isoformat(),
        "san": sans,
        "fingerprint_sha256": fingerprint_sha256,
        "fingerprint_sha1": fingerprint_sha1,
        "version": cert.version.name,
        "serial_number": str(cert.serial_number)
    }

def run_scan(target, port):
    try:
        port = int(port)
        if port == 1433:
            cert_der = get_certificate_mssql(target, port)
        else:
            cert_der = get_certificate_standard(target, port)

        if not cert_der:
            return {"status": "error", "error": "No certificate retrieved"}

        findings = analyze_certificate_der(cert_der)
        return {
            "status": "success",
            "findings": findings
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
