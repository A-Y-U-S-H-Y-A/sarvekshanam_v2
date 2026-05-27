'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CommandHistory extends Model {
    static associate(models) {
      CommandHistory.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    }
  }
  CommandHistory.init({
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    user_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false
    },
    command: {
      type: DataTypes.STRING,
      allowNull: false
    },
    runner_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending' // pending | approved | rejected | executing | executed | failed
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true
    },
    requested_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    resolved_by: {
      type: DataTypes.STRING,
      allowNull: true
    },
    resolved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    executed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    output: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'CommandHistory',
    tableName: 'command_history',
    underscored: true,
    timestamps: false
  });
  return CommandHistory;
};
