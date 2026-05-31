'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = [
      'api_keys',
      'appointments',
      'appointment_chats',
      'remote_hosts',
      'scan_sessions',
      'users'
    ];
    
    for (const table of tables) {
      // Check if column exists to be idempotent
      const tableInfo = await queryInterface.describeTable(table).catch(err => {
        console.warn(`Warning: Could not describe table ${table}:`, err.message);
        return null;
      });
      if (tableInfo && !tableInfo['deleted_at']) {
        await queryInterface.addColumn(table, 'deleted_at', {
          type: Sequelize.DATE,
          allowNull: true
        });
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tables = [
      'api_keys',
      'appointments',
      'appointment_chats',
      'remote_hosts',
      'scan_sessions',
      'users'
    ];
    
    for (const table of tables) {
      const tableInfo = await queryInterface.describeTable(table).catch(err => {
        console.warn(`Warning: Could not describe table ${table}:`, err.message);
        return null;
      });
      if (tableInfo && tableInfo['deleted_at']) {
        await queryInterface.removeColumn(table, 'deleted_at');
      }
    }
  }
};
