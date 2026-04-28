// src/api/orderAssistStockHistory.ts
import { apiGet } from './client';

export type StockHistoryRow = {
  article?: string;
  unit?: string;
  supplierNumber?: string | null;
  qty?: number;
  delivered_qty?: number;
  totalOutQty?: number;
  date?: string;
  doc_no?: string | number;
};

export type StockHistoryResponse = {
  from: string;
  to: string;
  rows: StockHistoryRow[];
  source?: string;
  debug?: {
    date_field?: string;
    visma_filter_field?: string;
    date_filter?: string;
    article_filter?: string | null;
    supplier_numbers?: string[];
    supplier_article_count?: number;
    scanned_docs?: number;
    matched_docs?: number;
    matched_rows?: number;
    skipped_rows_no_date?: number;
    skipped_rows_no_article?: number;
    skipped_rows_zero_delivered?: number;
    first_seen_doc?: string | number | null;
    last_seen_doc?: string | number | null;
    first_seen_date?: string | null;
    last_seen_date?: string | null;
  };
};

export type FetchStockHistoryParams = {
  from: string;
  to: string;
  article?: string;
  date_field?: string;
  supplier_numbers?: string[];
};

export function fetchOrderAssistStockHistory(params: FetchStockHistoryParams) {
  const query = new URLSearchParams();
  query.set('from', params.from);
  query.set('to', params.to);

  if (params.article) {
    query.set('article', params.article);
  }

  if (params.date_field) {
    query.set('date_field', params.date_field);
  }

  for (const supplierNumber of params.supplier_numbers ?? []) {
    const value = String(supplierNumber ?? '').trim();
    if (value) {
      query.append('supplier_numbers', value);
    }
  }

  return apiGet<StockHistoryResponse>(`order_assist_stock_history/usage?${query.toString()}`);
}
