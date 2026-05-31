const { exec } = require('child_process');
const fs = require('fs');

const target = process.argv[2] || '';
const ipinfodb_apikey = process.argv[3] || '';
const maxmind_db = process.argv[4] || '';
const google_apikey = process.argv[5] || '';
const bing_apikey = process.argv[6] || '';

if (!target) {
  console.log(JSON.stringify({ status: 'error', error: 'Missing target argument' }));
  process.exit(0);
}

function parseGeolocation(output) {
  const results = {};
  const scripts = ['ip-geolocation-geoplugin', 'ip-geolocation-ipinfodb', 'ip-geolocation-maxmind'];
  
  // Extract results for each script
  for (const script of scripts) {
    const regex = new RegExp(`\\|?_?\\s*${script}:\\s*([\\s\\S]*?)(?:\\n\\|_|\\n\\||\\nNmap done|$)`);
    const match = output.match(regex);
    if (match && match[1]) {
      const block = match[1].trim();
      const parsed = {};
      const lines = block.split('\n');
      for (const line of lines) {
        if (line.includes(':')) {
          const parts = line.split(':');
          const key = parts[0].replace(/^\|_?\s*/, '').trim().toLowerCase();
          const value = parts.slice(1).join(':').trim();
          if (key && value) {
            parsed[key] = value;
          }
        }
      }
      
      // Look for the final line if it ended with |_
      const finalLineMatch = output.match(new RegExp(`\\|_\\s*(${script}[^\\n]*|.*(?:location|coordinates).*?)(\\n|$)`, 'g'));
      if (finalLineMatch) {
         for (const fLine of finalLineMatch) {
             // Only append if it seems related to this block
             if (fLine.includes(':') && !fLine.includes('ip-geolocation-')) {
                 const parts = fLine.split(':');
                 const key = parts[0].replace(/^\|_?\s*/, '').trim().toLowerCase();
                 const value = parts.slice(1).join(':').trim();
                 if (key && value && !parsed[key]) {
                     parsed[key] = value;
                 }
             }
         }
      }

      if (Object.keys(parsed).length > 0) {
        results[script] = parsed;
      }
    }
  }

  const hostMatch = output.match(/Nmap scan report for (.+)/);

  return {
    target: target,
    host: hostMatch ? hostMatch[1].trim() : null,
    services: results
  };
}

let args = [];
if (ipinfodb_apikey.trim()) args.push(`ip-geolocation-ipinfodb.apikey=${ipinfodb_apikey.trim()}`);
if (maxmind_db.trim()) args.push(`maxmind.db=${maxmind_db.trim()}`);
if (google_apikey.trim()) args.push(`ip-geolocation-map-google.apikey=${google_apikey.trim()}`);
if (bing_apikey.trim()) args.push(`ip-geolocation-map-bing.apikey=${bing_apikey.trim()}`);

const scriptArgs = args.length > 0 ? `--script-args "${args.join(',')}"` : '';
const scriptsToRun = 'ip-geolocation-geoplugin,ip-geolocation-ipinfodb,ip-geolocation-maxmind,ip-geolocation-map-google,ip-geolocation-map-bing,ip-geolocation-map-kml';

const cmd = `nmap -sn --script ${scriptsToRun} ${scriptArgs} ${target}`;

exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
  if (err && !stdout) {
    console.log(JSON.stringify({ status: 'error', error: stderr || err.message, data: { error: err.message } }));
    process.exit(0);
  }
  
  const raw = parseGeolocation(stdout);

  // Check if map files were generated in the current directory
  const files = fs.readdirSync('.');
  const generatedFiles = files.filter(f => f.endsWith('.kml') || f.endsWith('.html') || (f.includes('map') && !f.endsWith('.js') && !f.endsWith('.json')));
  if (generatedFiles.length > 0) {
      raw.generated_maps = generatedFiles;
  }
  
  console.log(JSON.stringify({ status: 'success', output: stdout, data: raw }));
});
