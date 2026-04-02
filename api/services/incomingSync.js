// api/services/incomingSync.js
const axios = require('axios');
const { IncomingNoteHead, IncomingNoteRow } = require('../models');

const PAGE_SIZE = 100;

const VISMA_API_BASE =
  (process.env.VISMA_API_BASE || '').replace(/\/+$/, '') || 'http://127.0.0.1:8000';

// Enkel axios-klient mot visma-api
const vismaClient = axios.create({
  baseURL: VISMA_API_BASE,
  timeout: 30000,
});

// ───────────────── Visma-anrop (anpassa paths vid behov) ─────────────────

async function vismaListIncomingPaged(params) {
  // samma som RN: /incoming_delivery_notes/paged
  const res = await vismaClient.get('/incoming_delivery_notes/paged', {
    params,
  });
  return res.data;
}

async function vismaGetIncomingRowsByRegnr(regnr) {
  const encoded = encodeURIComponent(String(regnr));
  // samma som RN: /incoming_delivery_notes/rows/{regnr}
  const res = await vismaClient.get(`/incoming_delivery_notes/rows/${encoded}`, {
    params: { row_limit: 2000 },
  });
  return res.data;
}

// ───────────────── Normalisering ─────────────────

function normalizeHead(raw) {
  const regnr = String(raw.regnr || '').trim();
  const docnr = raw.doc_number || raw.document_number || raw.docnr || null;
  const dateStr = raw.date ? String(raw.date) : null;

  return {
    regnr,
    docNumber: docnr ? String(docnr) : null,
    docDate: dateStr ? new Date(dateStr) : null,
    supplierNo: String(raw.levnr || raw.supplier_number || '' || ''),
    supplierName: raw.namn || raw.supplier_name || null,
    rowCount: raw.rows?.length || raw.nrows || raw.row_count || null,
    status: raw.status || 'open',
    currencyCode: String(raw.currency_code || raw.currency || 'SEK')
      .toUpperCase()
      .slice(0, 3),
    rawJson: JSON.stringify(raw),
    lastSyncedAt: new Date(),
  };
}

function normalizeRow(regnr, r, idx) {
  const qty = Number(
    r.quantity3 ?? r.quantity1 ?? r.quantity2 ?? r.quantity ?? 0
  );

  return {
    regnr,
    rowIndex: idx + 1,
    articleNumber: r.article_number || r.artikelnr || r.ARARTN || r.VLARTNR || '',
    description:
      r.description || r.text || r.benamning || r.ARNAMN || r.TEXT || '',
    quantity: Number.isFinite(qty) ? qty : 0,
    unit: String(
      r.unit || r.enh || r.VLENHET || r.RWENHET || 'kg'
    ).toLowerCase(),
    bestBefore: r.best_before || r.VLBBDT || null,
    purchasePrice:
      r.purchase_price || r.price_each_current_currency || r.INPRIS || null,
    currencyCode: String(r.currency_code || r.currency || 'SEK')
      .toUpperCase()
      .slice(0, 3),
    rawJson: JSON.stringify(r),
    lastSyncedAt: new Date(),
  };
}

// ───────────────── UPSERT HEAD (via model.upsert) ─────────────────

async function upsertHead(headData) {
  // kräver PK på regnr (vilket vi har i modellen)
  await IncomingNoteHead.upsert(headData);
}

// ───────────────── FULL HEAD-SYNC ─────────────────

async function syncIncomingFromVisma() {
  let page = 0;
  const pageSize = PAGE_SIZE;

  // loopa tills vi nått total
  // (samma struktur som RN: { items, total, page_size, ... })
  while (true) {
    const resp = await vismaListIncomingPaged({
      page,
      page_size: pageSize,
      order: 'desc',
      include_rows: false,
      row_limit: 0,
    });

    const items = Array.isArray(resp?.items) ? resp.items : resp || [];
    if (!items.length) break;

    for (const raw of items) {
      const head = normalizeHead(raw);
      if (!head.regnr) continue;
      await upsertHead(head);
    }

    page++;
    const total = Number(resp?.total || 0);
    const size = Number(resp?.page_size || pageSize);
    if (!total || page * size >= total) break;
  }
}

// ───────────────── RADER FÖR ETT REGNR ─────────────────

async function syncRowsForRegnr(regnr) {
  const resp = await vismaGetIncomingRowsByRegnr(regnr);
  const rowsRaw = Array.isArray(resp?.rows) ? resp.rows : resp || [];
  const mapped = rowsRaw.map((r, idx) => normalizeRow(regnr, r, idx));

  // transaktion: rensa → skriv → bumpa LastSyncedAt i head
  await IncomingNoteRow.sequelize.transaction(async (t) => {
    await IncomingNoteRow.destroy({
      where: { regnr },
      transaction: t,
    });

    if (mapped.length) {
      await IncomingNoteRow.bulkCreate(mapped, { transaction: t });
    }

    await IncomingNoteHead.update(
      { lastSyncedAt: new Date() },
      { where: { regnr }, transaction: t }
    );
  });
}

module.exports = {
  syncIncomingFromVisma,
  syncRowsForRegnr,
};
