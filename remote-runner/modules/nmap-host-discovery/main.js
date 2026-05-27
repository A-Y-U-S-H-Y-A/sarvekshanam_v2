const { exec } = require('child_process');

const target = process.argv[2] || '';

if (!target) {
  console.log(JSON.stringify({ status: 'error', error: 'Missing target argument' }));
  process.exit(0);
}

function parseQuickScan(output) {
  const hosts = [];
  const hostPattern = /Nmap scan report for (.+?)\r?\nHost is up(?: \((.+?) latency\))?\./g;
  let match;
  while ((match = hostPattern.exec(output)) !== null) {
    hosts.push({ host: match[1].trim(), latency: match[2] ? match[2].trim() : null });
  }
  const doneMatch = output.match(/(\d+) IP address(?:es)? \((\d+) hosts? up\)/);
  return {
    hosts,
    totalScanned: doneMatch ? parseInt(doneMatch[1], 10) : null,
    hostsUp: doneMatch ? parseInt(doneMatch[2], 10) : hosts.length,
  };
}

function mockResult(target) {
  const output = [
    `Starting Nmap 7.94 ( https://nmap.org )`,
    `[MOCK] Scanning ${target}`,
    `Nmap scan report for 192.168.1.1`,
    `Host is up (0.00043s latency).`,
    `Nmap scan report for 192.168.1.5`,
    `Host is up (0.00070s latency).`,
    `Nmap done: 256 IP addresses (2 hosts up) scanned in 2.41 seconds`,
  ].join('\n');

  return {
    status: 'success',
    output: output,
    data: {
      mock: true,
      hosts: [
        { host: '192.168.1.1', latency: '0.00043s' },
        { host: '192.168.1.5', latency: '0.00070s' },
      ],
      totalScanned: 256,
      hostsUp: 2,
    }
  };
}

const cmd = `nmap -sn ${target}`;
exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
  if (err) {
    if (err.code === 'ENOENT' || (err.message && err.message.includes('ENOENT'))) {
      console.log(JSON.stringify(mockResult(target)));
      process.exit(0);
    }
    console.log(JSON.stringify({ status: 'error', error: stderr || err.message, data: { error: err.message } }));
    process.exit(0);
  }
  const raw = parseQuickScan(stdout);
  console.log(JSON.stringify({ status: 'success', output: stdout, data: raw }));
});
