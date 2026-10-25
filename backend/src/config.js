require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    throw new Error(`Chýba povinná premenná prostredia ${name} (skopíruj .env.example na .env a vyplň).`);
  }
  return v;
}

module.exports = {
  db: {
    server: required('DB_SERVER'),
    instanceName: process.env.DB_INSTANCE || undefined,
    port: process.env.DB_INSTANCE ? undefined : Number(process.env.DB_PORT || 1433),
    database: required('DB_NAME'),
    user: process.env.DB_USER || undefined,
    password: process.env.DB_PASSWORD || undefined,
    encrypt: (process.env.DB_ENCRYPT || 'true') === 'true',
    trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE || 'false') === 'true'
  },
  port: Number(process.env.PORT || 4000),
  corsOrigin: (process.env.CORS_ORIGIN || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
  apiKey: process.env.API_KEY || null
};
