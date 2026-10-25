/* dbo.quality_alerts  <->
   JSON {id, areaId, title, description, imageData, dateFrom, durationDays,
         isActive, createdAt}  (Firestore: qualityAlerts) */
const express = require('express');
const { sql, getPool } = require('../db');
const { genId } = require('../lib/ids');

const router = express.Router();

function toJson(row) {
  return {
    id: row.id,
    areaId: row.area_id,
    title: row.title,
    description: row.description,
    imageData: row.image_data,
    dateFrom: row.date_from,
    durationDays: row.duration_days,
    isActive: row.is_active,
    createdAt: row.created_at
  };
}

router.get('/', async function (req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query(
      'SELECT id, area_id, title, description, image_data, date_from, duration_days, is_active, created_at FROM dbo.quality_alerts'
    );
    res.json(result.recordset.map(toJson));
  } catch (err) { next(err); }
});

router.get('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.NVarChar(64), req.params.id)
      .query('SELECT id, area_id, title, description, image_data, date_from, duration_days, is_active, created_at FROM dbo.quality_alerts WHERE id = @id');
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
      .input('areaId', sql.NVarChar(64), val.areaId || null)
      .input('title', sql.NVarChar(300), val.title)
      .input('description', sql.NVarChar(sql.MAX), val.description || null)
      .input('imageData', sql.NVarChar(sql.MAX), val.imageData || null)
      .input('dateFrom', sql.Date, val.dateFrom ? new Date(val.dateFrom) : null)
      .input('durationDays', sql.Int, val.durationDays)
      .input('isActive', sql.Bit, val.isActive === false ? 0 : 1)
      .input('createdAt', sql.DateTime2, val.createdAt ? new Date(val.createdAt) : new Date())
      .query(`
        MERGE dbo.quality_alerts AS target
        USING (SELECT @id AS id) AS src ON target.id = src.id
        WHEN MATCHED THEN UPDATE SET area_id = @areaId, title = @title, description = @description,
          image_data = @imageData, date_from = @dateFrom, duration_days = @durationDays, is_active = @isActive
        WHEN NOT MATCHED THEN INSERT (id, area_id, title, description, image_data, date_from, duration_days, is_active, created_at)
          VALUES (@id, @areaId, @title, @description, @imageData, @dateFrom, @durationDays, @isActive, @createdAt);
      `);
    res.json({ id });
  } catch (err) { next(err); }
});

router.delete('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    // ON DELETE CASCADE v schéme zmaže aj quality_alert_acks tohto alertu.
    await pool.request().input('id', sql.NVarChar(64), req.params.id).query('DELETE FROM dbo.quality_alerts WHERE id = @id');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
