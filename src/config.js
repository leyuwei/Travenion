const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

module.exports = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'travenion'
  },
  app: {
    port: process.env.APP_PORT || 8311
  },
  jwtSecret: process.env.JWT_SECRET || 'travenion-secret'
};
