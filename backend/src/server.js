const express = require('express');
const cors = require('cors');
const config = require('./config');

const app = express();

// Fotky sú base64 reťazce až do ~700 kB (pozri PROJECT-SUMMARY.md) — default
// Express JSON limit (100kb) by ich odmietol, preto zvýšené na 5mb.
app.use(express.json({ limit: '5mb' }));

app.use(cors({
  origin: config.corsOrigin.length > 0 ? config.corsOrigin : true,
  methods: ['GET', 'POST', 'DELETE']
}));

// Jednoduchá zdieľaná autentifikácia (rovnaký princíp ako appkin spoločný
// admin PIN) — zapne sa len ak je API_KEY nastavený v .env; inak sa pre
// lokálny vývoj vynechá.
app.use(function (req, res, next) {
  if (!config.apiKey) return next();
  if (req.get('X-API-Key') === config.apiKey) return next();
  res.status(401).json({ error: 'Chýba alebo je neplatný X-API-Key.' });
});

app.get('/api/health', function (req, res) { res.json({ ok: true }); });

app.use('/api/areas', require('./routes/areas'));
app.use('/api/batches', require('./routes/batches'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/operators', require('./routes/operators'));
app.use('/api/qualityAlerts', require('./routes/qualityAlerts'));
app.use('/api/qualityAlertAcks', require('./routes/qualityAlertAcks'));
app.use('/api/attempts', require('./routes/attempts'));
app.use('/api/kv', require('./routes/kv'));

// Centrálny error handler — nikdy nemlčať (rovnaká filozofia ako appkin
// showStorageWarning() banner pre Firestore chyby).
app.use(function (err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: err.message || 'Interná chyba servera.' });
});

app.listen(config.port, function () {
  console.log('Hodnotenie defektov API beží na porte ' + config.port);
});
