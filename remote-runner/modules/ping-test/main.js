const { execSync } = require('child_process');

function run() {
  const target = process.argv[2];
  const count = process.argv[3] || '4';
  
  if (!target) {
    console.error("Target parameter is required");
    process.exit(1);
  }

  try {
    const isWindows = process.platform === 'win32';
    const flag = isWindows ? '-n' : '-c';
    const output = execSync(`ping ${flag} ${count} ${target}`).toString();
    console.log(output);
  } catch (error) {
    console.error(`Error running ping: ${error.message}`);
    process.exit(1);
  }
}

run();
