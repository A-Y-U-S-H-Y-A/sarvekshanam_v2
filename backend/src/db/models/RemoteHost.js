'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class RemoteHost extends Model {
    static associate(models) {
      RemoteHost.hasMany(models.SlaveGroupMember, { foreignKey: 'runner_id', as: 'group_memberships' });
    }
  }
  RemoteHost.init({
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'unknown' // online | offline | unknown
    },
    modules_json: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]'
    },
    last_seen_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'RemoteHost',
    tableName: 'remote_hosts',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
  return RemoteHost;
};
