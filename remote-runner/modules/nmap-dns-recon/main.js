const { exec } = require('child_process');
const dns = require('dns');
const util = require('util');

const execAsync = util.promisify(exec);
const resolveNs = util.promisify(dns.resolveNs);

const target = process.argv[2] || '';
const threadsInput = process.argv[3] || '5';
const threads = threadsInput.trim();

if (!target) {
  console.log(JSON.stringify({ status: 'error', error: 'Missing target argument' }));
  process.exit(0);
}

async function runNmapDNSRecon() {
  const subdomainsSet = new Map(); // key: hostname, value: Set of addresses
  const additionalRecords = [];
  const errors = [];
  
  // 1. dns-brute (Runs locally against the domain)
  const bruteCmd = `nmap -sn --script dns-brute --script-args dns-brute.threads=${threads} ${target}`;
  let bruteOutput = '';
  try {
    const { stdout } = await execAsync(bruteCmd, { timeout: 300000 });
    bruteOutput = stdout;
  } catch (err) {
    bruteOutput = err.stdout || '';
    if (!bruteOutput) errors.push('dns-brute failed: ' + err.message);
  }

  // Parse dns-brute
  const subdomainLine = /^\s*\|_?\s+([a-zA-Z0-9.-]+)\s+-\s+([a-fA-F0-9.:]+)$/gm;
  let match;
  while ((match = subdomainLine.exec(bruteOutput)) !== null) {
    const hostname = match[1].trim().toLowerCase();
    const address = match[2].trim();
    if (!subdomainsSet.has(hostname)) subdomainsSet.set(hostname, new Set());
    subdomainsSet.get(hostname).add(address);
  }

  // Resolve NS to target zone transfer and NSEC enum
  let nameservers = [];
  try {
    nameservers = await resolveNs(target);
  } catch (err) {
    errors.push('Failed to resolve NS records: ' + err.message);
  }

  if (nameservers.length > 0) {
    const nsTargets = nameservers.join(' ');
    
    // 2. dns-nsec-enum
    // Using UDP port 53 by default for nmap NSEC enumeration
    const nsecCmd = `nmap -sU -p 53 --script dns-nsec-enum --script-args dns-nsec-enum.domains=${target} ${nsTargets}`;
    let nsecOutput = '';
    try {
      const { stdout } = await execAsync(nsecCmd, { timeout: 300000 });
      nsecOutput = stdout;
    } catch (err) {
      nsecOutput = err.stdout || '';
      if (!nsecOutput && !err.message.includes('ENOENT')) {
        errors.push('dns-nsec-enum error: ' + err.message);
      }
    }
    
    const escapedTarget = target.replace(/\./g, '\\.');
    const nsecRegex = new RegExp(`[a-zA-Z0-9.-]+\\.${escapedTarget}`, 'gi');
    let nsecMatch;
    while ((nsecMatch = nsecRegex.exec(nsecOutput)) !== null) {
      const hostname = nsecMatch[0].toLowerCase();
      if (!subdomainsSet.has(hostname)) subdomainsSet.set(hostname, new Set());
    }

    // 3. dns-zone-transfer
    const axfrCmd = `nmap -p 53 --script dns-zone-transfer --script-args dnszonetransfer.domain=${target} ${nsTargets}`;
    let axfrOutput = '';
    try {
      const { stdout } = await execAsync(axfrCmd, { timeout: 300000 });
      axfrOutput = stdout;
    } catch (err) {
      axfrOutput = err.stdout || '';
      if (!axfrOutput && !err.message.includes('ENOENT')) {
        errors.push('dns-zone-transfer error: ' + err.message);
      }
    }
    
    // Parse zone transfer
    const lines = axfrOutput.split('\n');
    let inAxfr = false;
    for (const line of lines) {
      if (line.includes('dns-zone-transfer:')) {
        inAxfr = true;
        continue;
      }
      if (inAxfr) {
        if (!line.startsWith('|') && !line.startsWith('|_')) {
          if (line.trim() === '') continue;
          inAxfr = false;
          break;
        }
        const data = line.replace(/^\|_?\s*/, '').trim();
        const parts = data.split(/\s+/);
        if (parts.length >= 3) {
          const hostname = parts[0].toLowerCase();
          const type = parts[1];
          const val = parts.slice(2).join(' ');
          if (hostname.endsWith(target)) {
            if (type === 'A' || type === 'AAAA') {
              if (!subdomainsSet.has(hostname)) subdomainsSet.set(hostname, new Set());
              subdomainsSet.get(hostname).add(val);
            } else {
              additionalRecords.push({ hostname, type, value: val });
            }
          }
        }
      }
    }
  }

  // Compile final results and de-duplicate completely
  const subdomains = [];
  for (const [hostname, addresses] of subdomainsSet.entries()) {
    subdomains.push({
      hostname: hostname,
      addresses: Array.from(addresses)
    });
  }

  const result = {
    target: target,
    nameservers: nameservers,
    subdomainsCount: subdomains.length,
    subdomains: subdomains,
    additionalRecords: additionalRecords,
    errors: errors.length > 0 ? errors : undefined
  };

  console.log(JSON.stringify({ status: 'success', output: 'Merged DNS recon completed', data: result }));
}

runNmapDNSRecon().catch(err => {
  console.log(JSON.stringify({ status: 'error', error: err.message, data: { error: err.message } }));
  process.exit(0);
});
