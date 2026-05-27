const { execSync } = require('child_process');

function run() {
  const target = process.argv[2];
  const typeInput = process.argv[3] || 'A';
  
  if (!target) {
    console.error("Target parameter is required");
    process.exit(1);
  }

  const types = typeInput.split(',').map(t => t.trim()).filter(Boolean);
  let allOutput = [];
  let hasError = false;

  for (const type of types) {
    try {
      const output = execSync(`nslookup -type=${type} ${target}`).toString();
      allOutput.push(`--- Type: ${type} ---`);
      allOutput.push(output.trim());
    } catch (error) {
      allOutput.push(`--- Type: ${type} ---`);
      allOutput.push(`Error: ${error.message}`);
      if (error.stdout) {
        allOutput.push(error.stdout.toString().trim());
      }
      hasError = true;
    }
  }

  console.log(allOutput.join('\n\n'));
  if (hasError) process.exit(1);
}

run();
