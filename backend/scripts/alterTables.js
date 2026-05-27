const { db } = require('./src/db/database');

const tables = [
  'appointments',
  'scan_sessions',
  'appointment_chats',
  'remote_hosts',
  'slave_groups',
  'slave_group_members',
  'command_history',
  'users',
  'api_keys',
  'module_exec_stats'
];

async function addDeletedAt() {
  for (const t of tables) {
    try {
      await db.sequelize.query(`ALTER TABLE ${t} ADD COLUMN deleted_at DATETIME`);
      console.log(`Added deleted_at to ${t}`);
    } catch (e) {
      console.log(`${t} already has deleted_at or error: ${e.message}`);
    }
  }
  console.log('Columns added');
  process.exit(0);
}

addDeletedAt();
