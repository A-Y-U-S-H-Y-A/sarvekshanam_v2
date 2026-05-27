'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SlaveGroupMember extends Model {
    static associate(models) {
      SlaveGroupMember.belongsTo(models.SlaveGroup, { foreignKey: 'group_id', as: 'group' });
      SlaveGroupMember.belongsTo(models.RemoteHost, { foreignKey: 'runner_id', as: 'runner' });
    }
  }
  SlaveGroupMember.init({
    group_id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true
    },
    runner_id: {
      type: DataTypes.STRING,
      allowNull: false,
      primaryKey: true
    }
  }, {
    sequelize,
    modelName: 'SlaveGroupMember',
    tableName: 'slave_group_members',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
  return SlaveGroupMember;
};
