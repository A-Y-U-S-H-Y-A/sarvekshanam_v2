'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add runner_id column to command_history
    await queryInterface.addColumn('command_history', 'runner_id', {
      type: Sequelize.STRING,
      allowNull: true // Allow null initially to not break existing data
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('command_history', 'runner_id');
  }
};
