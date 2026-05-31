const { execSync } = require('child_process');
const { getDb } = require('../src/db/database');

async function initDb() {
  try {
    console.log('\n===========================================');
    console.log('[DB Init] Starting Database Initialization');
    console.log('===========================================');

    console.log('[1/2] Running pending migrations...');
    // Run sequelize CLI migrations
    execSync('npx sequelize-cli db:migrate', { stdio: 'inherit' });
    
    console.log('\n[2/2] Syncing remaining models...');
    // Sync models without altering existing tables
    await getDb().sequelize.sync();
    
    console.log('\n===========================================');
    console.log('[DB Init] Database initialization complete!');
    console.log('===========================================\n');
    process.exit(0);
  } catch (error) {
    console.error('\n[DB Init] Error during database initialization:', error);
    process.exit(1);
  }
}

initDb();
