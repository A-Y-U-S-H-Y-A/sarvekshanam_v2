const { exec } = require('child_process');

const target = process.argv[2] || '';

if (!target) {
  console.log(JSON.stringify({ status: 'error', error: 'Missing target argument' }));
  process.exit(0);
}

function parseWhois(output) {
  const records = {};
  
  // Extracting lines that start with | or |_ under whois-domain or whois-ip
  const whoisLines = [];
  const lines = output.split('\n');
  let inWhois = false;
  for (let line of lines) {
    if (line.includes('whois-domain:') || line.includes('whois-ip:')) {
      inWhois = true;
      const inlineData = line.split(/whois-(?:domain|ip):/)[1].trim();
      if (inlineData) {
        whoisLines.push(inlineData);
      }
      continue;
    }
    if (inWhois) {
      if (!line.startsWith('|') && !line.startsWith('|_')) {
        if (line.trim() === '') continue;
        inWhois = false;
        continue;
      }
      whoisLines.push(line.replace(/^\|_?\s?/, '').trim());
      if (line.startsWith('|_')) {
        inWhois = false;
        continue;
      }
    }
  }
  
  let rawText = whoisLines.join('\n');
  if (rawText) {
    // Attempt basic parsing of key: value pairs
    const linesToParse = rawText.split('\n');
    for (const line of linesToParse) {
      if (line.includes(':')) {
        const parts = line.split(':');
        const key = parts[0].trim().toLowerCase();
        const value = parts.slice(1).join(':').trim();
        if (key && value && !key.includes('%')) {
          records[key] = value;
        }
      }
    }
  }

  const hostMatch = output.match(/Nmap scan report for (.+)/);

  return {
    target: target,
    host: hostMatch ? hostMatch[1].trim() : null,
    raw: rawText,
    parsed: records
  };
}

const cmd = `nmap --script whois-domain,whois-ip ${target} -sn`;
exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
  if (err) {
    console.log(JSON.stringify({ status: 'error', error: stderr || err.message, data: { error: err.message } }));
    process.exit(0);
  }
  const raw = parseWhois(stdout);
  console.log(JSON.stringify({ status: 'success', output: stdout, data: raw }));
});
