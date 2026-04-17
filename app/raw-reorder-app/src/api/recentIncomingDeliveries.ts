import { getJson } from './client';

export type RecentIncomingDeliveryItem = {
    article: string;
    deliveryDocumentNumber?: string | null;
    deliveryDate?: string | null;
    rowNumber?: number | null;
    bestnr?: string | null;
    deliveredQty?: number | null;
    unit?: string | null;
    text?: string | null;
    supplierArticleNumber?: string | null;
    priceEach?: number | null;
    amount?: number | null;
    supplierNumber?: string | null;
    supplierName?: string | null;
};

export type RecentIncomingDeliveriesResponse = {
    rows?: Record<string, RecentIncomingDeliveryItem[]>;
    source?: string;
    debug?: Record<string, unknown>;
};

export type FetchRecentIncomingDeliveriesParams = {
    article: string;
    limit_per_article?: number;
    from_date?: string;
    to_date?: string;
    max_heads?: number;
};

export type FetchMatchingIncomingDeliveriesParams = {
    article: string;
    bestnr: string;
    from_date?: string;
    to_date?: string;
    max_heads?: number;
    max_hits?: number;
};

export async function fetchRecentIncomingDeliveries(
    params: FetchRecentIncomingDeliveriesParams
): Promise<RecentIncomingDeliveriesResponse> {
    const qs = new URLSearchParams();

    qs.set('article', params.article);

    if (params.limit_per_article != null) {
        qs.set('limit_per_article', String(params.limit_per_article));
    }

    if (params.from_date) {
        qs.set('from_date', params.from_date);
    }

    if (params.to_date) {
        qs.set('to_date', params.to_date);
    }

    if (params.max_heads != null) {
        qs.set('max_heads', String(params.max_heads));
    }

    const url = `/incoming_delivery_notes/recent_by_article?${qs.toString()}`;
    console.log('[fetchRecentIncomingDeliveries] url =', url);
    return getJson<RecentIncomingDeliveriesResponse>(url);
}

export async function fetchMatchingIncomingDeliveries(
    params: FetchMatchingIncomingDeliveriesParams
): Promise<RecentIncomingDeliveriesResponse> {
    const articleKey = params.article.trim().toUpperCase();
    const normalizedBestnr = String(params.bestnr ?? '').trim();
    const limitPerArticle = Math.max(params.max_hits ?? 1, 20);
    const maxHeads = params.max_heads ?? 10000;

    const buildResponse = (
        recent: RecentIncomingDeliveriesResponse,
        recentMatches: RecentIncomingDeliveryItem[],
        matchedVia: string,
        extraDebug?: Record<string, unknown>
    ): RecentIncomingDeliveriesResponse => ({
        rows: {
            [articleKey]: recentMatches,
        },
        source: recent.source,
        debug: {
            ...(recent.debug ?? {}),
            matched_bestnr: normalizedBestnr,
            matched_from_date: params.from_date ?? null,
            matched_to_date: params.to_date ?? null,
            matched_count: recentMatches.length,
            matched_via: matchedVia,
            ...(extraDebug ?? {}),
        },
    });

    const matchRows = (recent: RecentIncomingDeliveriesResponse) =>
        (recent.rows?.[articleKey] ?? []).filter(
            (item) => String(item.bestnr ?? '').trim() === normalizedBestnr
        );

    const filtered = await fetchRecentIncomingDeliveries({
        article: params.article,
        limit_per_article: limitPerArticle,
        from_date: params.from_date,
        to_date: params.to_date,
        max_heads: maxHeads,
    });

    const filteredMatches = matchRows(filtered);
    if (filteredMatches.length > 0 || (!params.from_date && !params.to_date)) {
        return buildResponse(filtered, filteredMatches, 'recent_by_article');
    }

    const fallback = await fetchRecentIncomingDeliveries({
        article: params.article,
        limit_per_article: limitPerArticle,
        max_heads: maxHeads,
    });

    const fallbackMatches = matchRows(fallback);
    return buildResponse(
        fallback,
        fallbackMatches,
        'recent_by_article_fallback_unfiltered',
        {
            filtered_attempt_debug: filtered.debug ?? {},
            filtered_attempt_match_count: filteredMatches.length,
        }
    );
}
