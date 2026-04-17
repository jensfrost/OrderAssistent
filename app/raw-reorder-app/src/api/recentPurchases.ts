import { getJson } from './client';

export type RecentPurchaseItem = {
    article: string;
    orderDocumentNumber: string | null;
    orderDate: string | null;
    rowDate: string | null;
    orderedQty: number;
    deliveredQty: number;
    restQty: number;
    unit: string;
};

export type RecentPurchasesResponse = {
    from: string;
    to: string;
    rows: Record<string, RecentPurchaseItem[]>;
    source: string;
    debug?: Record<string, unknown>;
};

export async function fetchRecentPurchases(params: {
    from: string;
    to: string;
    article?: string;
    limit_per_article?: number;
    date_field?: 'document_date1' | 'document_date2';
}): Promise<RecentPurchasesResponse> {
    const search = new URLSearchParams();
    search.set('from', params.from);
    search.set('to', params.to);

    if (params.article) search.set('article', params.article);
    if (params.limit_per_article != null) {
        search.set('limit_per_article', String(params.limit_per_article));
    }
    if (params.date_field) search.set('date_field', params.date_field);

    const path = `/order_assist_stock_history/recent_purchases?${search.toString()}`;
    console.log('[fetchRecentPurchases] path =', path);
    return getJson<RecentPurchasesResponse>(
        `/order_assist_stock_history/recent_purchases?${search.toString()}`
    );
}