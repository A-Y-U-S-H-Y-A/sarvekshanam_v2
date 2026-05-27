'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. slave_groups
    await queryInterface.createTable('slave_groups', {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      manifest_hash: {
        type: Sequelize.STRING,
        allowNull: false
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // 2. slave_group_members
    await queryInterface.createTable('slave_group_members', {
      group_id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'slave_groups',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      runner_id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'remote_hosts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // 3. module_exec_stats
    await queryInterface.createTable('module_exec_stats', {
      module_id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true
      },
      avg_time_ms: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      sample_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // 4. scan_sessions new columns
    await queryInterface.addColumn('scan_sessions', 'runner_id', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.addColumn('scan_sessions', 'proxy_config', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn('scan_sessions', 'retry_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn('scan_sessions', 'max_retries', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 5
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('scan_sessions', 'max_retries');
    await queryInterface.removeColumn('scan_sessions', 'retry_count');
    await queryInterface.removeColumn('scan_sessions', 'proxy_config');
    await queryInterface.removeColumn('scan_sessions', 'runner_id');

    await queryInterface.dropTable('module_exec_stats');
    await queryInterface.dropTable('slave_group_members');
    await queryInterface.dropTable('slave_groups');
  }
};
