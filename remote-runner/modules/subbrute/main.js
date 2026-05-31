const { exec } = require('child_process');

const target = process.argv[2] || '';

if (!target) {
  console.log(JSON.stringify({ status: 'error', error: 'Missing target argument' }));
  process.exit(0);
}

function parseSubbrute(output) {
  const parsedSubdomains = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('[') || trimmed.startsWith('Warning')) continue;
    
    // Subbrute output is usually: subdomain.domain.com,record_type,record_value OR just subdomain.domain.com
    const parts = trimmed.split(',');
    if (parts.length > 0 && parts[0].includes(target)) {
      parsedSubdomains.push({
        hostname: parts[0].trim(),
        recordType: parts.length > 1 ? parts[1].trim() : 'A',
        address: parts.length > 2 ? parts[2].trim() : null,
      });
    }
  }

  return {
    target: target,
    subdomains: parsedSubdomains,
    foundCount: parsedSubdomains.length,
  };
}



const cmd = `subbrute.py ${target}`;

exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
  if (err) {

    
    if (!stdout || !stdout.trim()) {
       console.log(JSON.stringify({ status: 'error', error: stderr || err.message, data: { error: err.message } }));
       process.exit(0);
    }
  }
  
  const raw = parseSubbrute(stdout || '');
  console.log(JSON.stringify({ status: 'success', output: stdout, data: raw }));
});
