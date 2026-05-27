const { exec } = require('child_process');

const target = process.argv[2] || '';
const portsInput = process.argv[3] || '';
const timingInput = process.argv[4] || '';

if (!target) {
  console.log(JSON.stringify({ status: 'error', error: 'Missing target argument' }));
  process.exit(0);
}

const ports = portsInput.trim() || '1-1000';
const timing = (timingInput.trim() || 'T3').replace(/^-?/, '');

function parsePortScan(output) {
  const parsedPorts = [];
  const portLine = /^(\d+\/\w+)\s+(\w+)\s+(\S+)\s*(.*)/gm;
  let match;
  while ((match = portLine.exec(output)) !== null) {
    parsedPorts.push({
      port: match[1],
      state: match[2],
      service: match[3],
      version: match[4].trim(),
    });
  }

  const hostMatch = output.match(/Nmap scan report for (.+)/);
  const doneMatch = output.match(/Nmap done.*scanned in ([\d.]+) seconds/);

  return {
    host: hostMatch ? hostMatch[1].trim() : null,
    ports: parsedPorts,
    openCount: parsedPorts.filter(p => p.state === 'open').length,
    scanTimeSec: doneMatch ? parseFloat(doneMatch[1]) : null,
  };
}

function mockResult(target, ports) {
  const output = [
    `Starting Nmap 7.94 ( https://nmap.org )`,
    `[MOCK] Scanning ${target} ports ${ports}`,
    `Nmap scan report for ${target}`,
    `Host is up (0.00043s latency).`,
    `Not shown: 995 closed tcp ports (conn-refused)`,
    `PORT     STATE SERVICE  VERSION`,
    `22/tcp   open  ssh      OpenSSH 8.9p1 Ubuntu 3ubuntu0.6`,
    `80/tcp   open  http     nginx 1.22.1`,
    `443/tcp  open  ssl/http nginx 1.22.1`,
    `3306/tcp open  mysql    MySQL 8.0.35`,
    `8080/tcp open  http     Apache httpd 2.4.57`,
    ``,
    `Service detection performed.`,
    `Nmap done: 1 IP address (1 host up) scanned in 12.47 seconds`,
  ].join('\n');

  return {
    status: 'success',
    output: output,
    data: {
      mock: true,
      host: target,
      ports: [
        { port: '22/tcp', state: 'open', service: 'ssh', version: 'OpenSSH 8.9p1 Ubuntu 3ubuntu0.6' },
        { port: '80/tcp', state: 'open', service: 'http', version: 'nginx 1.22.1' },
        { port: '443/tcp', state: 'open', service: 'ssl/http', version: 'nginx 1.22.1' },
        { port: '3306/tcp', state: 'open', service: 'mysql', version: 'MySQL 8.0.35' },
        { port: '8080/tcp', state: 'open', service: 'http', version: 'Apache httpd 2.4.57' },
      ],
      openCount: 5,
      scanTimeSec: 12.47,
    }
  };
}

const cmd = `nmap -sV -p ${ports} -${timing} ${target}`;
exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
  if (err) {
    if (err.code === 'ENOENT' || (err.message && err.message.includes('ENOENT'))) {
      console.log(JSON.stringify(mockResult(target, ports)));
      process.exit(0);
    }
    console.log(JSON.stringify({ status: 'error', error: stderr || err.message, data: { error: err.message } }));
    process.exit(0);
  }
  const raw = parsePortScan(stdout);
  console.log(JSON.stringify({ status: 'success', output: stdout, data: raw }));
});
