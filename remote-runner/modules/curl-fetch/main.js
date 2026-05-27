const { execSync } = require('child_process');

function run() {
  const target = process.argv[2];
  const method = process.argv[3] || 'GET';
  
  if (!target) {
    console.error("Target parameter is required");
    process.exit(1);
  }

  try {
    const output = execSync(`curl -s -X ${method} ${target}`).toString();
    console.log(output);
  } catch (error) {
    console.error(`Error running curl: ${error.message}`);
    process.exit(1);
  }
}

run();
