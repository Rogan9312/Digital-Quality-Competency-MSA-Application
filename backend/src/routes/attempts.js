/* dbo.attempts + dbo.attempt_answers  <->
   JSON {id, batchId, batchLabel, operatorName, startedAt, finishedAt,
         totalCount, correctCount, scorePercent, detectionMatchCount,
         detectionScorePercent, archived,
         answers:[{photoId, name, given, note, correctAtTime, isCorrect, isExactMatch}]}
   (Firestore: attempts, s vnoreným poľom answers)

   Toto je jediná kolekcia, kde Firestore dokument obsahuje vnorené pole —
   v SQL Serveri je to samostatná tabuľka attempt_answers s cudzím kľúčom
   na attempts.id. POST preto beží v transakcii: upsert attempts riadku +
   úplná výmena jeho attempt_answers riadkov (jednoduchšie a bezpečnejšie
   ako riadkový diff, appka aj tak vždy posiela celé pole naraz). */
const express = require('express');
const { sql, getPool } = require('../db');
const { genId } = require('../lib/ids');

const router = express.Router();

function attemptToJson(row) {
  return {
    id: row.id,
    batchId: row.batch_id,
    batchLabel: row.batch_label,
    operatorName: row.operator_name,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    totalCount: row.total_count,
    correctCount: row.correct_count,
    scorePercent: row.score_percent,
    detectionMatchCount: row.detection_match_count,
    detectionScorePercent: row.detection_score_percent,
    archived: row.archived,
    answers: []
  };
}

function answerToJson(row) {
  return {
    photoId: row.photo_id,
    name: row.photo_name,
    given: row.given,
    note: row.note,
    correctAtTime: row.correct_at_time,
    isCorrect: row.is_correct,
    isExactMatch: row.is_exact_match
  };
}

const ATTEMPT_COLS = 'id, batch_id, batch_label, operator_name, started_at, finished_at, total_count, correct_count, score_percent, detection_match_count, detection_score_percent, archived';
const ANSWER_COLS = 'attempt_id, photo_id, photo_name, given, correct_at_time, note, is_correct, is_exact_match, answer_order';

router.get('/', async function (req, res, next) {
  try {
    const pool = await getPool();
    const attemptsResult = await pool.request().query(`SELECT ${ATTEMPT_COLS} FROM dbo.attempts`);
    const answersResult = await pool.request().query(`SELECT ${ANSWER_COLS} FROM dbo.attempt_answers ORDER BY attempt_id, answer_order`);

    const byId = {};
    attemptsResult.recordset.forEach(function (row) { byId[row.id] = attemptToJson(row); });
    answersResult.recordset.forEach(function (row) {
      if (byId[row.attempt_id]) byId[row.attempt_id].answers.push(answerToJson(row));
    });
    res.json(Object.keys(byId).map(function (id) { return byId[id]; }));
  } catch (err) { next(err); }
});

router.get('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    const attemptResult = await pool.request()
      .input('id', sql.NVarChar(64), req.params.id)
      .query(`SELECT ${ATTEMPT_COLS} FROM dbo.attempts WHERE id = @id`);
    if (attemptResult.recordset.length === 0) return res.status(404).json(null);

    const answersResult = await pool.request()
      .input('id', sql.NVarChar(64), req.params.id)
      .query(`SELECT ${ANSWER_COLS} FROM dbo.attempt_answers WHERE attempt_id = @id ORDER BY answer_order`);

    const out = attemptToJson(attemptResult.recordset[0]);
    out.answers = answersResult.recordset.map(answerToJson);
    res.json(out);
  } catch (err) { next(err); }
});

router.post('/', async function (req, res, next) {
  const pool = await getPool().catch(next);
  if (!pool) return;
  const transaction = new sql.Transaction(pool);
  try {
    const val = req.body || {};
    const id = val.id || genId();
    const answers = Array.isArray(val.answers) ? val.answers : [];

    await transaction.begin();

    await new sql.Request(transaction)
      .input('id', sql.NVarChar(64), id)
      .input('batchId', sql.NVarChar(64), val.batchId)
      .input('batchLabel', sql.NVarChar(200), val.batchLabel)
      .input('operatorName', sql.NVarChar(200), val.operatorName)
      .input('startedAt', sql.DateTime2, val.startedAt ? new Date(val.startedAt) : new Date())
      .input('finishedAt', sql.DateTime2, val.finishedAt ? new Date(val.finishedAt) : new Date())
      .input('totalCount', sql.Int, val.totalCount || answers.length)
      .input('correctCount', sql.Int, val.correctCount || 0)
      .input('scorePercent', sql.Int, val.scorePercent || 0)
      .input('detectionMatchCount', sql.Int, val.detectionMatchCount || 0)
      .input('detectionScorePercent', sql.Int, val.detectionScorePercent || 0)
      .input('archived', sql.Bit, val.archived ? 1 : 0)
      .query(`
        MERGE dbo.attempts AS target
        USING (SELECT @id AS id) AS src ON target.id = src.id
        WHEN MATCHED THEN UPDATE SET batch_id=@batchId, batch_label=@batchLabel, operator_name=@operatorName,
          started_at=@startedAt, finished_at=@finishedAt, total_count=@totalCount, correct_count=@correctCount,
          score_percent=@scorePercent, detection_match_count=@detectionMatchCount,
          detection_score_percent=@detectionScorePercent, archived=@archived
        WHEN NOT MATCHED THEN INSERT (id, batch_id, batch_label, operator_name, started_at, finished_at,
          total_count, correct_count, score_percent, detection_match_count, detection_score_percent, archived)
          VALUES (@id, @batchId, @batchLabel, @operatorName, @startedAt, @finishedAt, @totalCount, @correctCount,
            @scorePercent, @detectionMatchCount, @detectionScorePercent, @archived);
      `);

    // Najjednoduchšia bezpečná stratégia pre vnorené pole: zmazať a vložiť
    // nanovo celé, appka aj tak vždy posiela answers ako celok, nie po častiach.
    await new sql.Request(transaction)
      .input('attemptId', sql.NVarChar(64), id)
      .query('DELETE FROM dbo.attempt_answers WHERE attempt_id = @attemptId');

    for (let i = 0; i < answers.length; i++) {
      const a = answers[i];
      await new sql.Request(transaction)
        .input('attemptId', sql.NVarChar(64), id)
        .input('photoId', sql.NVarChar(64), a.photoId)
        .input('photoName', sql.NVarChar(400), a.name || null)
        .input('given', sql.NVarChar(16), a.given)
        .input('correctAtTime', sql.NVarChar(16), a.correctAtTime)
        .input('note', sql.NVarChar(1000), a.note || null)
        .input('isCorrect', sql.Bit, a.isCorrect ? 1 : 0)
        .input('isExactMatch', sql.Bit, a.isExactMatch ? 1 : 0)
        .input('answerOrder', sql.Int, i)
        .query(`
          INSERT INTO dbo.attempt_answers
            (attempt_id, photo_id, photo_name, given, correct_at_time, note, is_correct, is_exact_match, answer_order)
          VALUES
            (@attemptId, @photoId, @photoName, @given, @correctAtTime, @note, @isCorrect, @isExactMatch, @answerOrder);
        `);
    }

    await transaction.commit();
    res.json({ id });
  } catch (err) {
    try { await transaction.rollback(); } catch (_) { /* transakcia už mohla skončiť */ }
    next(err);
  }
});

router.delete('/:id', async function (req, res, next) {
  try {
    const pool = await getPool();
    // ON DELETE CASCADE v schéme zmaže aj attempt_answers tohto pokusu.
    await pool.request().input('id', sql.NVarChar(64), req.params.id).query('DELETE FROM dbo.attempts WHERE id = @id');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
