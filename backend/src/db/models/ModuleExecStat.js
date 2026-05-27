'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ModuleExecStat extends Model {
    static associate(models) {
      // no associations currently needed
    }
  }
  ModuleExecStat.init({
    module_id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true
    },
    avg_time_ms: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    sample_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'ModuleExecStat',
    tableName: 'module_exec_stats',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
  return ModuleExecStat;
};
