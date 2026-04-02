// api/routes/admin.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

const router = express.Router();

// ==== config / helpers ====
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function getBearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function ensureAdmin(req, res, next) {
  try {
    const token = getBearer(req);
    if (!token) return res.status(401).json({ message: 'Saknar token' });
    const payload = jwt.verify(token, JWT_SECRET);
    if (String(payload.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ message: 'Endast admin' });
    }
    req.admin = payload;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Ogiltig eller utgången token' });
  }
}

// ==== ROLLER ====
// Om du inte har en rolltabell kan vi returnera en statisk lista:
router.get('/roles', ensureAdmin, async (_req, res) => {
  const roles = [
    { ROLECODE: 'admin',    ROLENAME: 'Administratör' },
    { ROLECODE: 'operator', ROLENAME: 'Operatör' },
    { ROLECODE: 'warehouse',ROLENAME: 'Lager' },
    { ROLECODE: 'viewer',   ROLENAME: 'Läsbehörighet' },
  ];
  return res.json(roles);
});

// ==== ANVÄNDARE ====

// Lista
router.get('/users', ensureAdmin, async (_req, res) => {
  try {
    const users = await sequelize.query(
      `SELECT
         ANANVN AS ANANVN,
         ANMAIL AS ANMAIL,
         ANROLE AS ANROLE,
         ANRGDT AS ANRGDT,
         ANLMDT AS ANLMDT
       FROM ANVREG
       ORDER BY ANANVN`,
      { type: QueryTypes.SELECT }
    );
    return res.json(users);
  } catch (e) {
    console.error('[admin/users list] error', e);
    return res.status(500).json({ message: 'Serverfel' });
  }
});

// Skapa
router.post('/users', ensureAdmin, async (req, res) => {
  try {
    const { ANMAIL, ANROLE, password } = req.body || {};
    if (!ANMAIL || !ANROLE || !password || String(password).length < 8) {
      return res.status(400).json({ message: 'Ogiltiga fält (e-post/roll/lösenord)' });
    }

    // Finns redan?
    const exists = await sequelize.query(
      `SELECT COUNT(1) AS n FROM ANVREG WHERE ANMAIL = :email`,
      { replacements: { email: ANMAIL }, type: QueryTypes.SELECT }
    );
    if ((exists[0]?.n || exists[0]?.N) > 0) {
      return res.status(409).json({ message: 'E-post används redan' });
    }

    const hash = await bcrypt.hash(String(password).trim(), 10);

    // Låt databasen skapa ID (IDENTITY på ANANVN)
    const rows = await sequelize.query(
      `INSERT INTO ANVREG (ANMAIL, ANPASS, ANROLE, ANRGDT, ANLMDT)
       OUTPUT INSERTED.ANANVN AS id
       VALUES (:email, :pwd, :role, SYSDATETIME(), SYSDATETIME())`,
      { replacements: { email: ANMAIL, pwd: hash, role: ANROLE }, type: QueryTypes.INSERT }
    );

    const newId = Array.isArray(rows) && rows[0] && rows[0][0]?.id ? rows[0][0].id : null;
    return res.json({ ok: true, id: newId });
  } catch (e) {
    console.error('[admin/users create] error', e);
    return res.status(500).json({ message: 'Serverfel' });
  }
});

// Uppdatera
router.patch('/users/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { ANMAIL, ANROLE, password } = req.body || {};
    if (!id) return res.status(400).json({ message: 'Saknar id' });

    // Bygg dynamiskt SET
    const sets = [];
    const params = { id };
    if (ANMAIL) { sets.push('ANMAIL = :email'); params.email = ANMAIL; }
    if (ANROLE) { sets.push('ANROLE = :role');  params.role = ANROLE; }
    if (password && String(password).trim().length >= 8) {
      sets.push('ANPASS = :pwd');
      params.pwd = await bcrypt.hash(String(password).trim(), 10);
    }
    sets.push('ANLMDT = SYSDATETIME()');

    const sql = `UPDATE ANVREG SET ${sets.join(', ')} WHERE ANANVN = :id`;
    await sequelize.query(sql, { replacements: params, type: QueryTypes.UPDATE });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/users update] error', e);
    return res.status(500).json({ message: 'Serverfel' });
  }
});

// Ta bort
router.delete('/users/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Saknar id' });

    await sequelize.query(
      `DELETE FROM ANVREG WHERE ANANVN = :id`,
      { replacements: { id }, type: QueryTypes.DELETE }
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error('[admin/users delete] error', e);
    return res.status(500).json({ message: 'Serverfel' });
  }
});

module.exports = router;
