import { apiGet } from './client';

export type VismaArticle = {
  ARARTN: string;
  ARNAMN: string;
  ARENHET?: string;
  LEVNR?: string;
  LEVNAMN?: string;
  adk_article_webshop?: boolean | null;
  raw?: any;
};

type RawVismaArticleRow = {
  data?: {
    adk_article_number?: string;
    adk_article_name?: string;
    adk_stock_unit?: string | null;
    adk_article_supplier_number?: string | null;
    adk_article_supplier_name?: string | null;
    ADK_SUPPLIER_NAME?: string | null;
    adk_article_webshop?: boolean | null;
    [key: string]: any;
  };
  [key: string]: any;
};

export async function fetchVismaArticles(): Promise<VismaArticle[]> {
  const rows = await apiGet<RawVismaArticleRow[]>('vismaArticles');

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      const data = row?.data ?? {};

      return {
        ARARTN: String(data.adk_article_number ?? '').trim(),
        ARNAMN: String(data.adk_article_name ?? '').trim(),
        ARENHET: data.adk_stock_unit ? String(data.adk_stock_unit).trim() : undefined,
        LEVNR: data.adk_article_supplier_number
          ? String(data.adk_article_supplier_number).trim()
          : undefined,
        LEVNAMN: String(
          data.ADK_SUPPLIER_NAME ??
          data.adk_article_supplier_name ??
          ''
        ).trim() || undefined,
        adk_article_webshop:
          typeof data.adk_article_webshop === 'boolean'
            ? data.adk_article_webshop
            : data.adk_article_webshop == null
              ? null
              : ['1', 'true', 'y', 'yes', 'j', 'ja'].includes(
                  String(data.adk_article_webshop).trim().toLowerCase()
                ),
        raw: row,
      };
    })
    .filter((row) => row.ARARTN);
}