'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SlaveGroup extends Model {
    static associate(models) {
      SlaveGroup.hasMany(models.SlaveGroupMember, { foreignKey: 'group_id', as: 'members' });
    }
  }
  SlaveGroup.init({
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    manifest_hash: {
      type: DataTypes.STRING,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'SlaveGroup',
    tableName: 'slave_groups',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
  return SlaveGroup;
};
