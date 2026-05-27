'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ApiKey extends Model {
    static associate(models) {
      ApiKey.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    }
  }
  ApiKey.init({
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    user_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    key_hash: {
      type: DataTypes.STRING,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Untitled Key'
    },
    scopes_json: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '["*"]',
      get() {
        const raw = this.getDataValue('scopes_json');
        try { return JSON.parse(raw); } catch { return ['*']; }
      },
      set(val) {
        this.setDataValue('scopes_json', JSON.stringify(val));
      }
    },
    last_used_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    revoked_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'ApiKey',
    tableName: 'api_keys',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
  return ApiKey;
};
