'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ScanSession extends Model {
    static associate(models) {
      ScanSession.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      ScanSession.belongsTo(models.Appointment, { foreignKey: 'appointment_id', as: 'appointment' });
    }
  }
  ScanSession.init({
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    user_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    appointment_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true
    },
    mode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'single' // single | bulk
    },
    targets: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    module_ids: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    params: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending' // pending | pending_approval | running | completed | failed | cancelled
    },
    result_json: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    runner_id: {
      type: DataTypes.STRING,
      allowNull: true
    },
    proxy_config: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    retry_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    max_retries: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5
    }
  }, {
    sequelize,
    modelName: 'ScanSession',
    tableName: 'scan_sessions',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
  return ScanSession;
};
