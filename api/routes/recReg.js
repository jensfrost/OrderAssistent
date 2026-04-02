// routes/recReg.js  (CommonJS)
const express = require('express');
const sql = require('mssql');

const router = express.Router();

/* ===== DB config (mssql/tedious) ===== */
const {
  APP_DB_SERVER = 'localhost',
  APP_DB_INSTANCE,
  APP_DB_PORT,
  APP_DB_NAME = 'Hundapoteket',
  APP_DB_SCHEMA = 'dbo',
  APP_DB_USER,
  APP_DB_PASSWORD,
  APP_DB_TRUST = '1',
  APP_DB_ENCRYPT = 'true',
} = process.env;

const cfg = {
  server: APP_DB_SERVER,
  database: APP_DB_NAME,
  user: APP_DB_USER,
  password: APP_DB_PASSWORD,
  options: {
    encrypt: String(APP_DB_ENCRYPT).toLowerCase() !== 'false',
    trustServerCertificate: ['1', 'true', 'yes', 'on'].includes(String(APP_DB_TRUST).toLowerCase()),
    ...(APP_DB_INSTANCE ? { instanceName: APP_DB_INSTANCE } : {}),
  },
  ...(APP_DB_PORT ? { port: Number(APP_DB_PORT) } : {}),
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

let poolPromise = null;
function getPool() {
  if (!poolPromise) poolPromise = sql.connect(cfg);
  return poolPromise;
}

const Q = (name) => `[${String(name).replace(/]/g, ']]')}]`;
const TBL_RECREG = () => `${Q(APP_DB_SCHEMA)}.${Q('RECREG')}`;
const TBL_ARTREG = () => `${Q(APP_DB_SCHEMA)}.${Q('ARTREG')}`;

/* ===== Schema caches ===== */
let recregColsUpperSet = null;           // Set(UPPER(col))
let recregColsUpperToOrig = null;        // { UPPER(col): originalName }
let recregSumColNameCache = null;        // t.ex. 'RRSUMMA' eller null

async function loadRecregColumns() {
  if (recregColsUpperSet && recregColsUpperToOrig) return;
  const pool = await getPool();
  const r = await pool
    .request()
    .input('schema', sql.NVarChar, APP_DB_SCHEMA)
    .input('table', sql.NVarChar, 'RECREG')
    .query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
    `);

  recregColsUpperSet = new Set();
  recregColsUpperToOrig = {};
  for (const row of r.recordset) {
    const orig = String(row.COLUMN_NAME);
    const up = orig.toUpperCase();
    recregColsUpperSet.add(up);
    recregColsUpperToOrig[up] = orig;
  }
}

function dropRecregColumnsCache() {
  recregColsUpperSet = null;
  recregColsUpperToOrig = null;
  recregSumColNameCache = null;
}

async function tableHas(colName) {
  await loadRecregColumns();
  return recregColsUpperSet.has(String(colName).toUpperCase());
}

function pickFirstPresent(mapUpperToOrig, candidates) {
  for (const c of candidates) {
    const up = c.toUpperCase();
    if (mapUpperToOrig[up]) return mapUpperToOrig[up];
  }
  return null;
}

/**
 * Hämta kolumnnamnet för rad-À-pris i RECREG.
 * Försöker RRSUMMA först; om saknas och forceRefreshIfMissing=true
 * så reloadas schemat en gång (ifall kolumnen lagts till efter start).
 */
async function getRecregSumColName(forceRefreshIfMissing = false) {
  if (recregSumColNameCache !== null) return recregSumColNameCache; // kan vara null
  await loadRecregColumns();
  let name = pickFirstPresent(recregColsUpperToOrig, ['RRSUMMA', 'RRTOTAL', 'RRSUM', 'RRQTY_SUM']);

  if (!name && forceRefreshIfMissing) {
    // schema kan ha ändrats efter start – försök en gång till
    dropRecregColumnsCache();
    await loadRecregColumns();
    name = pickFirstPresent(recregColsUpperToOrig, ['RRSUMMA', 'RRTOTAL', 'RRSUM', 'RRQTY_SUM']);
  }

  recregSumColNameCache = name || null;
  return recregSumColNameCache;
}

// ---- ARTREG meta (för att hitta artikelnummer- & enhetskolumn) ----
let artregMetaCache = null; // { exists, artNoCol, unitCol }

async function loadArtregMeta() {
  if (artregMetaCache) return artregMetaCache;
  const pool = await getPool();

  // Finns tabellen?
  const t = await pool
    .request()
    .input('schema', sql.NVarChar, APP_DB_SCHEMA)
    .input('table', sql.NVarChar, 'ARTREG')
    .query(`
      SELECT 1 AS ok
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
    `);

  if (t.recordset.length === 0) {
    artregMetaCache = { exists: false, artNoCol: null, unitCol: null };
    return artregMetaCache;
  }

  const r = await pool
    .request()
    .input('schema', sql.NVarChar, APP_DB_SCHEMA)
    .input('table', sql.NVarChar, 'ARTREG')
    .query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
    `);

  const colsUpperToOrig = {};
  r.recordset.forEach((row) => {
    colsUpperToOrig[String(row.COLUMN_NAME).toUpperCase()] = row.COLUMN_NAME;
  });

  const artNoCandidates = ['ARARTN', 'ARTICLE_NO', 'ARTICLE_NR', 'ARTNR', 'ARTIKELNR', 'ARTIKEL_NUMMER'];
  const unitCandidates = ['ARENHET', 'AR_ENHET', 'ENHCODE', 'ENH_CODE', 'ENH', 'ENHET', 'UNIT', 'UNIT_CODE', 'UNITCODE', 'UOM'];

  const artNoCol = pickFirstPresent(colsUpperToOrig, artNoCandidates);
  const unitCol = pickFirstPresent(colsUpperToOrig, unitCandidates);

  artregMetaCache = { exists: true, artNoCol, unitCol };
  return artregMetaCache;
}

/* ===== Helpers ===== */
function isDeadlock(err) {
  const code = err?.number || err?.code;
  if (Number(code) === 1205) return true;
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('deadlock');
}

function parseNum(n) {
  if (n == null) return null;
  const v = typeof n === 'string' ? Number(n.replace(',', '.')) : Number(n);
  return Number.isFinite(v) ? v : null;
}

async function nextSeqFor(pool, arartn, tx) {
  const req = tx ? tx.request() : pool.request();
  const r = await req
    .input('ARARTN', sql.NVarChar, arartn)
    .query(`
      DECLARE @n INT = (SELECT ISNULL(MAX(RRSEQN),0) + 1 FROM ${TBL_RECREG()} WITH (UPDLOCK, HOLDLOCK) WHERE ARARTN = @ARARTN);
      SELECT @n AS nextSeq;
    `);
  return r.recordset[0]?.nextSeq || 1;
}

/* ===== Routes ===== */

// Health/meta
router.get('/_health', async (req, res) => {
  try {
    await loadRecregColumns();
    const meta = await loadArtregMeta();
    const sumCol = await getRecregSumColName(true);
    res.json({
      ok: true,
      db: {
        server: APP_DB_SERVER,
        db: APP_DB_NAME,
        schema: APP_DB_SCHEMA,
        instance: APP_DB_INSTANCE || null,
        port: APP_DB_PORT || null,
      },
      recregColumns: Object.values(recregColsUpperToOrig),
      sumColumn: sumCol,
      artregMeta: meta,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// GET /api/recReg → alla recept, med unit (via ARTREG) och ev. RRSUMMA
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const meta = await loadArtregMeta();
    const sumCol = await getRecregSumColName(true);

    let sqlText;
    if (meta.exists && meta.artNoCol && meta.unitCol) {
      sqlText = `
        SELECT r.ARARTN, r.RRSEQN, r.RRARTS, r.RRINAR, r.RRRGDT, r.RRLMDT
             ${sumCol ? `, r.${Q(sumCol)} AS RRSUMMA` : ''}
             , a.${Q(meta.unitCol)} AS unit
        FROM ${TBL_RECREG()} r
        LEFT JOIN ${TBL_ARTREG()} a
          ON a.${Q(meta.artNoCol)} = r.RRARTS
        ORDER BY r.ARARTN, r.RRSEQN
      `;
    } else {
      sqlText = `
        SELECT r.ARARTN, r.RRSEQN, r.RRARTS, r.RRINAR, r.RRRGDT, r.RRLMDT
             ${sumCol ? `, r.${Q(sumCol)} AS RRSUMMA` : ''}
        FROM ${TBL_RECREG()} r
        ORDER BY r.ARARTN, r.RRSEQN
      `;
    }

    const r = await pool.request().query(sqlText);
    res.json(r.recordset);
  } catch (e) {
    res.status(500).json({ error: String(e.originalError || e.message || e) });
  }
});

// GET /api/recReg/:ARARTN → recept för huvudartikel
router.get('/:ARARTN', async (req, res) => {
  const { ARARTN } = req.params;
  try {
    const pool = await getPool();
    const meta = await loadArtregMeta();
    const sumCol = await getRecregSumColName(true);

    const reqSql = pool.request().input('ARARTN', sql.NVarChar, ARARTN);

    let sqlText;
    if (meta.exists && meta.artNoCol && meta.unitCol) {
      sqlText = `
        SELECT r.ARARTN, r.RRSEQN, r.RRARTS, r.RRINAR, r.RRRGDT, r.RRLMDT
             ${sumCol ? `, r.${Q(sumCol)} AS RRSUMMA` : ''}
             , a.${Q(meta.unitCol)} AS unit
        FROM ${TBL_RECREG()} r
        LEFT JOIN ${TBL_ARTREG()} a
          ON a.${Q(meta.artNoCol)} = r.RRARTS
        WHERE r.ARARTN = @ARARTN
        ORDER BY r.RRSEQN
      `;
    } else {
      sqlText = `
        SELECT r.ARARTN, r.RRSEQN, r.RRARTS, r.RRINAR, r.RRRGDT, r.RRLMDT
             ${sumCol ? `, r.${Q(sumCol)} AS RRSUMMA` : ''}
        FROM ${TBL_RECREG()} r
        WHERE r.ARARTN = @ARARTN
        ORDER BY r.RRSEQN
      `;
    }

    const r = await reqSql.query(sqlText);
    res.json(r.recordset);
  } catch (e) {
    res.status(500).json({ error: String(e.originalError || e.message || e) });
  }
});

// POST /api/recReg → skapa ett eller många rader
// Body: { ARARTN, RRARTS, RRINAR, [RRSUMMA?] } | [{...}, ...]
router.post('/', async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];

  for (const it of items) {
    if (!it || !it.ARARTN || !it.RRARTS) {
      return res.status(400).json({ error: 'ARARTN och RRARTS krävs.' });
    }
    const qty = parseNum(it.RRINAR);
    if (qty == null) {
      return res.status(400).json({ error: 'RRINAR måste vara numeriskt.' });
    }
  }

  // Hämta SUM-kolumnnamn med auto-refresh om saknas
  const sumCol = await getRecregSumColName(true);

  const pool = await getPool();
  const tx = new sql.Transaction(pool);

  try {
    await tx.begin();
    const created = [];

    for (const it of items) {
      const ar = String(it.ARARTN).trim();
      const comp = String(it.RRARTS).trim();
      const qty = parseNum(it.RRINAR);
      const sumVal = it.RRSUMMA != null ? parseNum(it.RRSUMMA) : null;

      const seq = await nextSeqFor(pool, ar, tx);

      const reqIns = new sql.Request(tx)
        .input('ARARTN', sql.NVarChar, ar)
        .input('RRSEQN', sql.Int, seq)
        .input('RRARTS', sql.NVarChar, comp)
        .input('RRINAR', sql.Decimal(18, 6), qty);

      let insertSql = `
        INSERT INTO ${TBL_RECREG()} (ARARTN, RRSEQN, RRARTS, RRINAR`;

      if (sumCol && sumVal != null) {
        insertSql += `, ${Q(sumCol)}) VALUES (@ARARTN, @RRSEQN, @RRARTS, @RRINAR, @RRSUMMA);`;
        reqIns.input('RRSUMMA', sql.Decimal(18, 6), sumVal);
      } else {
        insertSql += `) VALUES (@ARARTN, @RRSEQN, @RRARTS, @RRINAR);`;
      }

      await reqIns.query(insertSql);

      created.push({
        ARARTN: ar,
        RRSEQN: seq,
        RRARTS: comp,
        RRINAR: qty,
        ...(sumCol && sumVal != null ? { RRSUMMA: sumVal } : {}),
      });
    }

    await tx.commit();
    return res.status(201).json({ count: created.length, items: created });
  } catch (e) {
    try { await tx.rollback(); } catch (_) {}
    return res.status(400).json({ error: String(e.originalError || e.message || e) });
  }
});

// PUT /api/recReg/:ARARTN/:RRSEQN → uppdatera mängd och/eller RRSUMMA
router.put('/:ARARTN/:RRSEQN', async (req, res) => {
  const { ARARTN, RRSEQN } = req.params;

  const hasQty = Object.prototype.hasOwnProperty.call(req.body || {}, 'RRINAR');
  const hasPrice = Object.prototype.hasOwnProperty.call(req.body || {}, 'RRSUMMA');

  if (!hasQty && !hasPrice) {
    return res.status(400).json({ error: 'Inget fält att uppdatera. Skicka RRINAR och/eller RRSUMMA.' });
  }

  // Hämta SUM-kolumnnamn med auto-refresh om saknas
  const sumCol = await getRecregSumColName(true);
  if (hasPrice && !sumCol) {
    return res.status(400).json({ error: 'Kolumn för RRSUMMA saknas i RECREG.' });
  }

  // Validera numeriska fält som skickats
  let qty = null;
  let price = null;
  if (hasQty) {
    qty = parseNum(req.body?.RRINAR);
    if (qty == null) return res.status(400).json({ error: 'RRINAR måste vara numeriskt.' });
  }
  if (hasPrice) {
    price = parseNum(req.body?.RRSUMMA);
    if (price == null) return res.status(400).json({ error: 'RRSUMMA måste vara numeriskt.' });
  }

  try {
    const pool = await getPool();
    const reqUp = pool.request()
      .input('ARARTN', sql.NVarChar, ARARTN)
      .input('RRSEQN', sql.Int, Number(RRSEQN));

    const sets = [];
    if (hasQty) {
      reqUp.input('RRINAR', sql.Decimal(18, 6), qty);
      sets.push('RRINAR = @RRINAR');
    }
    if (hasPrice && sumCol) {
      reqUp.input('RRSUMMA', sql.Decimal(18, 6), price);
      sets.push(`${Q(sumCol)} = @RRSUMMA`);
    }

    const sqlText = `
      UPDATE ${TBL_RECREG()}
      SET ${sets.join(', ')}
      WHERE ARARTN = @ARARTN AND RRSEQN = @RRSEQN
    `;

    const r = await reqUp.query(sqlText);
    res.json({ changed: r.rowsAffected?.[0] || 0 });
  } catch (e) {
    res.status(400).json({ error: String(e.originalError || e.message || e) });
  }
});

// DELETE /api/recReg/:ARARTN/:RRSEQN
router.delete('/:ARARTN/:RRSEQN', async (req, res) => {
  const { ARARTN, RRSEQN } = req.params;
  try {
    const pool = await getPool();
    const r = await pool.request()
      .input('ARARTN', sql.NVarChar, ARARTN)
      .input('RRSEQN', sql.Int, Number(RRSEQN))
      .query(`
        DELETE FROM ${TBL_RECREG()}
        WHERE ARARTN = @ARARTN AND RRSEQN = @RRSEQN
      `);
    res.json({ deleted: r.rowsAffected?.[0] || 0 });
  } catch (e) {
    res.status(400).json({ error: String(e.originalError || e.message || e) });
  }
});

module.exports = router;
