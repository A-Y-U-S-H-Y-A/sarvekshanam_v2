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



const cmd = `nmap -sV -p ${ports} -${timing} ${target}`;
exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
  if (err) {

    console.log(JSON.stringify({ status: 'error', error: stderr || err.message, data: { error: err.message } }));
    process.exit(0);
  }
  const raw = parsePortScan(stdout);
  console.log(JSON.stringify({ status: 'success', output: stdout, data: raw }));
});
