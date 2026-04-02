// routes/vismaBundlesSql.js
const express = require('express');
const { getAlias, getPool } = require('../lib/vismaSql');

const router = express.Router();

/**
 * Intercepta GET /api/visma/bundles när force_sql=1
 * Annars släpp igenom till nästa router (vismaProxy) via next()
 *
 * Exempel:
 *   /api/visma/bundles?force_sql=1&prefix=93-&limit=200
 *   /api/visma/bundles?force_sql=1&prefix=P-72-&head_strip=P-
 */
router.get('/bundles', async (req, res, next) => {
  const forceSql = String(req.query.force_sql || '0') === '1';
  if (!forceSql) return next();

  const alias     = getAlias(req);
  const prefix    = String(req.query.prefix || '').trim();
  const headStrip = String(req.query.head_strip ?? 'P-');   // kan vara tom sträng
  const limit     = Number(req.query.limit || 500) || 500;

  try {
    const pool = await getPool(alias);

    // 1) Hämta huvud-info per paketnr från dbo.ARTPAKET
    //    - SUMMA = SUM(rad.SUMMA) (skippar header-rad)
    //    - quantity_sum = SUM(rad.ANTAL) (skippar header-rad)
    const heads = await pool.request()
      .input('pref', prefix)
      .input('lim', limit)
      .input('strip', headStrip)
      .query(`
        WITH P AS (
          SELECT
            PAKETARTNR,
            RADNR,
            ANTAL,
            SUMMA
          FROM dbo.ARTPAKET WITH (NOLOCK)
          WHERE PAKETARTNR LIKE CONCAT(@pref, '%')
        )
        SELECT TOP (@lim)
          CAST(REPLACE(PAKETARTNR, @strip, '') AS nvarchar(50)) AS nr,
          TRY_CONVERT(decimal(18,2),
            COALESCE(
              MAX(CASE WHEN RADNR = 0 THEN SUMMA END),           -- använd header-summa om den finns
              SUM(CASE WHEN RADNR > 0 THEN SUMMA ELSE 0 END)     -- annars summera rad-summor
            )
          ) AS SUMMA,
          TRY_CONVERT(decimal(18,3),
            SUM(CASE WHEN RADNR > 0 THEN ANTAL ELSE 0 END)
          ) AS quantity_sum
        FROM P
        GROUP BY PAKETARTNR
        ORDER BY PAKETARTNR
      `);

    const byHead = new Map(
      heads.recordset.map(r => [
        r.nr,
        {
          nr: r.nr,
          SUMMA: r.SUMMA ?? null,
          quantity_sum: r.quantity_sum ?? null,
          components: [],
        },
      ])
    );

    // 2) Hämta rader (RADNR > 0) för de paket vi just tog in
    if (byHead.size) {
      const list = Array.from(byHead.keys())
        .map(n => `'${String(n).replace(/'/g, "''")}'`)
        .join(',');

      // vi joinar på samma PAKETARTNR men strippar för presentation
      const rows = await pool.request()
        .input('strip', headStrip)
        .query(`
          SELECT
            CAST(REPLACE(PAKETARTNR, @strip, '') AS nvarchar(50)) AS nr,
            CAST(ARTNR AS nvarchar(50)) AS article_no,
            TRY_CONVERT(decimal(18,3), ANTAL)  AS quantity,
            TRY_CONVERT(decimal(18,4), SUMMA)  AS SUMMA,
            TXT AS description,
            TRY_CONVERT(int, RADNR)            AS row_no
          FROM dbo.ARTPAKET WITH (NOLOCK)
          WHERE REPLACE(PAKETARTNR, @strip, '') IN (${list})
            AND RADNR > 0
            AND ARTNR IS NOT NULL
          ORDER BY PAKETARTNR, RADNR
        `);

      for (const r of rows.recordset) {
        const b = byHead.get(r.nr);
        if (b) {
          b.components.push({
            article_no: r.article_no,
            quantity: r.quantity ?? 0,
            SUMMA: r.SUMMA ?? null,
            description: r.description ?? undefined,
            row_no: r.row_no ?? undefined,
          });
        }
      }
    }

    return res.json(Array.from(byHead.values()));
  } catch (e) {
    console.error('[/api/visma/bundles override] SQL error:', e);
    return res.status(500).json({ detail: String(e.message || e) });
  }
});

module.exports = router;
