import { apiGet } from './client';

export interface LeadtimeMatch {
  article: string;
  booking_document: string | null;
  booking_row: number | null;
  delivery_document: string | null;
  ref_document: string | null;
  ref_docrow: number | null;
  from_document: string | null;
  from_docrow: number | null;
  connection_document: string | null;
  connection_docrow: number | null;
  booking_date: string | null;
  expected_date: string | null;
  arrival_date: string | null;
  booking_qty: number | string | null;
  delivered_qty: number | string | null;
  lead_time_days: number | null;
  booking_text: string | null;
  delivery_text: string | null;
}

export interface ArticleLeadtimeResponse {
  article: string;
  samples: number;
  lead_times: number[];
  median_lead_time_days: number | null;
  average_lead_time_days: number | null;
  suggested_lead_time_days: number | null;
  matches: LeadtimeMatch[];
  note: string;
}

export interface GetArticleLeadtimeParams {
  min_valid_days?: number;
  max_valid_days?: number;
  max_booking_heads?: number;
  max_delivery_heads?: number;
}

export async function getArticleLeadtime(
  article: string,
  params: GetArticleLeadtimeParams = {}
): Promise<ArticleLeadtimeResponse> {
  const query = new URLSearchParams();

  if (params.min_valid_days != null) {
    query.set('min_valid_days', String(params.min_valid_days));
  }

  if (params.max_valid_days != null) {
    query.set('max_valid_days', String(params.max_valid_days));
  }

  if (params.max_booking_heads != null) {
    query.set('max_booking_heads', String(params.max_booking_heads));
  }

  if (params.max_delivery_heads != null) {
    query.set('max_delivery_heads', String(params.max_delivery_heads));
  }

  const path = `leadtime/article/${encodeURIComponent(article)}${
    query.toString() ? `?${query.toString()}` : ''
  }`;

  return apiGet<ArticleLeadtimeResponse>(path);
}