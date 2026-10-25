const crypto = require('crypto');

/* Rovnaký tvar ako genId() v appke (hodnotenie-defektov.html), aby ID
   generované backendom vyzerali rovnako ako tie generované appkou
   počas prechodného obdobia (ak appka zatiaľ posiela id sama, backend
   ho len prevezme — toto sa použije len keď id v tele requestu chýba,
   napr. pre attempts, kde dnes id prideľuje až Firestore). */
function genId() {
  return 'id' + Date.now() + Math.random().toString(16).slice(2);
}

module.exports = { genId };
