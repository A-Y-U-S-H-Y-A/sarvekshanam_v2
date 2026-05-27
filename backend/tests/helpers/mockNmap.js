'use strict';

/**
 * Realistic mock nmap outputs for testing.
 */

const QUICK_SCAN_OUTPUT = `
Starting Nmap 7.94 ( https://nmap.org ) at 2026-04-13 12:00 UTC
Nmap scan report for 192.168.1.1
Host is up (0.00043s latency).
Nmap scan report for 192.168.1.5
Host is up (0.00070s latency).
Nmap scan report for 192.168.1.10
Host is up (0.00120s latency).
Nmap done: 256 IP addresses (3 hosts up) scanned in 2.41 seconds
`.trim();

const PORT_SCAN_OUTPUT = `
Starting Nmap 7.94 ( https://nmap.org ) at 2026-04-13 12:00 UTC
Nmap scan report for 192.168.1.1
Host is up (0.00043s latency).
Not shown: 995 closed tcp ports (conn-refused)
PORT     STATE SERVICE  VERSION
22/tcp   open  ssh      OpenSSH 8.9p1 Ubuntu 3ubuntu0.6 (Ubuntu Linux; protocol 2.0)
80/tcp   open  http     nginx 1.22.1
443/tcp  open  ssl/http nginx 1.22.1
3306/tcp open  mysql    MySQL 8.0.35
8080/tcp open  http     Apache httpd 2.4.57
Service Info: OS: Linux; CPE: cpe:/o:linux:linux_kernel

Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .
Nmap done: 1 IP address (1 host up) scanned in 12.47 seconds
`.trim();

const NMAP_NOT_FOUND_ERROR = Object.assign(new Error('spawn nmap ENOENT'), {
  code: 'ENOENT',
});

module.exports = {
  QUICK_SCAN_OUTPUT,
  PORT_SCAN_OUTPUT,
  NMAP_NOT_FOUND_ERROR,
};
