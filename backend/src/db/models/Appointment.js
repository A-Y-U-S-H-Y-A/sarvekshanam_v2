'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Appointment extends Model {
    static associate(models) {
      Appointment.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      Appointment.hasMany(models.ScanSession, { foreignKey: 'appointment_id', as: 'scans' });
      Appointment.hasMany(models.AppointmentChat, { foreignKey: 'appointment_id', as: 'chats' });
    }
  }
  Appointment.init({
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false
    },
    user_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    mode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'manual' // manual | automated | hybrid
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'active' // active | completed | archived
    }
  }, {
    sequelize,
    modelName: 'Appointment',
    tableName: 'appointments',
    underscored: true,
    timestamps: true,
    paranoid: true,
    deletedAt: 'deleted_at',
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });
  return Appointment;
};
