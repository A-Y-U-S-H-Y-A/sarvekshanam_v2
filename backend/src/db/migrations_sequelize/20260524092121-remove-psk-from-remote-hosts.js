'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.removeColumn('remote_hosts', 'psk');
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.addColumn('remote_hosts', 'psk', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }
};
