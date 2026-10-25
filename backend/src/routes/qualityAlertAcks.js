/* dbo.quality_alert_acks  <->  JSON {id, qualityAlertId, operatorName, ackedAt}
   (Firestore: qualityAlertAcks) */
const express = require('express');
const { sql, getPool } = require('../db');
const { genId } = require('../lib/ids');

const router = express.Router();

function toJson(row) {
  return { id: row.id, qualityAlertId: row.quality_alert_id, operatorName: row.operator_name, ackedAt: row.acked_at };
}

router.get('/', async function (req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT id, quality_alert_id, operator_name, acked_at FROM dbo.quality_alert_acks');
    res.json(result.recordset.map(toJson));
  } catch (err) { next(err); }
});

router.get('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.NVarChar(64), req.params.id)
      .query('SELECT id, quality_alert_id, operator_name, acked_at FROM dbo.quality_alert_acks WHERE id = @id');
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
      .input('qualityAlertId', sql.NVarChar(64), val.qualityAlertId)
      .input('operatorName', sql.NVarChar(200), val.operatorName)
      .input('ackedAt', sql.DateTime2, val.ackedAt ? new Date(val.ackedAt) : new Date())
      .query(`
        MERGE dbo.quality_alert_acks AS target
        USING (SELECT @id AS id) AS src ON target.id = src.id
        WHEN MATCHED THEN UPDATE SET quality_alert_id = @qualityAlertId, operator_name = @operatorName, acked_at = @ackedAt
        WHEN NOT MATCHED THEN INSERT (id, quality_alert_id, operator_name, acked_at)
          VALUES (@id, @qualityAlertId, @operatorName, @ackedAt);
      `);
    res.json({ id });
  } catch (err) { next(err); }
});

router.delete('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.NVarChar(64), req.params.id).query('DELETE FROM dbo.quality_alert_acks WHERE id = @id');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
