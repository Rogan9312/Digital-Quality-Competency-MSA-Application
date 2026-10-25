/* Firestore `kv` kolekcia bola vo schéme rozdelená na dbo.app_settings
   (jeden riadok nastavení) a dbo.hidden_operator_names (zoznam). Táto
   route zachováva pôvodné generické API appky (GET/POST/DELETE podľa
   "key") tak, že podľa hodnoty :key prepne na správnu tabuľku — appka
   tak môže volať /api/kv/:key presne ako predtým volala
   firestore.collection('kv').doc(key), bez vedomia o rozdelení vnútri. */
const express = require('express');
const { sql, getPool } = require('../db');

const router = express.Router();

async function getActiveBatchId(pool) {
  const r = await pool.request().query('SELECT active_batch_id FROM dbo.app_settings WHERE id = 1');
  const row = r.recordset[0];
  if (!row || row.active_batch_id == null) return null;
  return { key: 'activeBatchId', value: row.active_batch_id };
}
async function setActiveBatchId(pool, value) {
  await pool.request().input('v', sql.NVarChar(64), value || null)
    .query('UPDATE dbo.app_settings SET active_batch_id = @v WHERE id = 1');
}

async function getAdminPin(pool) {
  const r = await pool.request().query('SELECT admin_pin_hash, admin_pin_salt FROM dbo.app_settings WHERE id = 1');
  const row = r.recordset[0];
  if (!row || !row.admin_pin_hash) return null;
  return { key: 'adminPin', hash: row.admin_pin_hash, salt: row.admin_pin_salt };
}
async function setAdminPin(pool, hash, salt) {
  await pool.request().input('hash', sql.NVarChar(200), hash).input('salt', sql.NVarChar(200), salt)
    .query('UPDATE dbo.app_settings SET admin_pin_hash = @hash, admin_pin_salt = @salt WHERE id = 1');
}

async function getHiddenOperatorNames(pool) {
  const r = await pool.request().query('SELECT operator_name FROM dbo.hidden_operator_names');
  return { key: 'hiddenOperatorNames', names: r.recordset.map(function (row) { return row.operator_name; }) };
}
async function setHiddenOperatorNames(pool, names) {
  const list = Array.isArray(names) ? names : [];
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).query('DELETE FROM dbo.hidden_operator_names');
    for (const name of list) {
      await new sql.Request(tx).input('name', sql.NVarChar(200), name)
        .query('INSERT INTO dbo.hidden_operator_names (operator_name) VALUES (@name)');
    }
    await tx.commit();
  } catch (err) {
    try { await tx.rollback(); } catch (_) { /* no-op */ }
    throw err;
  }
}

router.get('/:key', async function (req, res, next) {
  try {
    const pool = await getPool();
    let out = null;
    if (req.params.key === 'activeBatchId') out = await getActiveBatchId(pool);
    else if (req.params.key === 'adminPin') out = await getAdminPin(pool);
    else if (req.params.key === 'hiddenOperatorNames') out = await getHiddenOperatorNames(pool);
    else return res.status(404).json({ error: 'Neznámy kv kľúč: ' + req.params.key });
    if (out === null) return res.status(404).json(null);
    res.json(out);
  } catch (err) { next(err); }
});

// POST /:key ~ idbPut('kv', {key, ...}) — telo musí obsahovať "key" zhodný s URL parametrom
router.post('/:key', async function (req, res, next) {
  try {
    const val = req.body || {};
    const pool = await getPool();
    if (req.params.key === 'activeBatchId') {
      await setActiveBatchId(pool, val.value);
    } else if (req.params.key === 'adminPin') {
      await setAdminPin(pool, val.hash, val.salt);
    } else if (req.params.key === 'hiddenOperatorNames') {
      await setHiddenOperatorNames(pool, val.names);
    } else {
      return res.status(404).json({ error: 'Neznámy kv kľúč: ' + req.params.key });
    }
    res.json({ id: req.params.key });
  } catch (err) { next(err); }
});

module.exports = router;
