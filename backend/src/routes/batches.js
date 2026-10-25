/* dbo.batches  <->  JSON {id, label, areaId, createdAt}  (Firestore: batches) */
const express = require('express');
const { sql, getPool } = require('../db');
const { genId } = require('../lib/ids');

const router = express.Router();

function toJson(row) {
  return { id: row.id, label: row.label, areaId: row.area_id, createdAt: row.created_at };
}

router.get('/', async function (req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT id, label, area_id, created_at FROM dbo.batches');
    res.json(result.recordset.map(toJson));
  } catch (err) { next(err); }
});

router.get('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.NVarChar(64), req.params.id)
      .query('SELECT id, label, area_id, created_at FROM dbo.batches WHERE id = @id');
    if (result.recordset.length === 0) return res.status(404).json(null);
    res.json(toJson(result.recordset[0]));
  } catch (err) { next(err); }
});

router.post('/', async function (req, res, next) {
  try {
    const val = req.body || {};
    const id = val.id || genId();
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar(64), id)
      .input('label', sql.NVarChar(200), val.label)
      .input('areaId', sql.NVarChar(64), val.areaId || null)
      .input('createdAt', sql.DateTime2, val.createdAt ? new Date(val.createdAt) : new Date())
      .query(`
        MERGE dbo.batches AS target
        USING (SELECT @id AS id) AS src ON target.id = src.id
        WHEN MATCHED THEN UPDATE SET label = @label, area_id = @areaId
        WHEN NOT MATCHED THEN INSERT (id, label, area_id, created_at) VALUES (@id, @label, @areaId, @createdAt);
      `);
    res.json({ id });
  } catch (err) { next(err); }
});

router.delete('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    // ON DELETE CASCADE v schéme zmaže aj photos a attempts tejto dávky
    // (zámerne — appka pri mazaní dávky maže aj "všetky jej výsledky").
    await pool.request().input('id', sql.NVarChar(64), req.params.id).query('DELETE FROM dbo.batches WHERE id = @id');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
