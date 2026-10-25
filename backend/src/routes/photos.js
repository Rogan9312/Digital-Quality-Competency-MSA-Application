/* dbo.photos  <->  JSON {id, batchId, name, photoData, correctAnswer, order}
   (Firestore: photos). photoData je base64 "data:image/jpeg;base64,..."
   reťazec — môže byť stovky kB, preto má server.js vyšší JSON limit. */
const express = require('express');
const { sql, getPool } = require('../db');
const { genId } = require('../lib/ids');

const router = express.Router();

function toJson(row) {
  return {
    id: row.id,
    batchId: row.batch_id,
    name: row.name,
    photoData: row.photo_data,
    correctAnswer: row.correct_answer,
    order: row.order
  };
}

router.get('/', async function (req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT id, batch_id, name, photo_data, correct_answer, [order] FROM dbo.photos');
    res.json(result.recordset.map(toJson));
  } catch (err) { next(err); }
});

router.get('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.NVarChar(64), req.params.id)
      .query('SELECT id, batch_id, name, photo_data, correct_answer, [order] FROM dbo.photos WHERE id = @id');
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
      .input('batchId', sql.NVarChar(64), val.batchId)
      .input('name', sql.NVarChar(400), val.name || null)
      .input('photoData', sql.NVarChar(sql.MAX), val.photoData)
      .input('correctAnswer', sql.NVarChar(16), val.correctAnswer || null)
      .input('order', sql.Int, val.order || 0)
      .query(`
        MERGE dbo.photos AS target
        USING (SELECT @id AS id) AS src ON target.id = src.id
        WHEN MATCHED THEN UPDATE SET batch_id = @batchId, name = @name, photo_data = @photoData,
          correct_answer = @correctAnswer, [order] = @order
        WHEN NOT MATCHED THEN INSERT (id, batch_id, name, photo_data, correct_answer, [order])
          VALUES (@id, @batchId, @name, @photoData, @correctAnswer, @order);
      `);
    res.json({ id });
  } catch (err) { next(err); }
});

router.delete('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.NVarChar(64), req.params.id).query('DELETE FROM dbo.photos WHERE id = @id');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
