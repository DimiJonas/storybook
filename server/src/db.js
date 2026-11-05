// Database connection settings (from server/.env), shared by the server and the scripts.
const { types } = require('pg');

// Send dates (like a memory's date) as plain "2025-10-22" text instead of a timestamp.
// Otherwise 22 Oct becomes "2025-10-21T22:00:00.000Z", and browsers in other time zones
// show the wrong day. (1082 is Postgres' type number for DATE.)
types.setTypeParser(1082, (value) => value);

const dbConfig = () => ({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME || 'storybook',
  password: process.env.DB_PASSWORD,
  port: 5432,
});

module.exports = { dbConfig };
