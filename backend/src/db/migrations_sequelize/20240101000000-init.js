'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false
      },
      username: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false
      },
      password_hash: {
        type: Sequelize.STRING,
        allowNull: false
      },
      role: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'viewer'
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

    await queryInterface.createTable('command_history', {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      username: {
        type: Sequelize.STRING,
        allowNull: false
      },
      command: {
        type: Sequelize.STRING,
        allowNull: false
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'pending'
      },
      reason: {
        type: Sequelize.STRING,
        allowNull: true
      },
      requested_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      resolved_by: {
        type: Sequelize.STRING,
        allowNull: true
      },
      resolved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      executed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      output: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      error: {
        type: Sequelize.TEXT,
        allowNull: true
      }
    });

    await queryInterface.addIndex('command_history', ['user_id']);
    await queryInterface.addIndex('command_history', ['status']);

    await queryInterface.createTable('scan_sessions', {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: Sequelize.STRING,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      mode: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'single'
      },
      targets: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      module_ids: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      params: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'pending'
      },
      result_json: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      error: {
        type: Sequelize.TEXT,
        allowNull: true
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

    await queryInterface.addIndex('scan_sessions', ['user_id']);
    await queryInterface.addIndex('scan_sessions', ['status']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('scan_sessions');
    await queryInterface.dropTable('command_history');
    await queryInterface.dropTable('users');
  }
};
