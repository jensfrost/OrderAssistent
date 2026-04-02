// /routes/authReg.js
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

const { sendResetEmail, verifySmtp } = require('../services/mailer');

const router = express.Router();

// ─── Konfiguration ─────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '8h';

// Bas-URL för reset-länk (utan avslutande "/")
const BASE_URL = String(process.env.APP_URL || process.env.CLIENT_URL || '').replace(/\/+$/, '');

const RAW_RESET_PATH = process.env.RESET_PATH ?? '/reset-password'; // välj din path (matcha frontenden)
const RESET_PATH =
  RAW_RESET_PATH === ''
    ? ''
    : (RAW_RESET_PATH.startsWith('/') ? RAW_RESET_PATH : `/${RAW_RESET_PATH}`);

// TTL för reset-token i minuter
const RESET_TTL_MIN = Number(process.env.RESET_TOKEN_TTL_MIN || 60);

// ─── Små hjälpfunktioner ───────────────────────────────────────────────────
function getBearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}
function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}
function usernameFromEmail(email) {
  const s = String(email || '');
  return s.includes('@') ? s.split('@')[0] : s;
}
function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
function permsFor(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'admin') return ['*'];
  if (r === 'prod') return ['batches:*', 'produce:*', 'raw:*', 'recipes:view', 'articles:view'];
  if (r === 'viewer') return ['articles:view', 'recipes:view', 'batches:view', 'raw:view'];
  return ['articles:view'];
}
function ensureAuth(req, res, next) {
  const token = getBearer(req);
  if (!token) return res.status(401).json({ message: 'Saknar token' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Ogiltig eller utgången token' });
  }
}

function buildResetUrl(token) {
  if (!BASE_URL) {
    // fail-fast så du upptäcker fel deploy direkt
    throw new Error('APP_URL/CLIENT_URL is not set - cannot build reset link');
  }
  return `${BASE_URL}${RESET_PATH}?token=${encodeURIComponent(token)}`;
}

// ─── POST /api/authReg/login ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email och lösenord krävs' });
  }
  try {
    const users = await sequelize.query(
      `SELECT
         ANANVN AS id,
         ANMAIL AS email,
         ANPASS AS pwd,
         ANROLE AS role
       FROM ANVREG
       WHERE ANMAIL = :email`,
      { replacements: { email }, type: QueryTypes.SELECT }
    );

    const u = users[0];
    if (!u) return res.status(401).json({ message: 'Fel email eller lösenord' });

    // Stöd både bcrypt och ev. äldre klartext
    let ok = false;
    if (u.pwd) {
      try { ok = await bcrypt.compare(password, u.pwd); } catch { ok = false; }
      if (!ok) ok = (password === u.pwd);
    }
    if (!ok) return res.status(401).json({ message: 'Fel email eller lösenord' });

    const user = {
      id: Number(u.id),
      username: usernameFromEmail(u.email),
      email: u.email,
      role: u.role || 'user',
      perms: permsFor(u.role),
    };
    const token = signToken(user);

    return res.json({ token, user });
  } catch (err) {
    console.error('[auth/login] error', err);
    return res.status(500).json({ message: 'Serverfel' });
  }
});

// ─── POST /api/authReg/forgot  { email } ───────────────────────────────────
// Alltid 200 för att undvika enumrering av e-post
router.post('/forgot', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.json({ ok: true });

  try {
    const rows = await sequelize.query(
      `SELECT ANANVN AS id FROM ANVREG WHERE ANMAIL = :email`,
      { replacements: { email }, type: QueryTypes.SELECT }
    );

    if (rows[0]) {
      const userId = Number(rows[0].id);

      // Skapa token & spara hash i DB
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = sha256(token);

      await sequelize.query(
        `INSERT INTO PWDRESET (UserId, TokenHash, CreatedAt, ExpiresAt)
         VALUES (:uid, :th, SYSDATETIME(), DATEADD(minute, :ttl, SYSDATETIME()))`,
        { replacements: { uid: userId, th: tokenHash, ttl: RESET_TTL_MIN }, type: QueryTypes.INSERT }
      );

      // Bygg länk
      let resetUrl;
      try {
        resetUrl = buildResetUrl(token);
      } catch (e) {
        console.error('[pwd-reset] APP_URL missing/misconfigured:', e?.message || e);
        return res.json({ ok: true });
      }

      // Skicka e-post
      const info = await sendResetEmail(email, resetUrl);

      console.log('[pwd-reset] queued', {
        to: email,
        messageId: info && (info.messageId || info.msgId || info.id),
        accepted: info && info.accepted,
        rejected: info && info.rejected,
        response: info && info.response,
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth/forgot] error', err);
    // Svara 200 ändå för att inte läcka existens av mail
    return res.json({ ok: true });
  }
});

// ─── POST /api/authReg/reset  { token, password } ──────────────────────────
router.post('/reset', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password || String(password).trim().length < 8) {
    return res.status(400).json({ message: 'Ogiltig token eller för kort lösenord' });
  }

  try {
    const tokenHash = sha256(token);

    const rows = await sequelize.query(
      `SELECT TOP 1 UserId
         FROM PWDRESET
        WHERE TokenHash = :th
          AND UsedAt IS NULL
          AND ExpiresAt > SYSDATETIME()
        ORDER BY CreatedAt DESC`,
      { replacements: { th: tokenHash }, type: QueryTypes.SELECT }
    );

    if (!rows[0]) return res.status(400).json({ message: 'Ogiltig eller utgången token' });

    const userId = Number(rows[0].UserId);
    const hash = await bcrypt.hash(String(password).trim(), 10);

    await sequelize.query(
      `UPDATE ANVREG
          SET ANPASS = :pwd,
              ANLMDT = SYSDATETIME()
        WHERE ANANVN = :id`,
      { replacements: { pwd: hash, id: userId }, type: QueryTypes.UPDATE }
    );

    await sequelize.query(
      `UPDATE PWDRESET SET UsedAt = SYSDATETIME() WHERE TokenHash = :th`,
      { replacements: { th: tokenHash }, type: QueryTypes.UPDATE }
    );

    // (valfritt) invalidera övriga aktiva tokens för samma användare
    await sequelize.query(
      `UPDATE PWDRESET
          SET UsedAt = COALESCE(UsedAt, SYSDATETIME())
        WHERE UserId = :uid AND UsedAt IS NULL`,
      { replacements: { uid: userId }, type: QueryTypes.UPDATE }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth/reset] error', err);
    return res.status(500).json({ message: 'Serverfel' });
  }
});

// ─── POST /api/authReg/change-password  { currentPassword, newPassword } ───
// Kräver Authorization: Bearer <JWT>
router.post('/change-password', ensureAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || String(newPassword).trim().length < 8) {
    return res.status(400).json({ message: 'Saknar fält eller för kort nytt lösenord' });
  }

  try {
    const userId = Number(req.auth.sub);

    const rows = await sequelize.query(
      `SELECT ANPASS AS pwd FROM ANVREG WHERE ANANVN = :id`,
      { replacements: { id: userId }, type: QueryTypes.SELECT }
    );
    const u = rows[0];
    if (!u) return res.status(404).json({ message: 'Användare saknas' });

    let ok = false;
    if (u.pwd) {
      try { ok = await bcrypt.compare(currentPassword, u.pwd); } catch { ok = false; }
      if (!ok) ok = (currentPassword === u.pwd); // fallback om legacy klartext
    }
    if (!ok) return res.status(401).json({ message: 'Fel nuvarande lösenord' });

    const hash = await bcrypt.hash(String(newPassword).trim(), 10);

    await sequelize.query(
      `UPDATE ANVREG
          SET ANPASS = :pwd,
              ANLMDT = SYSDATETIME()
        WHERE ANANVN = :id`,
      { replacements: { pwd: hash, id: userId }, type: QueryTypes.UPDATE }
    );

    // (valfritt) ogiltigförklara ev. reset-tokens
    await sequelize.query(
      `UPDATE PWDRESET
          SET UsedAt = COALESCE(UsedAt, SYSDATETIME())
        WHERE UserId = :uid AND UsedAt IS NULL`,
      { replacements: { uid: userId }, type: QueryTypes.UPDATE }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth/change-password] error', err);
    return res.status(500).json({ message: 'Serverfel' });
  }
});

// ─── GET /api/authReg/test-smtp ────────────────────────────────────────────
router.get('/test-smtp', async (_req, res) => {
  try {
    const info = await verifySmtp();
    res.json({ ok: true, info });
  } catch (e) {
    console.error('SMTP verify error:', e);
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
});

// ─── GET /api/authReg/me ───────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const token = getBearer(req);
    if (!token) return res.status(401).json({ message: 'Saknar token' });

    const payload = jwt.verify(token, JWT_SECRET);
    const rows = await sequelize.query(
      `SELECT ANANVN AS id, ANMAIL AS email, ANROLE AS role
       FROM ANVREG WHERE ANANVN = :id`,
      { replacements: { id: payload.sub }, type: QueryTypes.SELECT }
    );
    const u = rows[0];
    if (!u) return res.status(401).json({ message: 'Användare saknas' });

    const user = {
      id: Number(u.id),
      username: usernameFromEmail(u.email),
      email: u.email,
      role: u.role || 'user',
      perms: permsFor(u.role),
    };
    return res.json({ user });
  } catch (err) {
    return res.status(401).json({ message: 'Ogiltig eller utgången token' });
  }
});

module.exports = router;
