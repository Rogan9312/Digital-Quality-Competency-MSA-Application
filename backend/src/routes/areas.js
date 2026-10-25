/* dbo.areas  <->  JSON {id, label, createdAt}  (Firestore: areas) */
const express = require('express');
const { sql, getPool } = require('../db');
const { genId } = require('../lib/ids');

const router = express.Router();

function toJson(row) {
  return { id: row.id, label: row.label, createdAt: row.created_at };
}

router.get('/', async function (req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT id, label, created_at FROM dbo.areas');
    res.json(result.recordset.map(toJson));
  } catch (err) { next(err); }
});

router.get('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.NVarChar(64), req.params.id)
      .query('SELECT id, label, created_at FROM dbo.areas WHERE id = @id');
    if (result.recordset.length === 0) return res.status(404).json(null);
    res.json(toJson(result.recordset[0]));
  } catch (err) { next(err); }
});

// POST / ~ idbPut('areas', val) — upsert, generuje id ak chýba, vráti { id }
router.post('/', async function (req, res, next) {
  try {
    const val = req.body || {};
    const id = val.id || genId();
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar(64), id)
      .input('label', sql.NVarChar(200), val.label)
      .input('createdAt', sql.DateTime2, val.createdAt ? new Date(val.createdAt) : new Date())
      .query(`
        MERGE dbo.areas AS target
        USING (SELECT @id AS id) AS src ON target.id = src.id
        WHEN MATCHED THEN UPDATE SET label = @label
        WHEN NOT MATCHED THEN INSERT (id, label, created_at) VALUES (@id, @label, @createdAt);
      `);
    res.json({ id });
  } catch (err) { next(err); }
});

router.delete('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.NVarChar(64), req.params.id).query('DELETE FROM dbo.areas WHERE id = @id');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
