/* dbo.operators  <->  JSON {id, name, badgeId, createdAt}  (Firestore: operators) */
const express = require('express');
const { sql, getPool } = require('../db');
const { genId } = require('../lib/ids');

const router = express.Router();

function toJson(row) {
  return { id: row.id, name: row.name, badgeId: row.badge_id, createdAt: row.created_at };
}

router.get('/', async function (req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT id, name, badge_id, created_at FROM dbo.operators');
    res.json(result.recordset.map(toJson));
  } catch (err) { next(err); }
});

router.get('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.NVarChar(64), req.params.id)
      .query('SELECT id, name, badge_id, created_at FROM dbo.operators WHERE id = @id');
    if (result.recordset.length === 0) return res.status(404).json(null);
    res.json(toJson(result.recordset[0]));
  } catch (err) { next(err); }
});

router.post('/', async function (req, res, next) {
  try {
    const val = req.body || {};
    const id = val.id || genId();
    const pool = await getPool();
    // UNIQUE (badge_id) v schéme odhalí duplicitnú kartu rovnako, ako to
    // appka dnes kontroluje ručne pred uložením — tu to vráti 409.
    try {
      await pool.request()
        .input('id', sql.NVarChar(64), id)
        .input('name', sql.NVarChar(200), val.name)
        .input('badgeId', sql.NVarChar(100), val.badgeId)
        .input('createdAt', sql.DateTime2, val.createdAt ? new Date(val.createdAt) : new Date())
        .query(`
          MERGE dbo.operators AS target
          USING (SELECT @id AS id) AS src ON target.id = src.id
          WHEN MATCHED THEN UPDATE SET name = @name, badge_id = @badgeId
          WHEN NOT MATCHED THEN INSERT (id, name, badge_id, created_at) VALUES (@id, @name, @badgeId, @createdAt);
        `);
    } catch (err) {
      if (err.number === 2627 || err.number === 2601) { // SQL Server unique constraint violation
        return res.status(409).json({ error: 'Táto karta (badgeId) je už priradená inému operátorovi.' });
      }
      throw err;
    }
    res.json({ id });
  } catch (err) { next(err); }
});

router.delete('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.NVarChar(64), req.params.id).query('DELETE FROM dbo.operators WHERE id = @id');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
