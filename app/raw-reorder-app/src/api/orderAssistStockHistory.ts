// src/api/orderAssistStockHistory.ts
import { apiGet } from './client';

export type StockHistoryRow = {
  article?: string;
  qty?: number;
  delivered_qty?: number;
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
};

export function fetchOrderAssistStockHistory(params: FetchStockHistoryParams) {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    ...(params.article ? { article: params.article } : {}),
    ...(params.date_field ? { date_field: params.date_field } : {}),
  });

  return apiGet<StockHistoryResponse>(`order_assist_stock_history/usage?${query.toString()}`);
}