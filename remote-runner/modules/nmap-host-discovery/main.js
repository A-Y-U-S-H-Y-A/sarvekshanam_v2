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



const cmd = `nmap -sn ${target}`;
exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
  if (err) {

    console.log(JSON.stringify({ status: 'error', error: stderr || err.message, data: { error: err.message } }));
    process.exit(0);
  }
  const raw = parseQuickScan(stdout);
  console.log(JSON.stringify({ status: 'success', output: stdout, data: raw }));
});
