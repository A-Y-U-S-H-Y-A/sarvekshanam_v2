require('dotenv').config();

module.exports = {
  development: {
    dialect: process.env.DB_DIALECT || 'sqlite',
    storage: process.env.DB_PATH || './sarvekshanam.db',
    logging: false
  },
  test: {
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false
  },
  production: {
    dialect: process.env.DB_DIALECT || 'sqlite',
    storage: process.env.DB_PATH || './sarvekshanam.db',
    logging: false
  }
};
