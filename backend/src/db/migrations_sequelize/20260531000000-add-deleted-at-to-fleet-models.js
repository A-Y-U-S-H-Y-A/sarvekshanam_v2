'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tables = ['slave_groups', 'slave_group_members', 'module_exec_stats'];
    
    for (const table of tables) {
      // Check if column exists to be idempotent (good practice)
      const tableInfo = await queryInterface.describeTable(table);
      if (!tableInfo['deleted_at']) {
        await queryInterface.addColumn(table, 'deleted_at', {
          type: Sequelize.DATE,
          allowNull: true
        });
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tables = ['slave_groups', 'slave_group_members', 'module_exec_stats'];
    
    for (const table of tables) {
      const tableInfo = await queryInterface.describeTable(table);
      if (tableInfo['deleted_at']) {
        await queryInterface.removeColumn(table, 'deleted_at');
      }
    }
  }
};
