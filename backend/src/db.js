/* Jeden zdieľaný connection pool pre celú appku (odporúčaný vzor balíka
   `mssql` — nevytvárať nový pool na request, ale znovupoužívať tento).
   Používa SQL Server Authentication (meno/heslo) cez tedious ovládač —
   funguje rovnako na Windows aj Linux serveri, bez natívnych závislostí.

   Ak firemné IT vyžaduje Windows Authentication (integrated security)
   namiesto SQL Server Authentication, treba:
     npm install msnodesqlv8
   a vytvoriť pool cez `require('mssql/msnodesqlv8')` s `driver: 'msnodesqlv8'`
   a connection stringom bez user/password (pozri dokumentáciu balíka
   mssql — sekcia "Windows Authentication"). Zvyšok appky (routes/*) sa
   meniť nemusí, keďže volá len `getPool()` nižšie. */
const sql = require('mssql');
const config = require('./config');

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    const cfg = {
      server: config.db.server,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      options: {
        encrypt: config.db.encrypt,
        trustServerCertificate: config.db.trustServerCertificate,
        instanceName: config.db.instanceName
      }
    };
    if (config.db.port) cfg.port = config.db.port;
    poolPromise = new sql.ConnectionPool(cfg).connect().catch(function (err) {
      poolPromise = null; // skús znova pri ďalšom requeste, namiesto trvalo pokazeného poolu
      throw err;
    });
  }
  return poolPromise;
}

module.exports = { sql, getPool };
