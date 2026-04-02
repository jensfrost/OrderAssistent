import React, { useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import ScreenContainer from '../components/ScreenContainer';
import { login } from '../api/auth';
import {
    fetchOrderAssistStockHistory,
    StockHistoryResponse,
    StockHistoryRow,
} from '../api/orderAssistStockHistory';
import {
    fetchStockBalance,
    StockBalanceResponse,
    StockBalanceRow,
} from '../api/stockBalance';
import { fetchVismaArticles, VismaArticle } from '../api/vismaArticles';
import { fetchSuppliers, Supplier } from '../api/suppliers';
import { getArticleLeadtime } from '../api/leadtime';
import { APP_ENV, API_ROOT } from '../config/api';

type ExtendedArticle = VismaArticle & {
    adk_article_webshop?: boolean | null;
    adk_stock_unit?: string | null;
    raw?: {
        data?: {
            adk_article_webshop?: boolean | string | number | null;
            adk_stock_unit?: string | null;
            [key: string]: any;
        };
        [key: string]: any;
    };
};

type ProductSettingsMap = Record<
    string,
    {
        leadTimeDays?: number;
        safetyDays?: number;
    }
>;

type AutoLeadTimeMap = Record<string, number>;
type WebshopFilter = 'ALL' | 'WEBSHOP_ONLY';

type AssistantRow = {
    article: string;
    title: string;
    unit?: string;
    supplier?: string;
    supplierNumber?: string;
    totalQty: number;
    avgPerDay: number;
    avgPerWeek: number;
    leadTimeDays: number;
    safetyDays: number;
    hasCustomLeadTime: boolean;
    hasAutoLeadTime: boolean;
    hasCustomSafetyDays: boolean;
    forecastLeadTimeQty: number;
    safetyQty: number;
    targetStockQty: number;
    currentStockQty: number;
    suggestedOrderQty: number;
    roundedOrderQty: number;
    status: 'OK' | 'WATCH' | 'ORDER';
    daysUntilOutOfStock: number | null;
    estimatedOutOfStockDate: string | null;
    latestOrderDate: string | null;
    daysUntilLatestOrder: number | null;
    isPastLatestOrderDate: boolean;
    isWebshopArticle: boolean;
};

type SortBy = 'article' | 'title' | 'supplier' | 'roundedOrderQty';

function isValidDateString(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function daysBetweenInclusive(from: string, to: string) {
    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T00:00:00`);
    const diffMs = toDate.getTime() - fromDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

function round2(value: number) {
    return Number(value.toFixed(2));
}

function roundUpToPackSize(value: number, packSize: number) {
    if (!Number.isFinite(packSize) || packSize <= 1) return round2(value);
    if (value <= 0) return 0;
    return Math.ceil(value / packSize) * packSize;
}

function normalizeArticleCode(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
}

function getStockArticle(row: StockBalanceRow): string {
    return normalizeArticleCode(row.article ?? row.code ?? row.ARARTN);
}

function getStockQty(row: StockBalanceRow): number {
    const candidates = [row.onhand, row.available, row.qty, row.balance, row.stock];

    for (const value of candidates) {
        const num = Number(value);
        if (Number.isFinite(num)) return num;
    }

    return 0;
}

function getStatus(
    currentStockQty: number,
    forecastLeadTimeQty: number,
    targetStockQty: number
): 'OK' | 'WATCH' | 'ORDER' {
    if (currentStockQty < forecastLeadTimeQty) return 'ORDER';
    if (currentStockQty < targetStockQty) return 'WATCH';
    return 'OK';
}

function parseOptionalNumber(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) return undefined;
    return num;
}

function startOfDay(input: Date) {
    const d = new Date(input);
    d.setHours(0, 0, 0, 0);
    return d;
}

function addDays(input: Date, days: number) {
    const d = new Date(input);
    d.setDate(d.getDate() + days);
    return d;
}

function formatDateShort(input: Date) {
    const year = input.getFullYear();
    const month = String(input.getMonth() + 1).padStart(2, '0');
    const day = String(input.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function daysBetweenDates(from: Date, to: Date) {
    const diffMs = startOfDay(to).getTime() - startOfDay(from).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function getOrderDecisionText(item: AssistantRow, t: (key: string, options?: any) => string) {
    if (item.daysUntilOutOfStock == null || item.latestOrderDate == null) {
        return t('reorderDecisionCannotCalculate');
    }

    if (item.isPastLatestOrderDate) {
        return t('reorderDecisionOrderNowPastDate', { date: item.latestOrderDate });
    }

    if (item.daysUntilLatestOrder === 0) {
        return t('reorderDecisionOrderToday');
    }

    if (item.daysUntilLatestOrder != null && item.daysUntilLatestOrder <= 3) {
        return t('reorderDecisionOrderWithinDays', { days: item.daysUntilLatestOrder });
    }

    return t('reorderDecisionOrderByDate', { date: item.latestOrderDate });
}

function normalizeBooleanLike(value: unknown): boolean {
    if (value === true) return true;
    if (value === false || value == null) return false;
    if (typeof value === 'number') return value === 1;

    const normalized = String(value).trim().toLowerCase();
    return ['1', 'true', 'y', 'yes', 'j', 'ja', 't'].includes(normalized);
}

function isWebshopArticle(articleInfo?: ExtendedArticle): boolean {
    const value =
        articleInfo?.adk_article_webshop ??
        articleInfo?.raw?.data?.adk_article_webshop;

    return normalizeBooleanLike(value);
}

function downloadCsv(filename: string, rows: AssistantRow[]) {
    if (Platform.OS !== 'web') return;

    const header = [
        'Article',
        'Title',
        'Supplier',
        'Supplier Number',
        'Unit',
        'Webshop Article',
        'Total Usage',
        'Per Day',
        'Per Week',
        'Lead Time Days',
        'Safety Days',
        'Custom Lead Time',
        'Auto Lead Time',
        'Custom Safety Days',
        'On Hand',
        'Days Until Out Of Stock',
        'Estimated Out Of Stock Date',
        'Latest Order Date',
        'Lead Time Forecast',
        'Safety',
        'Target',
        'Suggested Order',
        'Rounded Order',
        'Status',
    ];

    const escapeCsv = (value: unknown) => {
        const text = String(value ?? '');
        return `"${text.replace(/"/g, '""')}"`;
    };

    const lines = [
        header.map(escapeCsv).join(','),
        ...rows.map((row) =>
            [
                row.article,
                row.title,
                row.supplier || '',
                row.supplierNumber || '',
                row.unit || '',
                row.isWebshopArticle ? 'true' : 'false',
                row.totalQty,
                row.avgPerDay,
                row.avgPerWeek,
                row.leadTimeDays,
                row.safetyDays,
                row.hasCustomLeadTime ? 'true' : 'false',
                row.hasAutoLeadTime ? 'true' : 'false',
                row.hasCustomSafetyDays ? 'true' : 'false',
                row.currentStockQty,
                row.daysUntilOutOfStock ?? '',
                row.estimatedOutOfStockDate ?? '',
                row.latestOrderDate ?? '',
                row.forecastLeadTimeQty,
                row.safetyQty,
                row.targetStockQty,
                row.suggestedOrderQty,
                row.roundedOrderQty,
                row.status,
            ]
                .map(escapeCsv)
                .join(',')
        ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function buildAssistantRows(
    historyRows: StockHistoryRow[],
    stockRows: StockBalanceRow[],
    articleRows: ExtendedArticle[],
    supplierRows: Supplier[],
    productSettings: ProductSettingsMap,
    autoLeadTimes: AutoLeadTimeMap,
    from: string,
    to: string,
    globalLeadTimeDays: number,
    globalSafetyDays: number,
    packSize: number,
    missingTitleText: string
): AssistantRow[] {
    const days = Math.max(daysBetweenInclusive(from, to), 1);
    const today = startOfDay(new Date());

    const stockMap = new Map<string, StockBalanceRow>();
    for (const row of stockRows) {
        const article = getStockArticle(row);
        if (article) stockMap.set(article, row);
    }

    const articleMap = new Map<string, ExtendedArticle>();
    for (const row of articleRows) {
        const article = normalizeArticleCode(row.ARARTN ?? (row as any).adk_article_number);
        if (article) articleMap.set(article, row);
    }

    const supplierMap = new Map<string, Supplier>();
    for (const row of supplierRows) {
        const supplierNumber = String(row.supplierNumber ?? '').trim();
        if (supplierNumber) supplierMap.set(supplierNumber, row);
    }

    return historyRows
        .map((row) => {
            const article = normalizeArticleCode(row.article);
            const usageUnit = row.unit ? String(row.unit) : undefined;
            const totalQty = Number(row.totalOutQty ?? 0);

            const articleInfo = articleMap.get(article);
            const webshopArticle = isWebshopArticle(articleInfo);
            const title = String(
                articleInfo?.ARNAMN ??
                (articleInfo as any)?.adk_article_name ??
                articleInfo?.raw?.data?.adk_article_name ??
                ''
            ).trim();

            const supplierNumber = String(
                articleInfo?.LEVNR ??
                (articleInfo as any)?.adk_article_supplier_number ??
                articleInfo?.raw?.data?.adk_article_supplier_number ??
                ''
            ).trim();

            const supplierInfo = supplierMap.get(supplierNumber);
            const supplier = String(supplierInfo?.supplierName ?? supplierNumber ?? '').trim();

            const settings = productSettings[article];
            const autoLeadTimeDays = autoLeadTimes[article];
            const hasCustomLeadTime = settings?.leadTimeDays != null;
            const hasAutoLeadTime =
                !hasCustomLeadTime &&
                Number.isFinite(autoLeadTimeDays) &&
                autoLeadTimeDays >= 0;

            const effectiveLeadTimeDays =
                settings?.leadTimeDays ??
                (hasAutoLeadTime ? autoLeadTimeDays : undefined) ??
                globalLeadTimeDays;

            const effectiveSafetyDays = settings?.safetyDays ?? globalSafetyDays;

            const avgPerDay = totalQty / days;
            const avgPerWeek = avgPerDay * 7;
            const forecastLeadTimeQty = avgPerDay * effectiveLeadTimeDays;
            const safetyQty = avgPerDay * effectiveSafetyDays;
            const targetStockQty = forecastLeadTimeQty + safetyQty;

            const stockRow = stockMap.get(article);
            const currentStockQty = stockRow ? getStockQty(stockRow) : 0;

            const suggestedOrderQty = Math.max(0, targetStockQty - currentStockQty);
            const roundedOrderQty = roundUpToPackSize(suggestedOrderQty, packSize);

            let daysUntilOutOfStock: number | null = null;
            let estimatedOutOfStockDate: string | null = null;
            let latestOrderDate: string | null = null;
            let daysUntilLatestOrder: number | null = null;
            let isPastLatestOrderDate = false;

            if (avgPerDay > 0) {
                const rawDaysUntilOutOfStock = Math.max(0, currentStockQty / avgPerDay);
                daysUntilOutOfStock = round2(rawDaysUntilOutOfStock);

                const outOfStockDate = addDays(today, Math.floor(rawDaysUntilOutOfStock));
                estimatedOutOfStockDate = formatDateShort(outOfStockDate);

                const latestOrder = addDays(outOfStockDate, -effectiveLeadTimeDays);
                latestOrderDate = formatDateShort(latestOrder);

                daysUntilLatestOrder = daysBetweenDates(today, latestOrder);
                isPastLatestOrderDate = daysUntilLatestOrder < 0;
            }

            return {
                article,
                title: title || missingTitleText,
                unit:
                    usageUnit ||
                    articleInfo?.ARENHET ||
                    articleInfo?.adk_stock_unit ||
                    articleInfo?.raw?.data?.adk_stock_unit ||
                    undefined,
                supplier: supplier || undefined,
                supplierNumber: supplierNumber || undefined,
                totalQty: round2(totalQty),
                avgPerDay: round2(avgPerDay),
                avgPerWeek: round2(avgPerWeek),
                leadTimeDays: effectiveLeadTimeDays,
                safetyDays: effectiveSafetyDays,
                hasCustomLeadTime,
                hasAutoLeadTime,
                hasCustomSafetyDays: settings?.safetyDays != null,
                forecastLeadTimeQty: round2(forecastLeadTimeQty),
                safetyQty: round2(safetyQty),
                targetStockQty: round2(targetStockQty),
                currentStockQty: round2(currentStockQty),
                suggestedOrderQty: round2(suggestedOrderQty),
                roundedOrderQty: round2(roundedOrderQty),
                status: getStatus(currentStockQty, forecastLeadTimeQty, targetStockQty),
                daysUntilOutOfStock,
                estimatedOutOfStockDate,
                latestOrderDate,
                daysUntilLatestOrder,
                isPastLatestOrderDate,
                isWebshopArticle: webshopArticle,
            };
        })
        .filter((row) => row.article && Number.isFinite(row.totalQty) && row.totalQty > 0);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout after ${ms} ms`)), ms);

        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

async function fetchAutoLeadTimesProgressively(
    articleCodes: string[],
    onBatch: (partial: AutoLeadTimeMap, processed: number, total: number) => void,
    shouldStop: () => boolean
): Promise<void> {
    const uniqueArticles = Array.from(
        new Set(articleCodes.map(normalizeArticleCode).filter(Boolean))
    );

    const batchSize = 10;
    const total = uniqueArticles.length;
    let processed = 0;

    for (let i = 0; i < uniqueArticles.length; i += batchSize) {
        if (shouldStop()) return;

        const batch = uniqueArticles.slice(i, i + batchSize);
        const partial: AutoLeadTimeMap = {};

        const settled = await Promise.allSettled(
            batch.map((article) =>
                withTimeout(
                    getArticleLeadtime(article, {
                        min_valid_days: 0,
                        max_valid_days: 120,
                        max_booking_heads: 10000,
                        max_delivery_heads: 10000,
                    }),
                    65000
                )
            )
        );

        settled.forEach((entry, index) => {
            const article = batch[index];

            if (entry.status !== 'fulfilled') {
                console.warn('[LeadTime] failed for article', article, entry.reason);
                return;
            }

            const suggested = entry.value?.suggested_lead_time_days;
            if (Number.isFinite(suggested) && suggested >= 0) {
                partial[article] = suggested;
            }
        });

        processed += batch.length;
        onBatch(partial, processed, total);
    }
}

export default function ReorderScreen() {
    const { t } = useTranslation();

    const [from, setFrom] = useState(() => {
        const today = new Date();
        const oneYearAgo = new Date(today);
        oneYearAgo.setFullYear(today.getFullYear() - 1);

        const year = oneYearAgo.getFullYear();
        const month = String(oneYearAgo.getMonth() + 1).padStart(2, '0');
        const day = String(oneYearAgo.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });

    const [to, setTo] = useState(() => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });

    const [leadTimeDays, setLeadTimeDays] = useState('14');
    const [safetyDays, setSafetyDays] = useState('7');
    const [packSize, setPackSize] = useState('1');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'OK' | 'WATCH' | 'ORDER'>('ALL');
    const [webshopFilter, setWebshopFilter] = useState<WebshopFilter>('ALL');
    const [sortBy, setSortBy] = useState<SortBy>('article');

    const [loading, setLoading] = useState(false);
    const [loadingLeadTimes, setLoadingLeadTimes] = useState(false);
    const [leadTimeProgress, setLeadTimeProgress] = useState<{ processed: number; total: number }>({
        processed: 0,
        total: 0,
    });
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<StockHistoryResponse | null>(null);
    const [stock, setStock] = useState<StockBalanceResponse | null>(null);
    const [articles, setArticles] = useState<ExtendedArticle[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [productSettings, setProductSettings] = useState<ProductSettingsMap>({});
    const [autoLeadTimes, setAutoLeadTimes] = useState<AutoLeadTimeMap>({});

    const fetchRunRef = useRef(0);

    const reorderRows = useMemo(() => {
        if (!history?.rows?.length) return [];

        const parsedLeadTime = Number(leadTimeDays);
        const parsedSafetyDays = Number(safetyDays);
        const parsedPackSize = Number(packSize);

        return buildAssistantRows(
            history.rows,
            stock?.rows ?? [],
            articles,
            suppliers,
            productSettings,
            autoLeadTimes,
            history.from,
            history.to,
            Number.isFinite(parsedLeadTime) && parsedLeadTime >= 0 ? parsedLeadTime : 14,
            Number.isFinite(parsedSafetyDays) && parsedSafetyDays >= 0 ? parsedSafetyDays : 7,
            Number.isFinite(parsedPackSize) && parsedPackSize > 0 ? parsedPackSize : 1,
            t('missingTitle')
        );
    }, [
        history,
        stock,
        articles,
        suppliers,
        productSettings,
        autoLeadTimes,
        leadTimeDays,
        safetyDays,
        packSize,
        t,
    ]);

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();

        const result = reorderRows.filter((row) => {
            const matchesSearch =
                !q ||
                row.article.toLowerCase().includes(q) ||
                row.title.toLowerCase().includes(q) ||
                (row.supplier || '').toLowerCase().includes(q) ||
                (row.supplierNumber || '').toLowerCase().includes(q);

            const matchesStatus = statusFilter === 'ALL' || row.status === statusFilter;
            const matchesWebshop = webshopFilter === 'ALL' || row.isWebshopArticle;

            return matchesSearch && matchesStatus && matchesWebshop;
        });

        result.sort((a, b) => {
            if (sortBy === 'article') {
                return a.article.localeCompare(b.article, undefined, { numeric: true });
            }

            if (sortBy === 'title') {
                return a.title.localeCompare(b.title, undefined, { numeric: true });
            }

            if (sortBy === 'supplier') {
                return (a.supplier || a.supplierNumber || '').localeCompare(
                    b.supplier || b.supplierNumber || '',
                    undefined,
                    { numeric: true }
                );
            }

            return (
                b.roundedOrderQty - a.roundedOrderQty ||
                a.article.localeCompare(b.article, undefined, { numeric: true })
            );
        });

        return result;
    }, [reorderRows, search, statusFilter, webshopFilter, sortBy]);

    const handleFetch = async () => {
        const runId = Date.now();
        fetchRunRef.current = runId;

        try {
            setError(null);

            if (!isValidDateString(from) || !isValidDateString(to)) {
                setError(t('dateFormatError'));
                return;
            }

            const parsedLeadTime = Number(leadTimeDays);
            const parsedSafetyDays = Number(safetyDays);
            const parsedPackSize = Number(packSize);

            if (!Number.isFinite(parsedLeadTime) || parsedLeadTime < 0) {
                setError(t('leadTimeError'));
                return;
            }

            if (!Number.isFinite(parsedSafetyDays) || parsedSafetyDays < 0) {
                setError(t('safetyError'));
                return;
            }

            if (!Number.isFinite(parsedPackSize) || parsedPackSize <= 0) {
                setError(t('packSizeError'));
                return;
            }

            const fromDate = new Date(`${from}T00:00:00`);
            const toDate = new Date(`${to}T00:00:00`);
            if (fromDate.getTime() > toDate.getTime()) {
                setError(t('fromBeforeTo'));
                return;
            }

            setLoading(true);
            setLoadingLeadTimes(false);
            setLeadTimeProgress({ processed: 0, total: 0 });
            setHistory(null);
            setStock(null);
            setArticles([]);
            setSuppliers([]);
            setAutoLeadTimes({});

            console.log('[Reorder] login start');
            await login('jens@aveo.se', 'jens2020!');
            console.log('[Reorder] login done');

            console.log('[Reorder] stock history start');
            const historyData = await fetchOrderAssistStockHistory({ from, to });
            console.log('[Reorder] stock history done');

            console.log('[Reorder] visma articles start');
            const articleData = await fetchVismaArticles();
            console.log('[Reorder] visma articles done');

            console.log('[Reorder] suppliers start');
            const supplierData = await fetchSuppliers();
            console.log('[Reorder] suppliers done');

            if (fetchRunRef.current !== runId) return;

            setHistory(historyData ?? null);
            setArticles(Array.isArray(articleData) ? (articleData as ExtendedArticle[]) : []);
            setSuppliers(Array.isArray(supplierData) ? supplierData : []);

            const articleCodes = (historyData?.rows ?? [])
                .map((row) => normalizeArticleCode(row.article))
                .filter(Boolean);

            const uniqueArticles = Array.from(new Set(articleCodes));

            if (!uniqueArticles.length) {
                setStock({ rows: [] });
                setLoading(false);
                return;
            }

            console.log('[Reorder] stock balance start');
            const stockData = await fetchStockBalance({
                articles: uniqueArticles,
                mode: 'onhand',
            });
            console.log('[Reorder] stock balance done');

            if (fetchRunRef.current !== runId) return;

            setStock(stockData ?? { rows: [] });

            // Visa listan direkt när grunddatan är klar
            setLoading(false);

            // Hämta ledtider stegvis i bakgrunden
            setLoadingLeadTimes(true);
            setLeadTimeProgress({ processed: 0, total: uniqueArticles.length });

            fetchAutoLeadTimesProgressively(
                uniqueArticles,
                (partial, processed, total) => {
                    if (fetchRunRef.current !== runId) return;

                    setAutoLeadTimes((prev) => ({
                        ...prev,
                        ...partial,
                    }));
                    setLeadTimeProgress({ processed, total });
                },
                () => fetchRunRef.current !== runId
            )
                .catch((err) => {
                    console.warn('[Reorder] leadtimes failed', err);
                })
                .finally(() => {
                    if (fetchRunRef.current !== runId) return;
                    setLoadingLeadTimes(false);
                });
        } catch (err: any) {
            if (fetchRunRef.current !== runId) return;
            setError(err?.message || t('fetchError'));
            setLoadingLeadTimes(false);
            setLoading(false);
        }
    };

    const updateProductSetting = (
        article: string,
        field: 'leadTimeDays' | 'safetyDays',
        rawValue: string
    ) => {
        const parsed = parseOptionalNumber(rawValue);

        setProductSettings((prev) => {
            const current = prev[article] || {};
            const nextForArticle = {
                ...current,
                [field]: parsed,
            };

            if (nextForArticle.leadTimeDays == null && nextForArticle.safetyDays == null) {
                const copy = { ...prev };
                delete copy[article];
                return copy;
            }

            return {
                ...prev,
                [article]: nextForArticle,
            };
        });
    };

    const clearProductSettings = (article: string) => {
        setProductSettings((prev) => {
            const copy = { ...prev };
            delete copy[article];
            return copy;
        });
    };

    const renderHeader = () => (
        <>
            <Text style={styles.sortTitleLabel}>{t('reorderAssistant')}</Text>
            <Text style={styles.meta}>
                {t('environment')}: {APP_ENV}
            </Text>
            <Text style={styles.meta}>
                {t('api')}: {API_ROOT}
            </Text>

            <View style={styles.filtersCompact}>
                <View style={styles.row}>
                    <View style={styles.fieldHalf}>
                        <Text style={styles.label}>{t('from')}</Text>
                        <TextInput
                            value={from}
                            onChangeText={setFrom}
                            placeholder="YYYY-MM-DD"
                            style={styles.inputCompact}
                        />
                    </View>
                    <View style={styles.fieldHalf}>
                        <Text style={styles.label}>{t('to')}</Text>
                        <TextInput
                            value={to}
                            onChangeText={setTo}
                            placeholder="YYYY-MM-DD"
                            style={styles.inputCompact}
                        />
                    </View>
                </View>

                <View style={styles.row}>
                    <View style={styles.fieldThird}>
                        <Text style={styles.label}>{t('leadTimeDays')}</Text>
                        <TextInput
                            value={leadTimeDays}
                            onChangeText={setLeadTimeDays}
                            keyboardType="numeric"
                            style={styles.inputCompact}
                        />
                    </View>
                    <View style={styles.fieldThird}>
                        <Text style={styles.label}>{t('safetyStockDays')}</Text>
                        <TextInput
                            value={safetyDays}
                            onChangeText={setSafetyDays}
                            keyboardType="numeric"
                            style={styles.inputCompact}
                        />
                    </View>
                    <View style={styles.fieldThird}>
                        <Text style={styles.label}>{t('packSize')}</Text>
                        <TextInput
                            value={packSize}
                            onChangeText={setPackSize}
                            keyboardType="numeric"
                            style={styles.inputCompact}
                        />
                    </View>
                </View>

                <View style={styles.row}>
                    <View style={styles.fieldHalf}>
                        <Text style={styles.label}>{t('search')}</Text>
                        <TextInput
                            value={search}
                            onChangeText={setSearch}
                            placeholder={t('searchPlaceholder')}
                            style={styles.inputCompact}
                        />
                    </View>
                    <View style={styles.fieldHalf}>
                        <Text style={styles.label}>{t('sortBy')}</Text>
                        <View style={styles.sortRow}>
                            <TouchableOpacity
                                style={[styles.filterChip, sortBy === 'article' && styles.filterChipActive]}
                                onPress={() => setSortBy('article')}
                            >
                                <Text
                                    style={[
                                        styles.filterChipText,
                                        sortBy === 'article' && styles.filterChipTextActive,
                                    ]}
                                >
                                    {t('article')}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.filterChip, sortBy === 'title' && styles.filterChipActive]}
                                onPress={() => setSortBy('title')}
                            >
                                <Text
                                    style={[
                                        styles.filterChipText,
                                        sortBy === 'title' && styles.filterChipTextActive,
                                    ]}
                                >
                                    {t('title')}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.filterChip, sortBy === 'supplier' && styles.filterChipActive]}
                                onPress={() => setSortBy('supplier')}
                            >
                                <Text
                                    style={[
                                        styles.filterChipText,
                                        sortBy === 'supplier' && styles.filterChipTextActive,
                                    ]}
                                >
                                    {t('supplier')}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.filterChip,
                                    sortBy === 'roundedOrderQty' && styles.filterChipActive,
                                ]}
                                onPress={() => setSortBy('roundedOrderQty')}
                            >
                                <Text
                                    style={[
                                        styles.filterChipText,
                                        sortBy === 'roundedOrderQty' && styles.filterChipTextActive,
                                    ]}
                                >
                                    {t('suggested')}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                <View style={styles.statusRow}>
                    {(['ALL', 'OK', 'WATCH', 'ORDER'] as const).map((value) => (
                        <TouchableOpacity
                            key={value}
                            style={[styles.filterChip, statusFilter === value && styles.filterChipActive]}
                            onPress={() => setStatusFilter(value)}
                        >
                            <Text
                                style={[
                                    styles.filterChipText,
                                    statusFilter === value && styles.filterChipTextActive,
                                ]}
                            >
                                {value}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={styles.statusRow}>
                    <TouchableOpacity
                        style={[styles.filterChip, webshopFilter === 'ALL' && styles.filterChipActive]}
                        onPress={() => setWebshopFilter('ALL')}
                    >
                        <Text
                            style={[
                                styles.filterChipText,
                                webshopFilter === 'ALL' && styles.filterChipTextActive,
                            ]}
                        >
                            {t('allArticles')}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.filterChip,
                            webshopFilter === 'WEBSHOP_ONLY' && styles.filterChipActive,
                        ]}
                        onPress={() => setWebshopFilter('WEBSHOP_ONLY')}
                    >
                        <Text
                            style={[
                                styles.filterChipText,
                                webshopFilter === 'WEBSHOP_ONLY' && styles.filterChipTextActive,
                            ]}
                        >
                            {t('webshopOnly')}
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.actionRow}>
                    <TouchableOpacity
                        style={styles.buttonPrimary}
                        onPress={handleFetch}
                        disabled={loading}
                    >
                        <Text style={styles.buttonText}>
                            {loading ? t('loading') : t('calculate')}
                        </Text>
                    </TouchableOpacity>

                    {Platform.OS === 'web' && filteredRows.length > 0 ? (
                        <TouchableOpacity
                            style={styles.buttonSecondary}
                            onPress={() => downloadCsv(`reorder-${from}-to-${to}.csv`, filteredRows)}
                        >
                            <Text style={styles.buttonSecondaryText}>{t('exportCsv')}</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null}

            {!loading && loadingLeadTimes ? (
                <Text style={styles.infoText}>
                    {t('fetchingLeadTimes')} {leadTimeProgress.processed}/{leadTimeProgress.total}
                </Text>
            ) : null}

            {history && !loading ? (
                <View style={styles.summaryCompact}>
                    <Text style={styles.summaryText}>
                        {t('period')}: {history.from} → {history.to}
                    </Text>
                    <Text style={styles.summaryText}>
                        {t('articles')}: {filteredRows.length}/{reorderRows.length}
                    </Text>
                    <Text style={styles.summaryText}>
                        {t('documents')}: {history.debug?.matched_docs ?? 0}
                    </Text>
                    <Text style={styles.summaryText}>
                        {t('rows')}: {history.debug?.matched_rows ?? 0}
                    </Text>
                </View>
            ) : null}
        </>
    );

    return (
        <ScreenContainer>
            <FlatList
                data={filteredRows}
                keyExtractor={(item) => item.article}
                ListHeaderComponent={renderHeader}
                ListEmptyComponent={
                    !loading && history ? <Text style={styles.empty}>{t('noData')}</Text> : null
                }
                renderItem={({ item }) => {
                    const custom = productSettings[item.article];

                    return (
                        <View style={styles.cardCompact}>
                            <View style={styles.cardTopRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.code}>{item.article}</Text>
                                    <Text style={styles.titleText}>{item.title}</Text>
                                    {item.supplier ? (
                                        <Text style={styles.supplierText}>{item.supplier}</Text>
                                    ) : item.supplierNumber ? (
                                        <Text style={styles.supplierText}>{item.supplierNumber}</Text>
                                    ) : null}
                                    {item.isWebshopArticle ? (
                                        <Text style={styles.webshopText}>{t('webshopArticle')}</Text>
                                    ) : null}
                                </View>

                                <Text
                                    style={[
                                        styles.badge,
                                        item.status === 'ORDER'
                                            ? styles.badgeHigh
                                            : item.status === 'WATCH'
                                                ? styles.badgeMedium
                                                : styles.badgeLow,
                                    ]}
                                >
                                    {item.status}
                                </Text>
                            </View>

                            <View
                                style={[
                                    styles.decisionBox,
                                    item.isPastLatestOrderDate
                                        ? styles.decisionDanger
                                        : item.daysUntilLatestOrder != null && item.daysUntilLatestOrder <= 3
                                            ? styles.decisionWarning
                                            : styles.decisionNeutral,
                                ]}
                            >
                                <Text style={styles.decisionTitle}>{t('orderingDecision')}</Text>

                                <Text style={styles.decisionText}>{getOrderDecisionText(item, t)}</Text>

                                {item.estimatedOutOfStockDate ? (
                                    <Text style={styles.decisionLine}>
                                        {t('estimatedOutOfStock')}:{' '}
                                        <Text style={styles.decisionStrong}>{item.estimatedOutOfStockDate}</Text>
                                    </Text>
                                ) : (
                                    <Text style={styles.decisionLine}>
                                        {t('estimatedOutOfStock')}:{' '}
                                        <Text style={styles.decisionStrong}>{t('cannotCalculate')}</Text>
                                    </Text>
                                )}

                                {item.latestOrderDate ? (
                                    <Text
                                        style={[
                                            styles.decisionLine,
                                            item.isPastLatestOrderDate && styles.decisionLineDanger,
                                        ]}
                                    >
                                        {t('orderBy')}:{' '}
                                        <Text style={styles.decisionStrong}>{item.latestOrderDate}</Text>
                                    </Text>
                                ) : null}

                                {item.daysUntilOutOfStock != null ? (
                                    <Text style={styles.decisionLine}>
                                        {t('stockLastsAboutDays')}:{' '}
                                        <Text style={styles.decisionStrong}>{item.daysUntilOutOfStock}</Text>
                                    </Text>
                                ) : null}

                                <Text style={styles.decisionLine}>
                                    {t('suggestedOrder')}:{' '}
                                    <Text style={styles.decisionStrong}>
                                        {item.suggestedOrderQty} {item.unit || ''}
                                    </Text>
                                </Text>
                                <Text style={styles.decisionLine}>
                                    {t('roundedOrder')}:{' '}
                                    <Text style={styles.decisionStrong}>
                                        {item.roundedOrderQty} {item.unit || ''}
                                    </Text>
                                </Text>
                            </View>

                            <View style={styles.metricsRow}>
                                <Text style={styles.metric}>
                                    {t('onHand')}: {item.currentStockQty} {item.unit || ''}
                                </Text>
                                <Text style={styles.metric}>
                                    {t('perDay')}: {item.avgPerDay} {item.unit || ''}
                                </Text>
                                <Text style={styles.metric}>
                                    {t('perWeek')}: {item.avgPerWeek} {item.unit || ''}
                                </Text>
                            </View>

                            <View style={styles.inlineEditorRow}>
                                <View style={styles.inlineEditorField}>
                                    <Text style={styles.labelSmall}>{t('leadTimeDays')}</Text>
                                    <TextInput
                                        value={custom?.leadTimeDays != null ? String(custom.leadTimeDays) : ''}
                                        onChangeText={(value) =>
                                            updateProductSetting(item.article, 'leadTimeDays', value)
                                        }
                                        placeholder={String(
                                            autoLeadTimes[item.article] ?? (Number(leadTimeDays) || 14)
                                        )}
                                        keyboardType="numeric"
                                        style={styles.inputMini}
                                    />
                                </View>

                                <View style={styles.inlineEditorField}>
                                    <Text style={styles.labelSmall}>{t('safetyStockDays')}</Text>
                                    <TextInput
                                        value={custom?.safetyDays != null ? String(custom.safetyDays) : ''}
                                        onChangeText={(value) =>
                                            updateProductSetting(item.article, 'safetyDays', value)
                                        }
                                        placeholder={String(Number(safetyDays) || 7)}
                                        keyboardType="numeric"
                                        style={styles.inputMini}
                                    />
                                </View>

                                <TouchableOpacity
                                    style={styles.resetButton}
                                    onPress={() => clearProductSettings(item.article)}
                                >
                                    <Text style={styles.resetButtonText}>{t('reset')}</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.metricsRow}>
                                <Text style={styles.metric}>
                                    {t('leadTime')}: {item.leadTimeDays} {t('days')}
                                    {item.hasCustomLeadTime
                                        ? ` (${t('custom')})`
                                        : item.hasAutoLeadTime
                                            ? ` (${t('auto')})`
                                            : ''}
                                </Text>
                                <Text style={styles.metric}>
                                    {t('safety')}: {item.safetyDays} {t('days')}
                                    {item.hasCustomSafetyDays ? ` (${t('custom')})` : ''}
                                </Text>
                            </View>

                            <View style={styles.metricsRow}>
                                <Text style={styles.metricMuted}>
                                    {t('leadTimeBasis')}: {item.forecastLeadTimeQty} {item.unit || ''}
                                </Text>
                                <Text style={styles.metricMuted}>
                                    {t('safetyBasis')}: {item.safetyQty} {item.unit || ''}
                                </Text>
                                <Text style={styles.metricMuted}>
                                    {t('targetLevel')}: {item.targetStockQty} {item.unit || ''}
                                </Text>
                            </View>
                        </View>
                    );
                }}
                contentContainerStyle={styles.listContent}
            />
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    listContent: {
        paddingBottom: 32,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 6,
    },
    meta: {
        fontSize: 11,
        color: '#666',
        marginBottom: 2,
        marginLeft: 10,
    },
    filtersCompact: {
        marginTop: 10,
        marginBottom: 10,
        padding: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        backgroundColor: '#fff',
    },
    row: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
    },
    fieldHalf: {
        flex: 1,
    },
    fieldThird: {
        flex: 1,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 4,
    },
    labelSmall: {
        fontSize: 11,
        fontWeight: '600',
        marginBottom: 4,
        color: '#555',
    },
    inputCompact: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 8,
        backgroundColor: '#fff',
        fontSize: 13,
    },
    inputMini: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
        backgroundColor: '#fff',
        fontSize: 12,
    },
    sortRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    statusRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 8,
    },
    filterChip: {
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#ccc',
        backgroundColor: '#fff',
    },
    filterChipActive: {
        backgroundColor: '#1976d2',
        borderColor: '#1976d2',
    },
    filterChipText: {
        fontSize: 12,
        color: '#333',
        fontWeight: '600',
    },
    filterChipTextActive: {
        color: '#fff',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 8,
    },
    buttonPrimary: {
        flex: 1,
        backgroundColor: '#1976d2',
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    buttonSecondary: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#1976d2',
        backgroundColor: '#fff',
    },
    buttonText: {
        color: '#fff',
        fontWeight: '700',
    },
    buttonSecondaryText: {
        color: '#1976d2',
        fontWeight: '700',
    },
    summaryCompact: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 10,
    },
    summaryText: {
        fontSize: 12,
        color: '#444',
    },
    infoText: {
        fontSize: 12,
        color: '#666',
        marginBottom: 10,
    },
    error: {
        color: '#b71c1c',
        marginBottom: 10,
    },
    empty: {
        color: '#666',
        marginTop: 8,
    },
    cardCompact: {
        padding: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        marginBottom: 8,
        backgroundColor: '#fff',
    },
    cardTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        marginBottom: 6,
    },
    code: {
        fontWeight: '700',
        fontSize: 14,
    },
    titleText: {
        fontSize: 13,
        color: '#222',
    },
    supplierText: {
        fontSize: 11,
        color: '#666',
        marginTop: 2,
    },
    webshopText: {
        fontSize: 11,
        color: '#1976d2',
        marginTop: 4,
        fontWeight: '600',
    },
    decisionBox: {
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
        borderWidth: 1,
    },
    decisionNeutral: {
        backgroundColor: '#f7f9fc',
        borderColor: '#d7e1f0',
    },
    decisionWarning: {
        backgroundColor: '#fff8e1',
        borderColor: '#f0c36d',
    },
    decisionDanger: {
        backgroundColor: '#ffebee',
        borderColor: '#e49ca7',
    },
    decisionTitle: {
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 6,
        color: '#111',
    },
    decisionText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#111',
        marginBottom: 6,
    },
    decisionLine: {
        fontSize: 12,
        color: '#333',
        marginBottom: 3,
    },
    decisionLineDanger: {
        color: '#b71c1c',
        fontWeight: '700',
    },
    decisionStrong: {
        fontWeight: '700',
    },
    metricsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginBottom: 4,
    },
    inlineEditorRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        marginTop: 6,
        marginBottom: 6,
    },
    inlineEditorField: {
        flex: 1,
    },
    resetButton: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#bbb',
        borderRadius: 6,
        backgroundColor: '#fff',
    },
    resetButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#444',
    },
    metric: {
        fontSize: 12,
        color: '#333',
    },
    metricMuted: {
        fontSize: 12,
        color: '#666',
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        overflow: 'hidden',
        fontSize: 11,
        fontWeight: '700',
    },
    badgeLow: {
        backgroundColor: '#e8f5e9',
        color: '#1b5e20',
    },
    badgeMedium: {
        backgroundColor: '#fff8e1',
        color: '#e65100',
    },
    badgeHigh: {
        backgroundColor: '#ffebee',
        color: '#b71c1c',
    },
    sortTitleLabel: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 6,
        marginLeft: 10,
    },
});