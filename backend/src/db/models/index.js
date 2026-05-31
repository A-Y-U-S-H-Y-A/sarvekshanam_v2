'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');


const process = require('process');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require('../../config/database')[env];
const db = {};

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

fs
  .readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1
    );
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

// Fix Sequelize SQLite sync({ alter: true }) bug where it constantly tries to alter tables
// because it perceives 'CURRENT_TIMESTAMP' as a mismatch with model definitions.
const queryInterface = sequelize.getQueryInterface();
const originalDescribeTable = queryInterface.describeTable;
queryInterface.describeTable = async function(tableName, options) {
  const schema = await originalDescribeTable.call(this, tableName, options);
  for (const columnName in schema) {
    if (
      (columnName === 'created_at' || columnName === 'updated_at') &&
      schema[columnName].defaultValue === 'CURRENT_TIMESTAMP'
    ) {
      schema[columnName].defaultValue = undefined;
    }
  }
  return schema;
};

module.exports = db;
