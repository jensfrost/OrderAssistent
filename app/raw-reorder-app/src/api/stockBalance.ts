import { apiPost } from './client';

export type StockBalanceRow = {
  article?: string;
  code?: string;
  ARARTN?: string;
  onhand?: number;
  available?: number;
  qty?: number;
  balance?: number;
  stock?: number;
  unit?: string;
};

export type StockBalanceResponse = {
  rows?: StockBalanceRow[];
  [key: string]: any;
};

export type FetchStockBalanceParams = {
  articles: string[];
  mode?: 'onhand' | 'available';
  company_alias?: string;
};

export function fetchStockBalance(params: FetchStockBalanceParams) {
  return apiPost<StockBalanceResponse>('visma/stock/balance', {
    articles: params.articles,
    mode: params.mode ?? 'onhand',
    ...(params.company_alias ? { company_alias: params.company_alias } : {}),
  });
}