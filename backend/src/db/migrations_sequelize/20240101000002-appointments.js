'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create appointments table
    await queryInterface.createTable('appointments', {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      mode: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'manual'
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'active'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create appointment_chats table
    await queryInterface.createTable('appointment_chats', {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false
      },
      appointment_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: { model: 'appointments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      provider: {
        type: Sequelize.STRING,
        allowNull: true
      },
      model: {
        type: Sequelize.STRING,
        allowNull: true
      },
      messages_json: {
        type: Sequelize.TEXT,
        allowNull: false,
        defaultValue: '[]'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add appointment_id FK to scan_sessions
    await queryInterface.addColumn('scan_sessions', 'appointment_id', {
      type: Sequelize.STRING,
      allowNull: true,
      references: { model: 'appointments', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  down: async (queryInterface, _Sequelize) => {
    await queryInterface.removeColumn('scan_sessions', 'appointment_id');
    await queryInterface.dropTable('appointment_chats');
    await queryInterface.dropTable('appointments');
  }
};
