'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AppointmentChat extends Model {
    static associate(models) {
      AppointmentChat.belongsTo(models.Appointment, { foreignKey: 'appointment_id', as: 'appointment' });
    }
  }
  AppointmentChat.init({
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    appointment_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: true
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true
    },
    model: {
      type: DataTypes.STRING,
      allowNull: true
    },
    messages_json: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]'
    }
  }, {
    sequelize,
    modelName: 'AppointmentChat',
    tableName: 'appointment_chats',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
  return AppointmentChat;
};
