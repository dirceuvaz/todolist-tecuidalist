const path = require('path');

const config = {
  port: parseInt(process.env.TCL_PORT, 10) || 58901,
  dataDir: process.env.TCL_DATA_DIR || path.join(__dirname, 'data'),
  encryptionKey: process.env.TCL_ENCRYPTION_KEY || 'tecuidalist-local-dev-key',
  jwtSecret: process.env.TCL_JWT_SECRET || 'tecuidalist-jwt-secret',
  isDesktop: process.env.TCL_DESKTOP !== 'false',
};

module.exports = config;
