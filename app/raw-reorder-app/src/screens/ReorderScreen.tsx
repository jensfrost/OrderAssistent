import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { useI18n } from '../hooks/useI18n';
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
import {
    fetchRecentPurchases,
    type RecentPurchaseItem,
} from '../api/recentPurchases';
import {
    fetchMatchingIncomingDeliveries,
    type RecentIncomingDeliveryItem,
} from '../api/recentIncomingDeliveries';

type ExtendedArticle = VismaArticle & {
    adk_article_webshop?: boolean | null;
    adk_stock_unit?: string | null;
    raw?: {
        data?: {
            adk_article_webshop?: boolean | string | number | null;
            adk_stock_unit?: string | null;
            adk_article_name?: string | null;
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
        packSize?: number;
    }
>;

type AutoLeadTimeMap = Record<string, number>;
type WebshopFilter = 'ALL' | 'WEBSHOP_ONLY';
type StatusFilterValue = 'OK' | 'WATCH' | 'ORDER';
type SupplierFilterOption = {
    value: string;
    label: string;
};
type ResolvedArticleMap = Record<string, true>;
type LoadingArticleMap = Record<string, boolean>;
type ErrorByArticleMap = Record<string, string>;
type RecentIncomingDebugMap = Record<
    string,
    {
        source?: string;
        rowKeys?: string[];
        debug?: Record<string, unknown>;
        error?: string;
    }
>;

type AssistantRow = {
    article: string;
    title: string;
    unit?: string;
    supplier?: string;
    supplierNumber?: string;
    totalQty: number;
    avgPerDay: number;
    avgPerWeek: number;
    avgPerMonth: number;
    avgPerQuarter: number;
    avgPerYear: number;
    leadTimeDays: number;
    safetyDays: number;
    packSize: number;
    hasCustomLeadTime: boolean;
    hasAutoLeadTime: boolean;
    hasCustomSafetyDays: boolean;
    hasCustomPackSize: boolean;
    forecastLeadTimeQty: number;
    safetyQty: number;
    targetStockQty: number;
    currentStockQty: number;
    suggestedOrderQty: number;
    roundedOrderQty: number;
    status: StatusFilterValue;
    daysUntilOutOfStock: number | null;
    estimatedOutOfStockDate: string | null;
    latestOrderDate: string | null;
    daysUntilLatestOrder: number | null;
    isPastLatestOrderDate: boolean;
    isWebshopArticle: boolean;
};

type SortBy = 'article' | 'title' | 'supplier' | 'roundedOrderQty';

type LeadTimeFetchSettings = {
    minValidDays: number;
    maxValidDays: number;
    maxBookingHeads: number;
    maxDeliveryHeads: number;
    timeoutMs: number;
};

const MATCHING_DELIVERY_SEARCH_WINDOW_DAYS = 30;
const REORDER_ASSIST_SETTINGS_STORAGE_KEY = 'reorderAssistScreenSettings:v1';

type ReorderAssistPersistedSettings = {
    from?: string;
    to?: string;
    leadTimeDays?: string;
    safetyDays?: string;
    packSize?: string;
    minValidDays?: string;
    maxValidDays?: string;
    maxBookingHeads?: string;
    maxDeliveryHeads?: string;
    leadTimeTimeoutMs?: string;
    showAdvancedLeadtime?: boolean;
    search?: string;
    searchTerms?: string[];
    statusFilter?: 'ALL' | StatusFilterValue | StatusFilterValue[];
    selectedSuppliers?: string[];
    webshopFilter?: WebshopFilter;
    sortBy?: SortBy;
    productSettings?: ProductSettingsMap;
};

type TranslateFn = (key: string, options?: any) => string;
type HelpTopic = 'overview' | 'leadTime' | 'safetyDays' | 'packSize' | 'decision' | 'history' | 'search';
type HelpContent = {
    title: string;
    sections: Array<{
        title: string;
        lines: string[];
    }>;
};

function HelpIconButton({ onPress }: { onPress: () => void }) {
    return (
        <TouchableOpacity style={styles.helpIconButton} onPress={onPress}>
            <Text style={styles.helpIconText}>i</Text>
        </TouchableOpacity>
    );
}

function LabelWithHelp({
    label,
    onPress,
}: {
    label: string;
    onPress: () => void;
}) {
    return (
        <View style={styles.labelRow}>
            <Text style={styles.labelInline}>{label}</Text>
            <HelpIconButton onPress={onPress} />
        </View>
    );
}

function ActiveFilterChip({
    label,
    onRemove,
}: {
    label: string;
    onRemove: () => void;
}) {
    return (
        <View style={styles.activeFilterChip}>
            <Text style={styles.activeFilterChipText}>{label}</Text>
            <TouchableOpacity style={styles.activeFilterChipRemove} onPress={onRemove}>
                <Text style={styles.activeFilterChipRemoveText}>x</Text>
            </TouchableOpacity>
        </View>
    );
}

function buildHelpContent(topic: HelpTopic, t: TranslateFn): HelpContent {
    switch (topic) {
        case 'leadTime':
            return {
                title: t('reorderAssist.leadTime'),
                sections: [
                    {
                        title: t('reorderAssist.helpSectionDefaults'),
                        lines: [
                            t('reorderAssist.help.defaultLeadTime'),
                            t('reorderAssist.help.leadTimeFetch'),
                        ],
                    },
                ],
            };
        case 'safetyDays':
            return {
                title: t('reorderAssist.safetyDays'),
                sections: [
                    {
                        title: t('reorderAssist.helpSectionDefaults'),
                        lines: [t('reorderAssist.help.defaultSafetyDays')],
                    },
                ],
            };
        case 'packSize':
            return {
                title: t('raw.field.quantity'),
                sections: [
                    {
                        title: t('reorderAssist.helpSectionDefaults'),
                        lines: [t('reorderAssist.help.packSize')],
                    },
                ],
            };
        case 'decision':
            return {
                title: t('orderingDecision'),
                sections: [
                    {
                        title: t('reorderAssist.helpSectionDecision'),
                        lines: [
                            t('reorderAssist.help.decision'),
                            t('reorderAssist.help.formulas'),
                            `${t('reorderAssist.stock')}: ${t('reorderAssist.help.stock')}`,
                            `${t('reorderAssist.dailyUsage')}: ${t('reorderAssist.help.dailyUsage')}`,
                        ],
                    },
                ],
            };
        case 'history':
            return {
                title: t('reorderAssist.latestOrdersAndDeliveries'),
                sections: [
                    {
                        title: t('reorderAssist.helpSectionHistory'),
                        lines: [t('reorderAssist.help.history')],
                    },
                ],
            };
        case 'search':
            return {
                title: t('common.searchShort'),
                sections: [
                    {
                        title: t('common.searchShort'),
                        lines: [
                            t('reorderAssist.help.search'),
                            t('reorderAssist.help.searchChips'),
                        ],
                    },
                ],
            };
        case 'overview':
        default:
            return {
                title: t('reorderAssist.helpOverviewTitle'),
                sections: [
                    {
                        title: t('reorderAssist.helpSectionBasics'),
                        lines: [
                            t('reorderAssist.help.page'),
                            `${t('reorderAssist.dateFrom')}: ${t('reorderAssist.help.dateFrom')}`,
                            `${t('reorderAssist.dateTo')}: ${t('reorderAssist.help.dateTo')}`,
                        ],
                    },
                    {
                        title: t('reorderAssist.helpSectionDefaults'),
                        lines: [
                            `${t('reorderAssist.leadTime')}: ${t('reorderAssist.help.defaultLeadTime')}`,
                            `${t('reorderAssist.safetyDays')}: ${t('reorderAssist.help.defaultSafetyDays')}`,
                            `${t('raw.field.quantity')}: ${t('reorderAssist.help.packSize')}`,
                        ],
                    },
                    {
                        title: t('reorderAssist.helpSectionLeadTimeFetch'),
                        lines: [t('reorderAssist.help.leadTimeFetch')],
                    },
                    {
                        title: t('reorderAssist.helpSectionDecision'),
                        lines: [
                            t('reorderAssist.help.decision'),
                            t('reorderAssist.help.formulas'),
                        ],
                    },
                    {
                        title: t('reorderAssist.helpSectionHistory'),
                        lines: [t('reorderAssist.help.history')],
                    },
                ],
            };
    }
}

function log(...args: any[]) {
    console.log('[ReorderScreen]', ...args);
}

function warn(...args: any[]) {
    console.warn('[ReorderScreen]', ...args);
}

function isValidDateString(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDateString(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseDateString(value: string) {
    if (!isValidDateString(value)) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function adjustNumericString(value: string, delta: number, minValue: number) {
    const parsed = Number(value);
    const base = Number.isFinite(parsed) ? parsed : minValue;
    return String(Math.max(minValue, base + delta));
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

function normalizeDocNo(value: unknown): string {
    if (value == null) return '';

    const raw = String(value).trim();
    if (!raw) return '';

    const numeric = Number(raw.replace(',', '.'));
    if (Number.isFinite(numeric)) {
        return String(Math.trunc(numeric));
    }

    const digits = raw.replace(/\D+/g, '');
    if (!digits) return '';

    return digits.replace(/^0+/, '') || '0';
}

function getIncomingDeliveryOrderKeys(entry: RecentIncomingDeliveryItem): string[] {
    const candidates = [
        (entry as any).bestnr,
        (entry as any).orderDocumentNumber,
        (entry as any).orderNo,
        (entry as any).purchaseOrderNumber,
        (entry as any).bookingDocumentNumber,
        (entry as any).referenceDocumentNumber,
        (entry as any).referenceNo,
    ];

    return Array.from(new Set(candidates.map(normalizeDocNo).filter(Boolean)));
}

function getPurchaseOrderKey(entry: RecentPurchaseItem): string {
    return normalizeDocNo(
        (entry as any).orderDocumentNumber ??
        (entry as any).bestnr ??
        (entry as any).orderNo ??
        (entry as any).purchaseOrderNumber
    );
}

function getIncomingRequestKey(article: string, bestnr: string): string {
    return `${normalizeArticleCode(article)}::${normalizeDocNo(bestnr)}`;
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

function chunkArray<T>(items: T[], size: number): T[][] {
    if (!items.length || size <= 0) return [];

    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

function mergeStockBalanceResponses(
    current: StockBalanceResponse | null,
    incoming: StockBalanceResponse | null | undefined
): StockBalanceResponse {
    const merged = new Map<string, StockBalanceRow>();
    const extras: StockBalanceRow[] = [];

    for (const row of current?.rows ?? []) {
        const article = getStockArticle(row);
        if (article) {
            merged.set(article, row);
        } else {
            extras.push(row);
        }
    }

    for (const row of incoming?.rows ?? []) {
        const article = getStockArticle(row);
        if (article) {
            merged.set(article, row);
        } else {
            extras.push(row);
        }
    }

    return {
        ...(current ?? {}),
        ...(incoming ?? {}),
        rows: [...extras, ...Array.from(merged.values())],
    };
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

function parsePositiveNumberWithFallback(value: string, fallback: number) {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : fallback;
}

function parseNonNegativeNumberWithFallback(value: string, fallback: number) {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? num : fallback;
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
    if (typeof value === 'number') return value !== 0;

    const normalized = String(value).trim().toLowerCase();
    return ['1', '-1', 'true', 'y', 'yes', 'j', 'ja', 't', 'x'].includes(normalized);
}

function normalizeSearchText(value: unknown): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function mergeSearchTerms(existing: string[], incoming: string[]): string[] {
    const next: string[] = [];
    const seen = new Set<string>();

    const push = (value: unknown) => {
        const raw = String(value ?? '').trim();
        const normalized = normalizeSearchText(raw);
        if (!normalized || seen.has(normalized)) return;

        seen.add(normalized);
        next.push(raw);
    };

    existing.forEach(push);
    incoming.forEach(push);

    return next;
}

function splitCommittedSearchInput(value: string): { completedTerms: string[]; remainder: string } {
    const raw = String(value ?? '');
    if (!/[,\n;]/.test(raw)) {
        return {
            completedTerms: [],
            remainder: raw,
        };
    }

    const parts = raw.split(/[\n,;]+/);
    const endsWithDelimiter = /[,\n;]\s*$/.test(raw);
    const completedTerms = (endsWithDelimiter ? parts : parts.slice(0, -1))
        .map((part) => part.trim())
        .filter(Boolean);
    const remainder = endsWithDelimiter ? '' : String(parts[parts.length - 1] ?? '').trimStart();

    return {
        completedTerms,
        remainder,
    };
}

function normalizeSupplierNumber(value: unknown): string {
    const raw = String(value ?? '').trim().toUpperCase();
    if (!raw) return '';

    const numericCandidate = raw.replace(',', '.');
    if (/^\d+(?:\.0+)?$/.test(numericCandidate)) {
        const numericValue = Number(numericCandidate);
        if (Number.isFinite(numericValue)) {
            return String(Math.trunc(numericValue));
        }
    }

    return raw;
}

function isWebshopArticle(articleInfo?: ExtendedArticle): boolean {
    const value =
        articleInfo?.adk_article_webshop ??
        articleInfo?.raw?.data?.adk_article_webshop;

    return normalizeBooleanLike(value);
}

function getSupplierFilterValue(item: Pick<AssistantRow, 'supplier' | 'supplierNumber'>): string {
    return normalizeSupplierNumber(item.supplierNumber);
}

function getSupplierFilterLabel(item: Pick<AssistantRow, 'supplier' | 'supplierNumber'>): string {
    const supplierName = String(item.supplier ?? '').trim();
    const supplierNumber = String(item.supplierNumber ?? '').trim();

    if (supplierName && supplierNumber && supplierName !== supplierNumber) {
        return `${supplierName} (${supplierNumber})`;
    }

    return supplierName || supplierNumber;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        'Per Month',
        'Per Quarter',
        'Per Year',
        'Lead Time Days',
        'Safety Days',
        'Pack Size',
        'Custom Lead Time',
        'Auto Lead Time',
        'Custom Safety Days',
        'Custom Pack Size',
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
                row.avgPerMonth,
                row.avgPerQuarter,
                row.avgPerYear,
                row.leadTimeDays,
                row.safetyDays,
                row.packSize,
                row.hasCustomLeadTime ? 'true' : 'false',
                row.hasAutoLeadTime ? 'true' : 'false',
                row.hasCustomSafetyDays ? 'true' : 'false',
                row.hasCustomPackSize ? 'true' : 'false',
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
    globalPackSize: number
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
        const article = normalizeArticleCode((row as any).adk_article_number ?? row.ARARTN);
        if (article) articleMap.set(article, row);
    }

    const supplierMap = new Map<string, Supplier>();
    for (const row of supplierRows) {
        const supplierNumber = normalizeSupplierNumber(row.supplierNumber);
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
                (articleInfo as any)?.adk_article_name ??
                articleInfo?.raw?.data?.adk_article_name ??
                ''
            ).trim();

            const supplierNumberRaw = String(
                row.supplierNumber ??
                (articleInfo as any)?.adk_article_supplier_number ??
                articleInfo?.raw?.data?.adk_article_supplier_number ??
                articleInfo?.LEVNR ??
                ''
            ).trim();
            const supplierNumber = normalizeSupplierNumber(supplierNumberRaw);

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
            const effectivePackSize = settings?.packSize ?? globalPackSize;

            const avgPerDay = totalQty / days;
            const avgPerWeek = avgPerDay * 7;
            const avgPerMonth = avgPerDay * 30;
            const avgPerQuarter = avgPerDay * 90;
            const avgPerYear = avgPerDay * 365;
            const forecastLeadTimeQty = avgPerDay * effectiveLeadTimeDays;
            const safetyQty = avgPerDay * effectiveSafetyDays;
            const targetStockQty = forecastLeadTimeQty + safetyQty;

            const stockRow = stockMap.get(article);
            const currentStockQty = stockRow ? getStockQty(stockRow) : 0;

            const suggestedOrderQty = Math.max(0, targetStockQty - currentStockQty);
            const roundedOrderQty = roundUpToPackSize(suggestedOrderQty, effectivePackSize);

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
                title: title || article,
                unit:
                    usageUnit ||
                    (articleInfo as any)?.adk_stock_unit ||
                    articleInfo?.raw?.data?.adk_stock_unit ||
                    articleInfo?.ARENHET ||
                    undefined,
                supplier: supplier || undefined,
                supplierNumber: supplierNumber || undefined,
                totalQty: round2(totalQty),
                avgPerDay: round2(avgPerDay),
                avgPerWeek: round2(avgPerWeek),
                avgPerMonth: round2(avgPerMonth),
                avgPerQuarter: round2(avgPerQuarter),
                avgPerYear: round2(avgPerYear),
                leadTimeDays: effectiveLeadTimeDays,
                safetyDays: effectiveSafetyDays,
                packSize: effectivePackSize,
                hasCustomLeadTime,
                hasAutoLeadTime,
                hasCustomSafetyDays: settings?.safetyDays != null,
                hasCustomPackSize: settings?.packSize != null,
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

function readRowsForArticle<T>(value: unknown, article: string): T[] {
    if (!value) return [];

    if (Array.isArray(value)) {
        return value as T[];
    }

    if (typeof value !== 'object') return [];

    const directRows = (value as any).rows;
    if (Array.isArray(directRows)) {
        return directRows as T[];
    }

    if (directRows && typeof directRows === 'object') {
        const byArticle = directRows[article];
        if (Array.isArray(byArticle)) {
            return byArticle as T[];
        }

        const normalizedArticle = normalizeArticleCode(article);
        const matchingKey = Object.keys(directRows).find(
            (key) => normalizeArticleCode(key) === normalizedArticle
        );
        if (matchingKey && Array.isArray(directRows[matchingKey])) {
            return directRows[matchingKey] as T[];
        }
    }

    return [];
}

async function fetchRecentOrderAndDeliveryHistoryForArticles(
    articleCodes: string[],
    from: string,
    to: string,
    onPurchaseItem: (article: string, items: RecentPurchaseItem[]) => void,
    shouldStop: () => boolean
): Promise<void> {
    const uniqueArticles = Array.from(new Set(articleCodes.map(normalizeArticleCode).filter(Boolean)));

    for (const article of uniqueArticles) {
        if (shouldStop()) return;

        try {
            log('[History] fetch start', {
                article,
                purchasesFrom: from,
                purchasesTo: to,
                deliveriesFilteredByDate: false,
            });

            const purchaseRes = await withTimeout(
                fetchRecentPurchases({
                    from,
                    to,
                    article,
                    limit_per_article: 2,
                }),
                120000
            );

            const purchaseItems = readRowsForArticle<RecentPurchaseItem>(purchaseRes, article);
            onPurchaseItem(article, purchaseItems);
        } catch (purchaseErr) {
            warn('[History] purchases failed', article, purchaseErr);
            onPurchaseItem(article, []);
        }

        if (shouldStop()) return;
        await sleep(25);
    }
}

const STATUS_FILTER_VALUES: StatusFilterValue[] = ['OK', 'WATCH', 'ORDER'];

function getStatusFilterLabel(value: 'ALL' | StatusFilterValue, t: (key: string, options?: any) => string) {
    switch (value) {
        case 'ALL':
            return t('common.all');
        case 'OK':
            return t('reorderAssist.orderOk');
        case 'WATCH':
            return t('reorderAssist.orderSoon');
        case 'ORDER':
            return t('reorderAssist.orderNow');
        default:
            return value;
    }
}

function getRowStatusLabel(
    value: 'OK' | 'WATCH' | 'ORDER',
    t: (key: string, options?: any) => string
) {
    switch (value) {
        case 'OK':
            return t('reorderAssist.orderOk');
        case 'WATCH':
            return t('reorderAssist.orderSoon');
        case 'ORDER':
            return t('reorderAssist.orderNow');
        default:
            return value;
    }
}

function getFetchErrorMessage(
    type:
        | 'date'
        | 'leadTime'
        | 'safety'
        | 'packSize'
        | 'leadTimeRange'
        | 'fromBeforeTo'
        | 'fetch',
    t: (key: string, options?: any) => string
) {
    switch (type) {
        case 'date':
            return `${t('common.error')} ${t('common.datePlaceholder')}`;
        case 'leadTime':
            return `${t('common.error')} ${t('reorderAssist.leadTime')}`;
        case 'safety':
            return `${t('common.error')} ${t('reorderAssist.safetyDays')}`;
        case 'packSize':
            return `${t('common.error')} ${t('raw.field.quantity')}`;
        case 'leadTimeRange':
            return `${t('common.error')} Min/Max valid lead time`;
        case 'fromBeforeTo':
            return `${t('common.error')} ${t('reorderAssist.dateFrom')} / ${t('reorderAssist.dateTo')}`;
        case 'fetch':
        default:
            return t('common.server_error');
    }
}

type ReorderHeaderProps = {
    t: (key: string, options?: any) => string;
    onOpenHelp: (topic: HelpTopic) => void;
    isWeb: boolean;
    onOpenFromDatePicker: () => void;
    onOpenToDatePicker: () => void;

    from: string;
    to: string;
    setFrom: (value: string) => void;
    setTo: (value: string) => void;

    leadTimeDays: string;
    safetyDays: string;
    packSize: string;
    setLeadTimeDays: (value: string) => void;
    setSafetyDays: (value: string) => void;
    setPackSize: (value: string) => void;

    minValidDays: string;
    maxValidDays: string;
    maxBookingHeads: string;
    maxDeliveryHeads: string;
    leadTimeTimeoutMs: string;
    setMinValidDays: (value: string) => void;
    setMaxValidDays: (value: string) => void;
    setMaxBookingHeads: (value: string) => void;
    setMaxDeliveryHeads: (value: string) => void;
    setLeadTimeTimeoutMs: (value: string) => void;

    showAdvancedLeadtime: boolean;
    setShowAdvancedLeadtime: React.Dispatch<React.SetStateAction<boolean>>;

    searchInput: string;
    setSearchInput: (value: string) => void;
    searchTerms: string[];
    setSearchTerms: React.Dispatch<React.SetStateAction<string[]>>;

    sortBy: SortBy;
    setSortBy: (value: SortBy) => void;

    statusFilter: StatusFilterValue[];
    setStatusFilter: React.Dispatch<React.SetStateAction<StatusFilterValue[]>>;

    selectedSuppliers: string[];
    setSelectedSuppliers: React.Dispatch<React.SetStateAction<string[]>>;
    supplierFilterOptions: SupplierFilterOption[];

    webshopFilter: WebshopFilter;
    setWebshopFilter: (value: WebshopFilter) => void;

    handleFetch: () => void;
    loading: boolean;

    filteredRowsLength: number;
    reorderRowsLength: number;
    error: string | null;
    loadingLeadTimes: boolean;
    loadingStock: boolean;
    loadingSuppliers: boolean;
    leadTimeProgress: { processed: number; total: number };
    history: StockHistoryResponse | null;

    onExportCsv: () => void;
};

const ReorderHeader = React.memo(function ReorderHeader(props: ReorderHeaderProps) {
    const {
        t,
        onOpenHelp,
        isWeb,
        onOpenFromDatePicker,
        onOpenToDatePicker,
        from,
        to,
        setFrom,
        setTo,
        leadTimeDays,
        safetyDays,
        packSize,
        setLeadTimeDays,
        setSafetyDays,
        setPackSize,
        minValidDays,
        maxValidDays,
        maxBookingHeads,
        maxDeliveryHeads,
        leadTimeTimeoutMs,
        setMinValidDays,
        setMaxValidDays,
        setMaxBookingHeads,
        setMaxDeliveryHeads,
        setLeadTimeTimeoutMs,
        showAdvancedLeadtime,
        setShowAdvancedLeadtime,
        searchInput,
        setSearchInput,
        searchTerms,
        setSearchTerms,
        sortBy,
        setSortBy,
        statusFilter,
        setStatusFilter,
        selectedSuppliers,
        setSelectedSuppliers,
        supplierFilterOptions,
        webshopFilter,
        setWebshopFilter,
        handleFetch,
        loading,
        filteredRowsLength,
        reorderRowsLength,
        error,
        loadingLeadTimes,
        loadingStock,
        loadingSuppliers,
        leadTimeProgress,
        history,
        onExportCsv,
    } = props;

    const [showSupplierModal, setShowSupplierModal] = useState(false);
    const [supplierSearch, setSupplierSearch] = useState('');

    const supplierLabelByValue = useMemo(
        () => new Map(supplierFilterOptions.map((option) => [option.value, option.label])),
        [supplierFilterOptions]
    );

    const selectedSupplierSummary = useMemo(() => {
        if (selectedSuppliers.length === 0) {
            return t('common.all');
        }

        const labels = selectedSuppliers.map((value) => supplierLabelByValue.get(value) || value);
        if (labels.length <= 2) {
            return labels.join(', ');
        }

        return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
    }, [selectedSuppliers, supplierLabelByValue, t]);

    const filteredSupplierOptions = useMemo(() => {
        const query = normalizeSearchText(supplierSearch);
        if (!query) return supplierFilterOptions;

        return supplierFilterOptions.filter((option) => {
            const haystacks = [
                normalizeSearchText(option.label),
                normalizeSearchText(option.value),
            ];

            return haystacks.some((value) => value.includes(query));
        });
    }, [supplierFilterOptions, supplierSearch]);

    const canOpenSupplierModal =
        supplierFilterOptions.length > 0 || selectedSuppliers.length > 0;

    const supplierSelectText =
        selectedSuppliers.length > 0
            ? selectedSupplierSummary
            : loadingSuppliers && supplierFilterOptions.length === 0
                ? t('reorderAssist.loadingSupplierInfo')
                : supplierFilterOptions.length === 0
                    ? t('common.noData')
                    : selectedSupplierSummary;

    const handleSearchInputChange = (value: string) => {
        const { completedTerms, remainder } = splitCommittedSearchInput(value);
        if (completedTerms.length > 0) {
            setSearchTerms((prev) => mergeSearchTerms(prev, completedTerms));
            setSearchInput(remainder);
            return;
        }

        setSearchInput(value);
    };

    const commitSearchInput = () => {
        const terms = String(searchInput ?? '')
            .split(/[\n,;]+/)
            .map((value) => value.trim())
            .filter(Boolean);

        if (!terms.length) return;

        setSearchTerms((prev) => mergeSearchTerms(prev, terms));
        setSearchInput('');
    };

    return (
        <>
            <View style={styles.filtersCompact}>

                <View style={styles.row}>
                    <View style={styles.fieldHalf}>
                        <LabelWithHelp
                            label={t('common.searchShort')}
                            onPress={() => onOpenHelp('search')}
                        />
                        <TextInput
                            value={searchInput}
                            onChangeText={handleSearchInputChange}
                            onSubmitEditing={commitSearchInput}
                            onBlur={commitSearchInput}
                            placeholder={t('searchPlaceholder')}
                            style={styles.inputCompact}
                            returnKeyType="done"
                        />
                        {searchTerms.length > 0 ? (
                            <View style={styles.activeChipRow}>
                                {searchTerms.map((term) => (
                                    <ActiveFilterChip
                                        key={`search-chip-${term}`}
                                        label={term}
                                        onRemove={() =>
                                            setSearchTerms((prev) =>
                                                prev.filter(
                                                    (item) =>
                                                        normalizeSearchText(item) !==
                                                        normalizeSearchText(term)
                                                )
                                            )
                                        }
                                    />
                                ))}
                            </View>
                        ) : null}
                    </View>
                </View>

                <View style={styles.row}>
                    <View style={styles.fieldHalf}>
                        <Text style={styles.label}>{t('supplier')}</Text>
                        <TouchableOpacity
                            style={styles.selectFieldButton}
                            onPress={() => {
                                if (canOpenSupplierModal) {
                                    setShowSupplierModal(true);
                                }
                            }}
                            disabled={!canOpenSupplierModal}
                        >
                            <Text
                                style={[
                                    styles.selectFieldText,
                                    selectedSuppliers.length === 0 && styles.selectFieldPlaceholder,
                                ]}
                                numberOfLines={2}
                            >
                                {supplierSelectText}
                            </Text>
                        </TouchableOpacity>
                        {selectedSuppliers.length > 0 ? (
                            <View style={styles.activeChipRow}>
                                {selectedSuppliers.map((value) => (
                                    <ActiveFilterChip
                                        key={`supplier-chip-${value}`}
                                        label={supplierLabelByValue.get(value) || value}
                                        onRemove={() =>
                                            setSelectedSuppliers((prev) =>
                                                prev.filter((item) => item !== value)
                                            )
                                        }
                                    />
                                ))}
                            </View>
                        ) : null}
                    </View>
                </View>

                <View style={styles.row}>
                    <View style={styles.fieldHalf}>
                        <Text style={styles.label}>{t('reorderAssist.dateFrom')}</Text>
                        {isWeb ? (
                            <TextInput
                                value={from}
                                onChangeText={setFrom}
                                placeholder={t('common.datePlaceholder')}
                                style={styles.inputCompact}
                            />
                        ) : (
                            <TouchableOpacity style={styles.datePickerButton} onPress={onOpenFromDatePicker}>
                                <Text style={styles.datePickerButtonText}>{from}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <View style={styles.fieldHalf}>
                        <Text style={styles.label}>{t('reorderAssist.dateTo')}</Text>
                        {isWeb ? (
                            <TextInput
                                value={to}
                                onChangeText={setTo}
                                placeholder={t('common.datePlaceholder')}
                                style={styles.inputCompact}
                            />
                        ) : (
                            <TouchableOpacity style={styles.datePickerButton} onPress={onOpenToDatePicker}>
                                <Text style={styles.datePickerButtonText}>{to}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {isWeb ? (
                    <View style={styles.row}>
                        <View style={styles.fieldThird}>
                            <LabelWithHelp
                                label={t('reorderAssist.leadTime')}
                                onPress={() => onOpenHelp('leadTime')}
                            />
                            <View style={styles.stepperRow}>
                                <TouchableOpacity
                                    style={styles.stepperButton}
                                    onPress={() => setLeadTimeDays(adjustNumericString(leadTimeDays, -1, 0))}
                                >
                                    <Text style={styles.stepperButtonText}>-</Text>
                                </TouchableOpacity>
                                <TextInput
                                    value={leadTimeDays}
                                    onChangeText={setLeadTimeDays}
                                    keyboardType="numeric"
                                    style={styles.inputCompactStepper}
                                />
                                <TouchableOpacity
                                    style={styles.stepperButton}
                                    onPress={() => setLeadTimeDays(adjustNumericString(leadTimeDays, 1, 0))}
                                >
                                    <Text style={styles.stepperButtonText}>+</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View style={styles.fieldThird}>
                            <LabelWithHelp
                                label={t('reorderAssist.safetyDays')}
                                onPress={() => onOpenHelp('safetyDays')}
                            />
                            <View style={styles.stepperRow}>
                                <TouchableOpacity
                                    style={styles.stepperButton}
                                    onPress={() => setSafetyDays(adjustNumericString(safetyDays, -1, 0))}
                                >
                                    <Text style={styles.stepperButtonText}>-</Text>
                                </TouchableOpacity>
                                <TextInput
                                    value={safetyDays}
                                    onChangeText={setSafetyDays}
                                    keyboardType="numeric"
                                    style={styles.inputCompactStepper}
                                />
                                <TouchableOpacity
                                    style={styles.stepperButton}
                                    onPress={() => setSafetyDays(adjustNumericString(safetyDays, 1, 0))}
                                >
                                    <Text style={styles.stepperButtonText}>+</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        <View style={styles.fieldThird}>
                            <LabelWithHelp
                                label={t('raw.field.quantity')}
                                onPress={() => onOpenHelp('packSize')}
                            />
                            <View style={styles.stepperRow}>
                                <TouchableOpacity
                                    style={styles.stepperButton}
                                    onPress={() => setPackSize(adjustNumericString(packSize, -1, 1))}
                                >
                                    <Text style={styles.stepperButtonText}>-</Text>
                                </TouchableOpacity>
                                <TextInput
                                    value={packSize}
                                    onChangeText={setPackSize}
                                    keyboardType="numeric"
                                    style={styles.inputCompactStepper}
                                />
                                <TouchableOpacity
                                    style={styles.stepperButton}
                                    onPress={() => setPackSize(adjustNumericString(packSize, 1, 1))}
                                >
                                    <Text style={styles.stepperButtonText}>+</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                ) : (
                    <>
                        <View style={styles.row}>
                            <View style={styles.fieldHalf}>
                                <LabelWithHelp
                                    label={t('reorderAssist.leadTime')}
                                    onPress={() => onOpenHelp('leadTime')}
                                />
                                <View style={styles.stepperRow}>
                                    <TouchableOpacity
                                        style={styles.stepperButton}
                                        onPress={() => setLeadTimeDays(adjustNumericString(leadTimeDays, -1, 0))}
                                    >
                                        <Text style={styles.stepperButtonText}>-</Text>
                                    </TouchableOpacity>
                                    <TextInput
                                        value={leadTimeDays}
                                        onChangeText={setLeadTimeDays}
                                        keyboardType="numeric"
                                        style={styles.inputCompactStepper}
                                    />
                                    <TouchableOpacity
                                        style={styles.stepperButton}
                                        onPress={() => setLeadTimeDays(adjustNumericString(leadTimeDays, 1, 0))}
                                    >
                                        <Text style={styles.stepperButtonText}>+</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                        <View style={styles.row}>
                            <View style={styles.fieldHalf}>
                                <LabelWithHelp
                                    label={t('reorderAssist.safetyDays')}
                                    onPress={() => onOpenHelp('safetyDays')}
                                />
                                <View style={styles.stepperRow}>
                                    <TouchableOpacity
                                        style={styles.stepperButton}
                                        onPress={() => setSafetyDays(adjustNumericString(safetyDays, -1, 0))}
                                    >
                                        <Text style={styles.stepperButtonText}>-</Text>
                                    </TouchableOpacity>
                                    <TextInput
                                        value={safetyDays}
                                        onChangeText={setSafetyDays}
                                        keyboardType="numeric"
                                        style={styles.inputCompactStepper}
                                    />
                                    <TouchableOpacity
                                        style={styles.stepperButton}
                                        onPress={() => setSafetyDays(adjustNumericString(safetyDays, 1, 0))}
                                    >
                                        <Text style={styles.stepperButtonText}>+</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                        <View style={styles.row}>
                            <View style={styles.fieldHalf}>
                                <LabelWithHelp
                                    label={t('raw.field.quantity')}
                                    onPress={() => onOpenHelp('packSize')}
                                />
                                <View style={styles.stepperRow}>
                                    <TouchableOpacity
                                        style={styles.stepperButton}
                                        onPress={() => setPackSize(adjustNumericString(packSize, -1, 1))}
                                    >
                                        <Text style={styles.stepperButtonText}>-</Text>
                                    </TouchableOpacity>
                                    <TextInput
                                        value={packSize}
                                        onChangeText={setPackSize}
                                        keyboardType="numeric"
                                        style={styles.inputCompactStepper}
                                    />
                                    <TouchableOpacity
                                        style={styles.stepperButton}
                                        onPress={() => setPackSize(adjustNumericString(packSize, 1, 1))}
                                    >
                                        <Text style={styles.stepperButtonText}>+</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </>
                )}
                <View style={styles.row}>
                    <View style={styles.fieldHalf}>
                        <Text style={styles.label}>{t('leadtime.minValidDays')}</Text>
                        <TextInput
                            value={minValidDays}
                            onChangeText={setMinValidDays}
                            keyboardType="numeric"
                            style={styles.inputCompact}
                        />
                    </View>
                    <View style={styles.fieldHalf}>
                        <Text style={styles.label}>{t('leadtime.maxValidDays')}</Text>
                        <TextInput
                            value={maxValidDays}
                            onChangeText={setMaxValidDays}
                            keyboardType="numeric"
                            style={styles.inputCompact}
                        />
                    </View>
                </View>

                <TouchableOpacity
                    style={styles.advancedToggle}
                    onPress={() => setShowAdvancedLeadtime((prev) => !prev)}
                >
                    <Text style={styles.advancedToggleText}>
                        {showAdvancedLeadtime
                            ? t('leadtime.hideAdvanced')
                            : t('leadtime.showAdvanced')}
                    </Text>
                </TouchableOpacity>

                {showAdvancedLeadtime ? (
                    <View style={styles.advancedBox}>
                        <View style={styles.row}>
                            <View style={styles.fieldThird}>
                                <Text style={styles.label}>{t('leadtime.maxBookingHeads')}</Text>
                                <TextInput
                                    value={maxBookingHeads}
                                    onChangeText={setMaxBookingHeads}
                                    keyboardType="numeric"
                                    style={styles.inputCompact}
                                />
                            </View>
                            <View style={styles.fieldThird}>
                                <Text style={styles.label}>{t('leadtime.maxDeliveryHeads')}</Text>
                                <TextInput
                                    value={maxDeliveryHeads}
                                    onChangeText={setMaxDeliveryHeads}
                                    keyboardType="numeric"
                                    style={styles.inputCompact}
                                />
                            </View>
                            <View style={styles.fieldThird}>
                                <Text style={styles.label}>{t('leadtime.timeoutMs')}</Text>
                                <TextInput
                                    value={leadTimeTimeoutMs}
                                    onChangeText={setLeadTimeTimeoutMs}
                                    keyboardType="numeric"
                                    style={styles.inputCompact}
                                />
                            </View>
                        </View>

                        <Text style={styles.advancedHint}>
                            {t('leadtime.advancedHint')}
                        </Text>
                    </View>
                ) : null}

                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.buttonPrimary} onPress={handleFetch} disabled={loading}>
                        <Text style={styles.buttonText}>
                            {loading ? t('loading') : t('calculate')}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.buttonSecondary}
                        onPress={() => onOpenHelp('overview')}
                    >
                        <Text style={styles.buttonSecondaryText}>{t('reorderAssist.helpButton')}</Text>
                    </TouchableOpacity>

                    {Platform.OS === 'web' && filteredRowsLength > 0 ? (
                        <TouchableOpacity style={styles.buttonSecondary} onPress={onExportCsv}>
                            <Text style={styles.buttonSecondaryText}>{t('export.exportCsv')}</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {!loading && loadingLeadTimes ? (
                <Text style={styles.infoText}>
                    {t('fetchingLeadTimes')} {leadTimeProgress.processed}/{leadTimeProgress.total}
                </Text>
            ) : null}

            {!loading && loadingStock ? (
                <Text style={styles.infoText}>
                    {t('reorderAssist.loadingStockGlobal')}
                </Text>
            ) : null}

            {history ? (
                <View style={styles.summaryCompact}>
                    <Text style={styles.summaryText}>
                        {t('reorderAssist.dateFrom')}: {history.from}
                    </Text>
                    <Text style={styles.summaryText}>
                        {t('reorderAssist.dateTo')}: {history.to}
                    </Text>
                    <Text style={styles.summaryText}>
                        {t('articles.title')}: {filteredRowsLength}/{reorderRowsLength}
                    </Text>
                    <Text style={styles.summaryText}>
                        {t('raw.rows')}: {history.debug?.matched_rows ?? 0}
                    </Text>
                </View>
            ) : null}

            <View style={styles.listFiltersSection}>
                <View style={styles.listFilterGroup}>
                    <Text style={styles.listFilterLabel}>{t('reorderAssist.filterArticleScopeTitle')}</Text>
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
                </View>

                <View style={styles.listFilterGroup}>
                    <Text style={styles.listFilterLabel}>{t('reorderAssist.filterStatusTitle')}</Text>
                    <View style={styles.statusRow}>
                        {(['ALL', ...STATUS_FILTER_VALUES] as const).map((value) => (
                            <TouchableOpacity
                                key={value}
                                style={[
                                    styles.filterChip,
                                    (
                                        value === 'ALL'
                                            ? statusFilter.length === 0
                                            : statusFilter.includes(value)
                                    ) && styles.filterChipActive,
                                ]}
                                onPress={() => {
                                    setStatusFilter((prev) => {
                                        if (value === 'ALL') return [];

                                        if (prev.includes(value)) {
                                            const next = prev.filter((item) => item !== value);
                                            return next;
                                        }

                                        return [...prev, value];
                                    });
                                }}
                            >
                                <Text
                                    style={[
                                        styles.filterChipText,
                                        (
                                            value === 'ALL'
                                                ? statusFilter.length === 0
                                                : statusFilter.includes(value)
                                        ) && styles.filterChipTextActive,
                                    ]}
                                >
                                    {getStatusFilterLabel(value, t)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={styles.listFilterGroup}>
                    <Text style={styles.listFilterLabel}>{t('reorderAssist.filterSortTitle')}</Text>
                    <View style={styles.sortRow}>
                    <TouchableOpacity
                        style={[styles.filterChip, sortBy === 'article' && styles.filterChipActive]}
                        onPress={() => setSortBy('article')}
                    >
                        <Text style={[styles.filterChipText, sortBy === 'article' && styles.filterChipTextActive]}>
                            {t('article')}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.filterChip, sortBy === 'title' && styles.filterChipActive]}
                        onPress={() => setSortBy('title')}
                    >
                        <Text style={[styles.filterChipText, sortBy === 'title' && styles.filterChipTextActive]}>
                            {t('sortTitleLabel')}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.filterChip, sortBy === 'supplier' && styles.filterChipActive]}
                        onPress={() => setSortBy('supplier')}
                    >
                        <Text style={[styles.filterChipText, sortBy === 'supplier' && styles.filterChipTextActive]}>
                            {t('supplier')}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.filterChip, sortBy === 'roundedOrderQty' && styles.filterChipActive]}
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

            <Modal
                visible={showSupplierModal}
                transparent
                animationType="fade"
                onRequestClose={() => {
                    setShowSupplierModal(false);
                    setSupplierSearch('');
                }}
            >
                <View style={styles.helpModalOverlay}>
                    <View style={styles.helpModalCard}>
                        <View style={styles.helpModalHeader}>
                            <Text style={styles.helpModalTitle}>{t('supplier')}</Text>
                            <TouchableOpacity
                                style={styles.helpModalCloseButton}
                                onPress={() => {
                                    setShowSupplierModal(false);
                                    setSupplierSearch('');
                                }}
                            >
                                <Text style={styles.helpModalCloseButtonText}>{t('common.close')}</Text>
                            </TouchableOpacity>
                        </View>

                        <TextInput
                            value={supplierSearch}
                            onChangeText={setSupplierSearch}
                            placeholder={t('common.searchShort')}
                            style={styles.inputCompact}
                        />

                        <View style={styles.modalActionRow}>
                            <TouchableOpacity
                                style={[
                                    styles.filterChip,
                                    selectedSuppliers.length === 0 && styles.filterChipActive,
                                ]}
                                onPress={() => setSelectedSuppliers([])}
                            >
                                <Text
                                    style={[
                                        styles.filterChipText,
                                        selectedSuppliers.length === 0 && styles.filterChipTextActive,
                                    ]}
                                >
                                    {t('common.all')}
                                </Text>
                            </TouchableOpacity>

                            {selectedSuppliers.length > 0 ? (
                                <TouchableOpacity
                                    style={styles.filterChip}
                                    onPress={() => setSelectedSuppliers([])}
                                >
                                    <Text style={styles.filterChipText}>{t('common.clear')}</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>

                        <FlatList
                            data={filteredSupplierOptions}
                            keyExtractor={(item) => item.value}
                            keyboardShouldPersistTaps="handled"
                            style={styles.supplierModalList}
                            ListEmptyComponent={
                                <Text style={styles.metricMuted}>{t('common.noResults')}</Text>
                            }
                            renderItem={({ item }) => {
                                const isActive = selectedSuppliers.includes(item.value);

                                return (
                                    <TouchableOpacity
                                        style={[
                                            styles.supplierOptionRow,
                                            isActive && styles.supplierOptionRowActive,
                                        ]}
                                        onPress={() => {
                                            setSelectedSuppliers((prev) =>
                                                prev.includes(item.value)
                                                    ? prev.filter((value) => value !== item.value)
                                                    : [...prev, item.value]
                                            );
                                        }}
                                    >
                                        <Text
                                            style={[
                                                styles.supplierOptionCheck,
                                                isActive && styles.supplierOptionCheckActive,
                                            ]}
                                        >
                                            {isActive ? 'x' : 'o'}
                                        </Text>
                                        <Text
                                            style={[
                                                styles.supplierOptionText,
                                                isActive && styles.supplierOptionTextActive,
                                            ]}
                                        >
                                            {item.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>
                </View>
            </Modal>
        </>
    );
});

export default function ReorderScreen() {
    const { t } = useI18n();
    const [helpTopic, setHelpTopic] = useState<HelpTopic | null>(null);

    const [from, setFrom] = useState(() => {
        const today = new Date();
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setDate(today.getDate() - 30);
        return formatDateString(oneMonthAgo);
    });

    const [to, setTo] = useState(() => {
        const today = new Date();
        return formatDateString(today);
    });
    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);

    const [leadTimeDays, setLeadTimeDays] = useState('14');
    const [safetyDays, setSafetyDays] = useState('7');
    const [packSize, setPackSize] = useState('1');

    const [minValidDays, setMinValidDays] = useState('0');
    const [maxValidDays, setMaxValidDays] = useState('120');
    const [maxBookingHeads, setMaxBookingHeads] = useState('6000');
    const [maxDeliveryHeads, setMaxDeliveryHeads] = useState('60000');
    const [leadTimeTimeoutMs, setLeadTimeTimeoutMs] = useState('800000');
    const [showAdvancedLeadtime, setShowAdvancedLeadtime] = useState(false);
    const helpContent = useMemo(
        () => (helpTopic ? buildHelpContent(helpTopic, t) : null),
        [helpTopic, t]
    );

    const [searchInput, setSearchInput] = useState('');
    const [searchTerms, setSearchTerms] = useState<string[]>([]);
    const [statusFilter, setStatusFilter] = useState<StatusFilterValue[]>([]);
    const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
    const [webshopFilter, setWebshopFilter] = useState<WebshopFilter>('ALL');
    const [sortBy, setSortBy] = useState<SortBy>('article');

    const [loading, setLoading] = useState(false);
    const [loadingLeadTimes, setLoadingLeadTimes] = useState(false);
    const [loadingStock, setLoadingStock] = useState(false);
    const [loadingArticles, setLoadingArticles] = useState(false);
    const [loadingSuppliers, setLoadingSuppliers] = useState(false);

    const [leadTimeProgress, setLeadTimeProgress] = useState<{ processed: number; total: number }>({
        processed: 0,
        total: 0,
    });
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<StockHistoryResponse | null>(null);
    const [stock, setStock] = useState<StockBalanceResponse | null>({ rows: [] });
    const [resolvedStockArticles, setResolvedStockArticles] = useState<ResolvedArticleMap>({});
    const [articles, setArticles] = useState<ExtendedArticle[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [productSettings, setProductSettings] = useState<ProductSettingsMap>({});
    const [autoLeadTimes, setAutoLeadTimes] = useState<AutoLeadTimeMap>({});
    const [loadingAutoLeadTimeArticles, setLoadingAutoLeadTimeArticles] = useState<LoadingArticleMap>({});
    const [autoLeadTimeErrors, setAutoLeadTimeErrors] = useState<ErrorByArticleMap>({});
    const [recentPurchases, setRecentPurchases] = useState<Record<string, RecentPurchaseItem[]>>({});
    const [recentIncomingDeliveries, setRecentIncomingDeliveries] = useState<
        Record<string, RecentIncomingDeliveryItem[]>
    >({});
    const [recentIncomingDebug, setRecentIncomingDebug] = useState<RecentIncomingDebugMap>({});
    const [requestedIncomingHistory, setRequestedIncomingHistory] = useState<Record<string, true>>({});
    const [completedHistoryArticles, setCompletedHistoryArticles] = useState<Record<string, true>>({});
    const [loadingPurchaseHistory, setLoadingPurchaseHistory] = useState<Record<string, boolean>>({});
    const [loadingIncomingHistory, setLoadingIncomingHistory] = useState<Record<string, boolean>>({});
    const [settingsHydrated, setSettingsHydrated] = useState(false);

    const fetchRunRef = useRef(0);
    const historyRef = useRef<StockHistoryResponse | null>(null);
    const completedHistoryArticlesRef = useRef<Record<string, true>>({});
    const inFlightHistoryArticlesRef = useRef<Record<string, true>>({});

    useEffect(() => {
        historyRef.current = history;
    }, [history]);

    useEffect(() => {
        completedHistoryArticlesRef.current = completedHistoryArticles;
    }, [completedHistoryArticles]);

    useEffect(() => {
        let cancelled = false;

        const loadSuppliers = async () => {
            setLoadingSuppliers(true);

            try {
                const data = await fetchSuppliers();
                if (cancelled) return;

                log('[Init] suppliers loaded', Array.isArray(data) ? data.length : data);
                setSuppliers(Array.isArray(data) ? data : []);
            } catch (err) {
                if (cancelled) return;
                warn('[Init] suppliers failed', err);
            } finally {
                if (!cancelled) {
                    setLoadingSuppliers(false);
                }
            }
        };

        void loadSuppliers();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadPersistedSettings = async () => {
            try {
                const raw = await AsyncStorage.getItem(REORDER_ASSIST_SETTINGS_STORAGE_KEY);
                if (!raw) return;

                const parsed = JSON.parse(raw) as ReorderAssistPersistedSettings;
                if (!parsed || typeof parsed !== 'object' || cancelled) return;

                if (typeof parsed.from === 'string' && isValidDateString(parsed.from)) {
                    setFrom(parsed.from);
                }
                if (typeof parsed.to === 'string' && isValidDateString(parsed.to)) {
                    setTo(parsed.to);
                }
                if (typeof parsed.leadTimeDays === 'string') {
                    setLeadTimeDays(parsed.leadTimeDays);
                }
                if (typeof parsed.safetyDays === 'string') {
                    setSafetyDays(parsed.safetyDays);
                }
                if (typeof parsed.packSize === 'string') {
                    setPackSize(parsed.packSize);
                }
                if (typeof parsed.minValidDays === 'string') {
                    setMinValidDays(parsed.minValidDays);
                }
                if (typeof parsed.maxValidDays === 'string') {
                    setMaxValidDays(parsed.maxValidDays);
                }
                if (typeof parsed.maxBookingHeads === 'string') {
                    setMaxBookingHeads(parsed.maxBookingHeads);
                }
                if (typeof parsed.maxDeliveryHeads === 'string') {
                    setMaxDeliveryHeads(parsed.maxDeliveryHeads);
                }
                if (typeof parsed.leadTimeTimeoutMs === 'string') {
                    setLeadTimeTimeoutMs(parsed.leadTimeTimeoutMs);
                }
                if (typeof parsed.showAdvancedLeadtime === 'boolean') {
                    setShowAdvancedLeadtime(parsed.showAdvancedLeadtime);
                }
                if (typeof parsed.search === 'string') {
                    setSearchInput(parsed.search);
                }
                if (Array.isArray(parsed.searchTerms)) {
                    setSearchTerms(
                        mergeSearchTerms(
                            [],
                            parsed.searchTerms.filter(
                                (value): value is string => typeof value === 'string'
                            )
                        )
                    );
                }
                if (parsed.statusFilter === 'ALL') {
                    setStatusFilter([]);
                } else if (
                    parsed.statusFilter === 'OK' ||
                    parsed.statusFilter === 'WATCH' ||
                    parsed.statusFilter === 'ORDER'
                ) {
                    setStatusFilter([parsed.statusFilter]);
                } else if (Array.isArray(parsed.statusFilter)) {
                    const next = parsed.statusFilter.filter(
                        (value): value is StatusFilterValue =>
                            value === 'OK' || value === 'WATCH' || value === 'ORDER'
                    );
                    setStatusFilter(next);
                }
                if (Array.isArray(parsed.selectedSuppliers)) {
                    setSelectedSuppliers(
                        Array.from(
                            new Set(
                                parsed.selectedSuppliers
                                    .filter((value): value is string => typeof value === 'string')
                                    .map((value) => {
                                        const trimmed = value.trim();
                                        if (trimmed.toLowerCase().startsWith('number:')) {
                                            return normalizeSupplierNumber(
                                                trimmed.slice('number:'.length).trim()
                                            );
                                        }
                                        if (trimmed.toLowerCase().startsWith('name:')) {
                                            return '';
                                        }
                                        return normalizeSupplierNumber(trimmed);
                                    })
                                    .filter(Boolean)
                            )
                        )
                    );
                }
                if (parsed.webshopFilter === 'ALL' || parsed.webshopFilter === 'WEBSHOP_ONLY') {
                    setWebshopFilter(parsed.webshopFilter);
                }
                if (
                    parsed.sortBy === 'article' ||
                    parsed.sortBy === 'title' ||
                    parsed.sortBy === 'supplier' ||
                    parsed.sortBy === 'roundedOrderQty'
                ) {
                    setSortBy(parsed.sortBy);
                }
                if (parsed.productSettings && typeof parsed.productSettings === 'object') {
                    setProductSettings(parsed.productSettings);
                }
            } catch (err) {
                warn('[Persist] failed to load reorder settings', err);
            } finally {
                if (!cancelled) {
                    setSettingsHydrated(true);
                }
            }
        };

        void loadPersistedSettings();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!settingsHydrated) return;

        const payload: ReorderAssistPersistedSettings = {
            from,
            to,
            leadTimeDays,
            safetyDays,
            packSize,
            minValidDays,
            maxValidDays,
            maxBookingHeads,
            maxDeliveryHeads,
            leadTimeTimeoutMs,
            showAdvancedLeadtime,
            search: searchInput,
            searchTerms,
            statusFilter: statusFilter.length === 0 ? 'ALL' : statusFilter,
            selectedSuppliers,
            webshopFilter,
            sortBy,
            productSettings,
        };

        const timer = setTimeout(() => {
            AsyncStorage.setItem(REORDER_ASSIST_SETTINGS_STORAGE_KEY, JSON.stringify(payload)).catch((err) => {
                warn('[Persist] failed to save reorder settings', err);
            });
        }, 250);

        return () => clearTimeout(timer);
    }, [
        settingsHydrated,
        from,
        to,
        leadTimeDays,
        safetyDays,
        packSize,
        minValidDays,
        maxValidDays,
        maxBookingHeads,
        maxDeliveryHeads,
        leadTimeTimeoutMs,
        showAdvancedLeadtime,
        searchInput,
        searchTerms,
        statusFilter,
        selectedSuppliers,
        webshopFilter,
        sortBy,
        productSettings,
    ]);

    const leadTimeFetchSettings = useMemo<LeadTimeFetchSettings>(() => {
        const min = parseNonNegativeNumberWithFallback(minValidDays, 0);
        const max = parseNonNegativeNumberWithFallback(maxValidDays, 120);

        return {
            minValidDays: min,
            maxValidDays: max >= min ? max : min,
            maxBookingHeads: parsePositiveNumberWithFallback(maxBookingHeads, 6000),
            maxDeliveryHeads: parsePositiveNumberWithFallback(maxDeliveryHeads, 60000),
            timeoutMs: parsePositiveNumberWithFallback(leadTimeTimeoutMs, 800000),
        };
    }, [minValidDays, maxValidDays, maxBookingHeads, maxDeliveryHeads, leadTimeTimeoutMs]);

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
            Number.isFinite(parsedPackSize) && parsedPackSize > 0 ? parsedPackSize : 1
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
    ]);

    const supplierFilterOptions = useMemo(() => {
        const uniqueSuppliers = new Map<string, SupplierFilterOption>();

        for (const row of suppliers) {
            const supplier = {
                supplier: row.supplierName,
                supplierNumber: row.supplierNumber,
            };
            const value = getSupplierFilterValue(supplier);
            if (!value || uniqueSuppliers.has(value)) continue;

            uniqueSuppliers.set(value, {
                value,
                label: getSupplierFilterLabel(supplier) || value,
            });
        }

        for (const row of reorderRows) {
            const value = getSupplierFilterValue(row);
            if (!value || uniqueSuppliers.has(value)) continue;

            uniqueSuppliers.set(value, {
                value,
                label: getSupplierFilterLabel(row) || value,
            });
        }

        return Array.from(uniqueSuppliers.values()).sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { numeric: true })
        );
    }, [suppliers, reorderRows]);

    const filteredRows = useMemo(() => {
        const activeSearchTerms = mergeSearchTerms(searchTerms, [searchInput])
            .map((value) => normalizeSearchText(value))
            .filter(Boolean);
        const normalizedSelectedSuppliers = selectedSuppliers
            .map((value) => normalizeSupplierNumber(value))
            .filter(Boolean);
        const fetchedSupplierScope = new Set(
            (history?.debug?.supplier_numbers ?? [])
                .map((value) => normalizeSupplierNumber(value))
                .filter(Boolean)
        );
        const hasMatchingFetchedSupplierScope =
            normalizedSelectedSuppliers.length > 0 &&
            normalizedSelectedSuppliers.length === fetchedSupplierScope.size &&
            normalizedSelectedSuppliers.every((value) => fetchedSupplierScope.has(value));

        let result = reorderRows.filter((row) => {
            const haystacks = [
                normalizeSearchText(row.article),
                normalizeSearchText(row.title),
                normalizeSearchText(row.supplier || ''),
                normalizeSearchText(row.supplierNumber || ''),
            ];
            const matchesSearch =
                activeSearchTerms.length === 0 ||
                activeSearchTerms.some((term) =>
                    haystacks.some((value) => value.includes(term))
                );

            const matchesStatus = statusFilter.length === 0 ? true : statusFilter.includes(row.status);
            const rowSupplierValue = getSupplierFilterValue(row);
            const matchesSupplier =
                normalizedSelectedSuppliers.length === 0
                    ? true
                    : rowSupplierValue
                        ? normalizedSelectedSuppliers.includes(rowSupplierValue)
                        : loadingArticles || hasMatchingFetchedSupplierScope;
            const matchesWebshop = webshopFilter === 'ALL' ? true : row.isWebshopArticle === true;

            return matchesSearch && matchesStatus && matchesSupplier && matchesWebshop;
        });

        result = [...result].sort((a, b) => {
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
    }, [history, reorderRows, searchInput, searchTerms, statusFilter, selectedSuppliers, webshopFilter, sortBy, loadingArticles]);

    const fetchVisibleHistory = async (
        articlesToFetch: string[],
        dateFrom: string,
        dateTo: string
    ) => {
        const unique = Array.from(
            new Set(
                articlesToFetch
                    .map(normalizeArticleCode)
                    .filter(Boolean)
                    .filter((article) => !completedHistoryArticlesRef.current[article])
                    .filter((article) => !inFlightHistoryArticlesRef.current[article])
            )
        );

        if (!unique.length) {
            log('[History] no new visible articles to fetch');
            return;
        }

        for (const article of unique) {
            inFlightHistoryArticlesRef.current[article] = true;
        }

        setLoadingPurchaseHistory((prev) => {
            const next = { ...prev };
            for (const article of unique) {
                next[article] = true;
            }
            return next;
        });

        log('[History] queue fetch for articles', unique, 'purchase window', dateFrom, dateTo);

        const runId = fetchRunRef.current;

        try {
            await fetchRecentOrderAndDeliveryHistoryForArticles(
                unique,
                dateFrom,
                dateTo,
                (article, items) => {
                    if (fetchRunRef.current !== runId) return;

                    log('[History] set purchases state', article, items);

                    setRecentPurchases((prev) => ({
                        ...prev,
                        [article]: items,
                    }));

                    setLoadingPurchaseHistory((prev) => ({
                        ...prev,
                        [article]: false,
                    }));
                },
                () => fetchRunRef.current !== runId
            );

            if (fetchRunRef.current !== runId) return;

            setCompletedHistoryArticles((prev) => {
                const next = { ...prev };
                for (const article of unique) {
                    next[article] = true;
                }
                completedHistoryArticlesRef.current = next;
                return next;
            });
        } catch (err) {
            warn('[Reorder] fetchVisibleHistory failed', err);
        } finally {
            for (const article of unique) {
                delete inFlightHistoryArticlesRef.current[article];
            }

            if (fetchRunRef.current === runId) {
                setLoadingPurchaseHistory((prev) => {
                    const next = { ...prev };
                    for (const article of unique) {
                        next[article] = false;
                    }
                    return next;
                });
            }
        }
    };

    const fetchMatchingDeliveryForArticle = async (
        article: string,
        bestnr: string,
        orderDate?: string
    ) => {
        const normalizedArticle = normalizeArticleCode(article);
        const normalizedBestnr = normalizeDocNo(bestnr);
        const requestKey = getIncomingRequestKey(normalizedArticle, normalizedBestnr);
        const normalizedOrderDate =
            orderDate && isValidDateString(orderDate.trim()) ? orderDate.trim() : undefined;
        const normalizedOrderToDate = normalizedOrderDate
            ? formatDateShort(
                addDays(new Date(`${normalizedOrderDate}T00:00:00`), MATCHING_DELIVERY_SEARCH_WINDOW_DAYS)
            )
            : undefined;
        if (!normalizedArticle || !normalizedBestnr) return;

        setRequestedIncomingHistory((prev) => ({
            ...prev,
            [requestKey]: true,
        }));
        setLoadingIncomingHistory((prev) => ({
            ...prev,
            [requestKey]: true,
        }));
        setRecentIncomingDebug((prev) => ({
            ...prev,
            [requestKey]: {},
        }));

        try {
            const deliveryRes = await withTimeout(
                fetchMatchingIncomingDeliveries({
                    article: normalizedArticle,
                    bestnr: normalizedBestnr,
                    from_date: normalizedOrderDate,
                    to_date: normalizedOrderToDate,
                    max_heads: 10000,
                    max_hits: 20,
                }),
                180000
            );

            const items = readRowsForArticle<RecentIncomingDeliveryItem>(deliveryRes, normalizedArticle);
            setRecentIncomingDeliveries((prev) => ({
                ...prev,
                [requestKey]: items,
            }));
            setRecentIncomingDebug((prev) => ({
                ...prev,
                [requestKey]: {
                    source: deliveryRes?.source,
                    rowKeys: deliveryRes?.rows ? Object.keys(deliveryRes.rows) : [],
                    debug: deliveryRes?.debug,
                },
            }));
        } catch (deliveryErr) {
            warn('[History] deliveries failed', normalizedArticle, deliveryErr);
            setRecentIncomingDeliveries((prev) => ({
                ...prev,
                [requestKey]: [],
            }));
            setRecentIncomingDebug((prev) => ({
                ...prev,
                [requestKey]: {
                    error:
                        deliveryErr instanceof Error
                            ? deliveryErr.message
                            : String(deliveryErr ?? 'unknown delivery error'),
                },
            }));
        } finally {
            setLoadingIncomingHistory((prev) => ({
                ...prev,
                [requestKey]: false,
            }));
        }
    };

    const fetchAutoLeadTimeForArticle = async (article: string) => {
        const normalizedArticle = normalizeArticleCode(article);
        if (!normalizedArticle) return;

        setLoadingAutoLeadTimeArticles((prev) => ({
            ...prev,
            [normalizedArticle]: true,
        }));
        setAutoLeadTimeErrors((prev) => {
            const next = { ...prev };
            delete next[normalizedArticle];
            return next;
        });

        try {
            const result = await withTimeout(
                getArticleLeadtime(normalizedArticle, {
                    min_valid_days: leadTimeFetchSettings.minValidDays,
                    max_valid_days: leadTimeFetchSettings.maxValidDays,
                    max_booking_heads: leadTimeFetchSettings.maxBookingHeads,
                    max_delivery_heads: leadTimeFetchSettings.maxDeliveryHeads,
                }),
                leadTimeFetchSettings.timeoutMs
            );

            const suggested = result?.suggested_lead_time_days;
            if (typeof suggested === 'number' && Number.isFinite(suggested) && suggested >= 0) {
                setAutoLeadTimes((prev) => ({
                    ...prev,
                    [normalizedArticle]: suggested,
                }));
            } else {
                setAutoLeadTimeErrors((prev) => ({
                    ...prev,
                    [normalizedArticle]: 'No suggested lead time returned',
                }));
            }
        } catch (err) {
            warn('[LeadTime] on-demand fetch failed', normalizedArticle, err);
            setAutoLeadTimeErrors((prev) => ({
                ...prev,
                [normalizedArticle]:
                    err instanceof Error ? err.message : String(err ?? 'Unknown lead time error'),
            }));
        } finally {
            setLoadingAutoLeadTimeArticles((prev) => ({
                ...prev,
                [normalizedArticle]: false,
            }));
        }
    };

    useEffect(() => {
        if (!history || !filteredRows.length) return;

        const firstArticles = filteredRows.slice(0, 2).map((row) => row.article);
        log('[History] initial effect fetch for first filtered rows', firstArticles);

        void fetchVisibleHistory(firstArticles, history.from, history.to);
    }, [history, filteredRows]);

    const onViewableItemsChanged = useRef(
        ({ viewableItems }: { viewableItems: Array<{ item?: AssistantRow | null }> }) => {
            const visibleArticles = viewableItems
                .map((entry) => entry.item?.article)
                .filter((value): value is string => Boolean(value));

            const currentHistory = historyRef.current;
            if (!currentHistory || !visibleArticles.length) return;

            log('[History] onViewableItemsChanged', visibleArticles);

            void fetchVisibleHistory(
                visibleArticles,
                currentHistory.from,
                currentHistory.to
            );
        }
    ).current;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 30,
    }).current;

    const handleFetch = async () => {
        const runId = Date.now();
        fetchRunRef.current = runId;

        try {
            setError(null);

            if (!isValidDateString(from) || !isValidDateString(to)) {
                setError(getFetchErrorMessage('date', t));
                return;
            }

            const parsedLeadTime = Number(leadTimeDays);
            const parsedSafetyDays = Number(safetyDays);
            const parsedPackSize = Number(packSize);

            if (!Number.isFinite(parsedLeadTime) || parsedLeadTime < 0) {
                setError(getFetchErrorMessage('leadTime', t));
                return;
            }

            if (!Number.isFinite(parsedSafetyDays) || parsedSafetyDays < 0) {
                setError(getFetchErrorMessage('safety', t));
                return;
            }

            if (!Number.isFinite(parsedPackSize) || parsedPackSize <= 0) {
                setError(getFetchErrorMessage('packSize', t));
                return;
            }

            if (leadTimeFetchSettings.maxValidDays < leadTimeFetchSettings.minValidDays) {
                setError(getFetchErrorMessage('leadTimeRange', t));
                return;
            }

            const fromDate = new Date(`${from}T00:00:00`);
            const toDate = new Date(`${to}T00:00:00`);
            if (fromDate.getTime() > toDate.getTime()) {
                setError(getFetchErrorMessage('fromBeforeTo', t));
                return;
            }

            log('[Fetch] starting handleFetch', {
                from,
                to,
                leadTimeDays,
                safetyDays,
                packSize,
                leadTimeFetchSettings,
            });

            setLoading(true);
            setLoadingLeadTimes(false);
            setLoadingStock(false);
            setLoadingArticles(false);
            setLeadTimeProgress({ processed: 0, total: 0 });
            setHistory(null);
            setStock({ rows: [] });
            setResolvedStockArticles({});
            setArticles([]);
            setAutoLeadTimes({});
            setLoadingAutoLeadTimeArticles({});
            setAutoLeadTimeErrors({});
            setRecentPurchases({});
            setRecentIncomingDeliveries({});
            setRecentIncomingDebug({});
            setRequestedIncomingHistory({});
            setCompletedHistoryArticles({});
            setLoadingPurchaseHistory({});
            setLoadingIncomingHistory({});
            historyRef.current = null;
            completedHistoryArticlesRef.current = {};
            inFlightHistoryArticlesRef.current = {};

            await login('jens@aveo.se', 'jens2020!');
            log('[Fetch] login ok');

            if (fetchRunRef.current !== runId) return;

            const historyData = await withTimeout(
                fetchOrderAssistStockHistory({
                    from,
                    to,
                    supplier_numbers: selectedSuppliers,
                }),
                300000
            );

            log('[Fetch] historyData', historyData);

            if (fetchRunRef.current !== runId) return;

            setHistory(historyData ?? null);
            historyRef.current = historyData ?? null;
            setLoading(false);

            const articleCodes = (historyData?.rows ?? [])
                .map((row) => normalizeArticleCode(row.article))
                .filter(Boolean);

            const uniqueArticles = Array.from(new Set(articleCodes));

            log('[Fetch] uniqueArticles count', uniqueArticles.length);

            if (!uniqueArticles.length) {
                setStock({ rows: [] });
                setLoadingArticles(false);
                setLoadingSuppliers(false);
                return;
            }

            setLoadingArticles(true);
            const articlesPromise = fetchVismaArticles()
                .then((data) => {
                    if (fetchRunRef.current !== runId) return;
                    const articleRows = Array.isArray(data) ? (data as ExtendedArticle[]) : [];
                    const articleWithWebshopField = articleRows.find((row) => {
                        const root = row as any;
                        const raw = root?.raw?.data;
                        return (
                            Object.prototype.hasOwnProperty.call(root, 'adk_article_webshop') ||
                            Object.prototype.hasOwnProperty.call(raw ?? {}, 'adk_article_webshop')
                        );
                    });
                    const firstArticle = articleRows[0] as any;

                    log('[Fetch] vismaArticles loaded', articleRows.length);
                    log('[Fetch] vismaArticles webshop debug', {
                        firstArticleNumber:
                            firstArticle?.adk_article_number ?? firstArticle?.ARARTN ?? null,
                        firstArticleKeys: firstArticle ? Object.keys(firstArticle).slice(0, 40) : [],
                        firstRawKeys: firstArticle?.raw?.data
                            ? Object.keys(firstArticle.raw.data).slice(0, 40)
                            : [],
                        webshopFieldArticleNumber: articleWithWebshopField
                            ? ((articleWithWebshopField as any)?.adk_article_number ??
                                (articleWithWebshopField as any)?.ARARTN ??
                                null)
                            : null,
                        webshopFieldValue: articleWithWebshopField
                            ? ((articleWithWebshopField as any)?.adk_article_webshop ??
                                (articleWithWebshopField as any)?.raw?.data?.adk_article_webshop ??
                                null)
                            : null,
                        webshopFieldSample: articleWithWebshopField
                            ? {
                                article:
                                    (articleWithWebshopField as any)?.adk_article_number ??
                                    (articleWithWebshopField as any)?.ARARTN ??
                                    null,
                                adk_article_webshop:
                                    (articleWithWebshopField as any)?.adk_article_webshop ?? null,
                                raw_adk_article_webshop:
                                    (articleWithWebshopField as any)?.raw?.data?.adk_article_webshop ?? null,
                            }
                            : null,
                    });

                    setArticles(articleRows);
                })
                .catch((err) => {
                    warn('[Reorder] visma articles failed', err);
                })
                .finally(() => {
                    if (fetchRunRef.current !== runId) return;
                    setLoadingArticles(false);
                });

            setLoadingSuppliers(true);
            const suppliersPromise = fetchSuppliers()
                .then((data) => {
                    if (fetchRunRef.current !== runId) return;
                    log('[Fetch] suppliers loaded', Array.isArray(data) ? data.length : data);
                    setSuppliers(Array.isArray(data) ? data : []);
                })
                .catch((err) => {
                    warn('[Reorder] suppliers failed', err);
                })
                .finally(() => {
                    if (fetchRunRef.current !== runId) return;
                    setLoadingSuppliers(false);
                });

            setLoadingStock(true);
            setResolvedStockArticles({});

            const stockPromise = (async () => {
                const INITIAL_STOCK_BATCH_SIZE = 40;
                const STOCK_BATCH_SIZE = 200;

                const initialBatch = uniqueArticles.slice(0, INITIAL_STOCK_BATCH_SIZE);
                const remainingBatches = chunkArray(
                    uniqueArticles.slice(INITIAL_STOCK_BATCH_SIZE),
                    STOCK_BATCH_SIZE
                );

                const applyStockBatch = (batchArticles: string[], data: StockBalanceResponse | null | undefined) => {
                    if (fetchRunRef.current !== runId) return;

                    setStock((prev) => mergeStockBalanceResponses(prev, data));
                    setResolvedStockArticles((prev) => {
                        const next = { ...prev };
                        for (const article of batchArticles) {
                            next[article] = true;
                        }
                        return next;
                    });
                };

                try {
                    if (initialBatch.length) {
                        try {
                            const initialStock = await fetchStockBalance({
                                articles: initialBatch,
                                mode: 'onhand',
                            });

                            log('[Fetch] initial stock loaded', initialStock);
                            applyStockBatch(initialBatch, initialStock);
                        } catch (initialErr) {
                            warn('[Reorder] initial stock batch failed', initialErr);
                            applyStockBatch(initialBatch, { rows: [] });
                        }
                    }

                    for (const batch of remainingBatches) {
                        if (fetchRunRef.current !== runId) return;

                        try {
                            const batchStock = await fetchStockBalance({
                                articles: batch,
                                mode: 'onhand',
                            });

                            log('[Fetch] stock batch loaded', batch.length);
                            applyStockBatch(batch, batchStock);
                        } catch (batchErr) {
                            warn('[Reorder] stock batch failed', batchErr);
                            applyStockBatch(batch, { rows: [] });
                        }

                        if (fetchRunRef.current !== runId) return;
                        await sleep(25);
                    }
                } catch (err) {
                    warn('[Reorder] stock balance failed', err);
                } finally {
                    if (fetchRunRef.current !== runId) return;
                    setLoadingStock(false);
                }
            })();

            void Promise.allSettled([articlesPromise, suppliersPromise, stockPromise]);
        } catch (err: any) {
            if (fetchRunRef.current !== runId) return;
            warn('[Fetch] handleFetch failed', err);
            setError(err?.message || getFetchErrorMessage('fetch', t));
            setLoadingLeadTimes(false);
            setLoadingStock(false);
            setLoading(false);
        }
    };

    const updateProductSetting = (
        article: string,
        field: 'leadTimeDays' | 'safetyDays' | 'packSize',
        rawValue: string
    ) => {
        const parsed = parseOptionalNumber(rawValue);

        setProductSettings((prev) => {
            const current = prev[article] || {};
            const nextForArticle = {
                ...current,
                [field]: parsed,
            };

            if (
                nextForArticle.leadTimeDays == null &&
                nextForArticle.safetyDays == null &&
                nextForArticle.packSize == null
            ) {
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

    const handleExportCsv = () => {
        downloadCsv(`reorder-${from}-to-${to}.csv`, filteredRows);
    };

    return (
        <ScreenContainer>
            <FlatList
                data={filteredRows}
                keyExtractor={(item) => item.article}
                ListHeaderComponent={
                    <ReorderHeader
                        t={t}
                        onOpenHelp={setHelpTopic}
                        isWeb={Platform.OS === 'web'}
                        onOpenFromDatePicker={() => setShowFromPicker(true)}
                        onOpenToDatePicker={() => setShowToPicker(true)}
                        from={from}
                        to={to}
                        setFrom={setFrom}
                        setTo={setTo}
                        leadTimeDays={leadTimeDays}
                        safetyDays={safetyDays}
                        packSize={packSize}
                        setLeadTimeDays={setLeadTimeDays}
                        setSafetyDays={setSafetyDays}
                        setPackSize={setPackSize}
                        minValidDays={minValidDays}
                        maxValidDays={maxValidDays}
                        maxBookingHeads={maxBookingHeads}
                        maxDeliveryHeads={maxDeliveryHeads}
                        leadTimeTimeoutMs={leadTimeTimeoutMs}
                        setMinValidDays={setMinValidDays}
                        setMaxValidDays={setMaxValidDays}
                        setMaxBookingHeads={setMaxBookingHeads}
                        setMaxDeliveryHeads={setMaxDeliveryHeads}
                        setLeadTimeTimeoutMs={setLeadTimeTimeoutMs}
                        showAdvancedLeadtime={showAdvancedLeadtime}
                        setShowAdvancedLeadtime={setShowAdvancedLeadtime}
                        searchInput={searchInput}
                        setSearchInput={setSearchInput}
                        searchTerms={searchTerms}
                        setSearchTerms={setSearchTerms}
                        sortBy={sortBy}
                        setSortBy={setSortBy}
                        statusFilter={statusFilter}
                        setStatusFilter={setStatusFilter}
                        selectedSuppliers={selectedSuppliers}
                        setSelectedSuppliers={setSelectedSuppliers}
                        supplierFilterOptions={supplierFilterOptions}
                        webshopFilter={webshopFilter}
                        setWebshopFilter={setWebshopFilter}
                        handleFetch={handleFetch}
                        loading={loading}
                        filteredRowsLength={filteredRows.length}
                        reorderRowsLength={reorderRows.length}
                        error={error}
                        loadingLeadTimes={loadingLeadTimes}
                        loadingStock={loadingStock}
                        loadingSuppliers={loadingSuppliers}
                        leadTimeProgress={leadTimeProgress}
                        history={history}
                        onExportCsv={handleExportCsv}
                    />
                }
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                initialNumToRender={4}
                maxToRenderPerBatch={4}
                windowSize={3}
                removeClippedSubviews={Platform.OS !== 'web'}
                ListEmptyComponent={
                    !loading && history ? (
                        <Text style={styles.empty}>
                            {reorderRows.length > 0 ? t('common.noResults') : t('common.noData')}
                        </Text>
                    ) : null
                }
                renderItem={({ item }) => {
                    const custom = productSettings[item.article];
                    const purchaseHistory = recentPurchases[item.article] || [];
                    const isLoadingAutoLeadTime = loadingAutoLeadTimeArticles[item.article] === true;
                    const autoLeadTimeError = autoLeadTimeErrors[item.article];
                    const isLoadingPurchases = loadingPurchaseHistory[item.article] === true;
                    const stockIsReady = resolvedStockArticles[item.article] === true;
                    const purchaseRequestKeys = purchaseHistory
                        .map((entry) => {
                            const purchaseOrderNo = getPurchaseOrderKey(entry);
                            return purchaseOrderNo
                                ? getIncomingRequestKey(item.article, purchaseOrderNo)
                                : '';
                        })
                        .filter(Boolean);
                    const incomingHistory = purchaseRequestKeys.flatMap(
                        (requestKey) => recentIncomingDeliveries[requestKey] || []
                    );
                    const incomingByBestnr = incomingHistory.reduce<Record<string, RecentIncomingDeliveryItem[]>>(
                        (acc, entry) => {
                            const keys = getIncomingDeliveryOrderKeys(entry);
                            for (const key of keys) {
                                if (!acc[key]) acc[key] = [];
                                acc[key].push(entry);
                            }
                            return acc;
                        },
                        {}
                    );

                    for (const key of Object.keys(incomingByBestnr)) {
                        incomingByBestnr[key].sort((a, b) => {
                            const aDate = String(a.deliveryDate || '');
                            const bDate = String(b.deliveryDate || '');
                            if (aDate !== bDate) return bDate.localeCompare(aDate);
                            return Number(b.rowNumber || 0) - Number(a.rowNumber || 0);
                        });
                    }

                    return (
                        <View style={styles.cardCompact}>
                            <View style={styles.cardTopRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.code}>{item.article}</Text>
                                    {loadingArticles && item.title === item.article ? (
                                        <View style={styles.metadataLoadingRow}>
                                            <ActivityIndicator size="small" color="#1976d2" />
                                            <Text style={styles.metadataLoadingText}>
                                                {t('reorderAssist.loadingArticleInfo')}
                                            </Text>
                                        </View>
                                    ) : item.title && item.title !== item.article ? (
                                        <Text style={styles.titleText}>{item.title}</Text>
                                    ) : null}
                                    {loadingArticles || loadingSuppliers ? (
                                        <View style={styles.metadataLoadingRow}>
                                            <ActivityIndicator size="small" color="#1976d2" />
                                            <Text style={styles.metadataLoadingText}>
                                                {t('reorderAssist.loadingSupplierInfo')}
                                            </Text>
                                        </View>
                                    ) : item.supplier ? (
                                        <Text style={styles.supplierText}>{item.supplier}</Text>
                                    ) : item.supplierNumber ? (
                                        <Text style={styles.supplierText}>{item.supplierNumber}</Text>
                                    ) : null}
                                    {loadingArticles ? (
                                        <View style={styles.webshopLoadingRow}>
                                            <ActivityIndicator size="small" color="#1976d2" />
                                            <Text style={styles.webshopLoadingText}>
                                                {t('reorderAssist.loadingWebshopStatus')}
                                            </Text>
                                        </View>
                                    ) : item.isWebshopArticle ? (
                                        <Text style={styles.webshopText}>{t('webshopArticle')}</Text>
                                    ) : null}
                                </View>

                                {stockIsReady ? (
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
                                        {getRowStatusLabel(item.status, t)}
                                    </Text>
                                ) : (
                                    <Text style={[styles.badge, styles.badgeLoading]}>
                                        {t('reorderAssist.loadingStockShort')}
                                    </Text>
                                )}
                            </View>

                            {stockIsReady ? (
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
                                    <View style={styles.titleWithHelpRow}>
                                        <Text style={styles.decisionTitle}>{t('orderingDecision')}</Text>
                                        <HelpIconButton onPress={() => setHelpTopic('decision')} />
                                    </View>

                                    <Text style={styles.decisionText}>{getOrderDecisionText(item, t)}</Text>

                                    {item.estimatedOutOfStockDate ? (
                                        <Text style={styles.decisionLine}>
                                            {t('estimatedOutOfStock')}{' '}
                                            <Text style={styles.decisionStrong}>{item.estimatedOutOfStockDate}</Text>
                                        </Text>
                                    ) : (
                                        <Text style={styles.decisionLine}>
                                            {t('estimatedOutOfStock')}{' '}
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
                                            {t('orderBy')}{' '}
                                            <Text style={styles.decisionStrong}>{item.latestOrderDate}</Text>
                                        </Text>
                                    ) : null}

                                    {item.daysUntilOutOfStock != null ? (
                                        <Text style={styles.decisionLine}>
                                            {t('stockLastsAboutDays')}{' '}
                                            <Text style={styles.decisionStrong}>{item.daysUntilOutOfStock}</Text>
                                        </Text>
                                    ) : null}

                                    <Text style={styles.decisionLine}>
                                        {t('suggestedOrder')}{' '}
                                        <Text style={styles.decisionStrong}>
                                            {item.suggestedOrderQty} {item.unit || ''}
                                        </Text>
                                    </Text>
                                    <Text style={styles.decisionLine}>
                                        {t('roundedOrder')}{' '}
                                        <Text style={styles.decisionStrong}>
                                            {item.roundedOrderQty} {item.unit || ''}
                                        </Text>
                                    </Text>
                                </View>
                            ) : (
                                <View style={[styles.decisionBox, styles.decisionLoading]}>
                                    <View style={styles.titleWithHelpRow}>
                                        <Text style={styles.decisionTitle}>
                                            {t('reorderAssist.loadingStockDecisionTitle')}
                                        </Text>
                                        <HelpIconButton onPress={() => setHelpTopic('decision')} />
                                    </View>
                                    <View style={styles.historyLoadingRow}>
                                        <ActivityIndicator size="small" />
                                        <Text style={styles.metricMuted}>
                                            {t('reorderAssist.loadingStockDecision')}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            <View style={styles.metricsRow}>
                                <Text style={styles.metric}>
                                    {t('reorderAssist.stock')}{' '}
                                    {stockIsReady
                                        ? `${item.currentStockQty} ${item.unit || ''}`
                                        : t('reorderAssist.loadingStockGlobal')}
                                </Text>
                                <Text style={styles.metric}>
                                    {t('reorderAssist.dailyUsage')}: {item.avgPerDay} {item.unit || ''}
                                </Text>
                                <Text style={styles.metric}>
                                    {t('reorderAssist.dailyUsage')} x 7: {item.avgPerWeek} {item.unit || ''}
                                </Text>
                                <Text style={styles.metric}>
                                    {t('reorderAssist.monthlyUsage')}: {item.avgPerMonth} {item.unit || ''}
                                </Text>
                                <Text style={styles.metric}>
                                    {t('reorderAssist.quarterlyUsage')}: {item.avgPerQuarter} {item.unit || ''}
                                </Text>
                                <Text style={styles.metric}>
                                    {t('reorderAssist.yearlyUsage')}: {item.avgPerYear} {item.unit || ''}
                                </Text>
                            </View>

                            <View style={styles.inlineEditorRow}>
                                <View style={styles.inlineEditorField}>
                                    <Text style={styles.labelSmall}>{t('reorderAssist.leadTime')}</Text>
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
                                    <Text style={styles.labelSmall}>{t('reorderAssist.safetyDays')}</Text>
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

                                <View style={styles.inlineEditorField}>
                                    <Text style={styles.labelSmall}>{t('raw.field.quantity')}</Text>
                                    <TextInput
                                        value={custom?.packSize != null ? String(custom.packSize) : ''}
                                        onChangeText={(value) =>
                                            updateProductSetting(item.article, 'packSize', value)
                                        }
                                        placeholder={String(Number(packSize) || 1)}
                                        keyboardType="numeric"
                                        style={styles.inputMini}
                                    />
                                </View>

                                <TouchableOpacity
                                    style={styles.resetButton}
                                    onPress={() => clearProductSettings(item.article)}
                                >
                                    <Text style={styles.resetButtonText}>{t('common.clear')}</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.metricsRow}>
                                <Text style={styles.metric}>
                                    {t('reorderAssist.leadTime')}: {item.leadTimeDays} {t('days')}
                                    {item.hasCustomLeadTime
                                        ? ` (${t('custom')})`
                                        : item.hasAutoLeadTime
                                            ? ` (${t('auto')})`
                                            : ''}
                                </Text>
                                <Text style={styles.metric}>
                                    {t('reorderAssist.safetyDays')}: {item.safetyDays} {t('days')}
                                    {item.hasCustomSafetyDays ? ` (${t('custom')})` : ''}
                                </Text>
                                <Text style={styles.metric}>
                                    {t('raw.field.quantity')}: {item.packSize}
                                    {item.hasCustomPackSize ? ` (${t('custom')})` : ''}
                                </Text>
                            </View>

                            {!item.hasCustomLeadTime && !item.hasAutoLeadTime ? (
                                isLoadingAutoLeadTime ? (
                                    <View style={styles.historyLoadingRow}>
                                        <ActivityIndicator size="small" />
                                        <Text style={styles.metricMutedIndented}>
                                            {t('fetchingLeadTimes')}
                                        </Text>
                                    </View>
                                ) : (
                                    <>
                                        <TouchableOpacity
                                            style={styles.inlineLoadButton}
                                            onPress={() => void fetchAutoLeadTimeForArticle(item.article)}
                                        >
                                            <Text style={styles.inlineLoadButtonText}>
                                                {autoLeadTimeError
                                                    ? `${t('common.retry')} ${t('reorderAssist.leadTime').toLowerCase()}`
                                                    : t('reorderAssist.fetchLeadTime')}
                                            </Text>
                                        </TouchableOpacity>
                                        {autoLeadTimeError ? (
                                            <Text style={styles.metricMutedIndented}>
                                                {t('common.error')}: {autoLeadTimeError}
                                            </Text>
                                        ) : null}
                                    </>
                                )
                            ) : null}

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

                            <View style={styles.historyBox}>
                                <View style={styles.titleWithHelpRow}>
                                    <Text style={styles.historyTitle}>
                                        {t('reorderAssist.latestOrdersAndDeliveries')}
                                    </Text>
                                    <HelpIconButton onPress={() => setHelpTopic('history')} />
                                </View>


                                {isLoadingPurchases ? (
                                    <View style={styles.historyLoadingRow}>
                                        <ActivityIndicator size="small" />
                                        <Text style={styles.metricMuted}>
                                            {t('reorderAssist.loadingOrderAndDeliveryHistory')}
                                        </Text>
                                    </View>
                                ) : purchaseHistory.length > 0 ? (
                                    purchaseHistory.map((entry, index) => {
                                        const purchaseOrderNo = getPurchaseOrderKey(entry);
                                        const purchaseOrderDate =
                                            (entry as any).orderDate || (entry as any).rowDate || undefined;
                                        const incomingRequestKey = purchaseOrderNo
                                            ? getIncomingRequestKey(item.article, purchaseOrderNo)
                                            : '';
                                        const rowIncomingDebug = incomingRequestKey
                                            ? recentIncomingDebug[incomingRequestKey]
                                            : undefined;
                                        const rowHasRequestedIncoming = incomingRequestKey
                                            ? requestedIncomingHistory[incomingRequestKey] === true
                                            : false;
                                        const rowIsLoadingIncoming = incomingRequestKey
                                            ? loadingIncomingHistory[incomingRequestKey] === true
                                            : false;

                                        const matchedIncoming = purchaseOrderNo
                                            ? incomingByBestnr[purchaseOrderNo] || []
                                            : [];

                                        return (
                                            <View
                                                key={`purchase-delivery-${item.article}-${index}`}
                                                style={styles.orderDeliveryBlock}
                                            >
                                                <Text style={styles.metricMuted}>
                                                    {index === 0 ? t('common.latest') : t('common.previous')}
                                                    : {t('reorderAssist.orderNumberShort')} {purchaseOrderNo || '-'} {' | '}
                                                    {(entry as any).orderDate || (entry as any).rowDate || '-'} {' | '}
                                                    {t('reorderAssist.orderedShort')} {(entry as any).orderedQty ?? '-'} {entry.unit || item.unit || ''} {' | '}
                                                    {t('reorderAssist.deliveredShort')} {(entry as any).deliveredQty ?? '-'} {entry.unit || item.unit || ''} {' | '}
                                                    {t('reorderAssist.remainingShort')} {(entry as any).restQty ?? '-'} {entry.unit || item.unit || ''}
                                                </Text>

                                                {matchedIncoming.length > 0 ? (
                                                    matchedIncoming.map((delivery, deliveryIndex) => (
                                                        <Text
                                                            key={`matched-delivery-${item.article}-${index}-${deliveryIndex}`}
                                                            style={styles.metricMutedIndented}
                                                        >
                                                            {deliveryIndex === 0
                                                                ? t('reorderAssist.matchingDelivery')
                                                                : t('reorderAssist.additionalDelivery')}
                                                            : {t('reorderAssist.deliveryDocumentShort')} {delivery.deliveryDocumentNumber || '-'} {' | '}
                                                            {delivery.deliveryDate || '-'} {' | '}
                                                            {t('reorderAssist.deliveredShort')} {delivery.deliveredQty ?? '-'} {delivery.unit || item.unit || ''} {' | '}
                                                            {delivery.supplierName || delivery.supplierNumber || ''}
                                                        </Text>
                                                    ))
                                                ) : purchaseOrderNo && rowIsLoadingIncoming ? (
                                                    <View style={styles.historyLoadingRow}>
                                                        <ActivityIndicator size="small" />
                                                        <Text style={styles.metricMutedIndented}>
                                                            {t('reorderAssist.loadingOrderAndDeliveryHistory')}
                                                        </Text>
                                                    </View>
                                                ) : purchaseOrderNo && !rowHasRequestedIncoming ? (
                                                    <TouchableOpacity
                                                        style={styles.inlineLoadButton}
                                                        onPress={() =>
                                                            void fetchMatchingDeliveryForArticle(
                                                                item.article,
                                                                purchaseOrderNo,
                                                                purchaseOrderDate
                                                            )
                                                        }
                                                    >
                                                        <Text style={styles.inlineLoadButtonText}>
                                                            {t('columns.show')} {t('reorderAssist.matchingDelivery').toLowerCase()}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ) : purchaseOrderNo && rowIncomingDebug?.error ? (
                                                    <TouchableOpacity
                                                        style={styles.inlineLoadButton}
                                                        onPress={() =>
                                                            void fetchMatchingDeliveryForArticle(
                                                                item.article,
                                                                purchaseOrderNo,
                                                                purchaseOrderDate
                                                            )
                                                        }
                                                    >
                                                        <Text style={styles.inlineLoadButtonText}>
                                                            {t('common.retry')} {t('reorderAssist.matchingDelivery').toLowerCase()}
                                                        </Text>
                                                    </TouchableOpacity>
                                                ) : purchaseOrderNo && rowHasRequestedIncoming ? (
                                                    <Text style={styles.metricMutedIndented}>
                                                        {t('reorderAssist.noMatchingIncomingForOrder')}
                                                    </Text>
                                                ) : (
                                                    <View />
                                                )}
                                            </View>
                                        );
                                    })
                                ) : (
                                    <Text style={styles.metricMuted}>
                                        {t('reorderAssist.noPurchaseHistoryFound')}
                                    </Text>
                                )}

                            </View>

                        </View>
                    );
                }}
                contentContainerStyle={styles.listContent}
            />

            <Modal
                visible={helpContent != null}
                transparent
                animationType="fade"
                onRequestClose={() => setHelpTopic(null)}
            >
                <View style={styles.helpModalOverlay}>
                    <View style={styles.helpModalCard}>
                        <View style={styles.helpModalHeader}>
                            <Text style={styles.helpModalTitle}>
                                {helpContent?.title}
                            </Text>
                            <TouchableOpacity
                                style={styles.helpModalCloseButton}
                                onPress={() => setHelpTopic(null)}
                            >
                                <Text style={styles.helpModalCloseButtonText}>{t('common.close')}</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator>
                            {helpContent?.sections.map((section, index) => (
                                <View key={`${section.title}-${index}`} style={styles.helpSection}>
                                    <Text style={styles.helpSectionTitle}>{section.title}</Text>
                                    {section.lines.map((line, lineIndex) => (
                                        <Text
                                            key={`${section.title}-${lineIndex}`}
                                            style={styles.helpSectionLine}
                                        >
                                            {'\u2022'} {line}
                                        </Text>
                                    ))}
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {Platform.OS !== 'web' && showFromPicker ? (
                <DateTimePicker
                    value={parseDateString(from) || new Date()}
                    mode="date"
                    display="default"
                    onChange={(_event, selectedDate) => {
                        setShowFromPicker(false);
                        if (selectedDate) {
                            setFrom(formatDateString(selectedDate));
                        }
                    }}
                />
            ) : null}

            {Platform.OS !== 'web' && showToPicker ? (
                <DateTimePicker
                    value={parseDateString(to) || new Date()}
                    mode="date"
                    display="default"
                    onChange={(_event, selectedDate) => {
                        setShowToPicker(false);
                        if (selectedDate) {
                            setTo(formatDateString(selectedDate));
                        }
                    }}
                />
            ) : null}
        </ScreenContainer>
    );
}

const styles = StyleSheet.create({
    listContent: {
        paddingBottom: 32,
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
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 4,
    },
    labelInline: {
        fontSize: 12,
        fontWeight: '600',
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
    selectFieldButton: {
        minHeight: 42,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: '#fff',
        justifyContent: 'center',
    },
    selectFieldText: {
        fontSize: 13,
        color: '#222',
    },
    selectFieldPlaceholder: {
        color: '#666',
    },
    activeChipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
    },
    activeFilterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        maxWidth: '100%',
        paddingLeft: 10,
        paddingRight: 6,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: '#b7d4f5',
        borderRadius: 999,
        backgroundColor: '#eef5ff',
    },
    activeFilterChipText: {
        flexShrink: 1,
        fontSize: 12,
        fontWeight: '600',
        color: '#0f4fa8',
    },
    activeFilterChipRemove: {
        width: 18,
        height: 18,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#d8e9ff',
    },
    activeFilterChipRemoveText: {
        fontSize: 11,
        fontWeight: '700',
        lineHeight: 12,
        color: '#0f4fa8',
    },
    inputCompactStepper: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 8,
        backgroundColor: '#fff',
        fontSize: 13,
        textAlign: 'center',
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
        gap: Platform.OS === 'web' ? 8 : 6,
    },
    statusRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Platform.OS === 'web' ? 8 : 6,
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
        flexWrap: 'wrap',
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
        marginLeft: 8,
        marginBottom: 10,
    },
    listFiltersSection: {
        marginBottom: 10,
        marginLeft: Platform.OS === 'web' ? 8 : 0,
    },
    listFilterGroup: {
        marginBottom: Platform.OS === 'web' ? 12 : 8,
    },
    listFilterLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#444',
        marginBottom: 6,
    },
    summaryText: {
        fontSize: 12,
        color: '#444',
    },
    infoText: {
        fontSize: 12,
        color: '#666',
        marginLeft: 8,
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
    helpIconButton: {
        width: 18,
        height: 18,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#1976d2',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#eef5ff',
    },
    helpIconText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#1976d2',
    },
    webshopText: {
        fontSize: 11,
        color: '#1976d2',
        marginTop: 4,
        fontWeight: '600',
    },
    metadataLoadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    metadataLoadingText: {
        fontSize: 11,
        color: '#5f6f87',
        fontStyle: 'italic',
    },
    webshopLoadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    webshopLoadingText: {
        fontSize: 11,
        color: '#5f6f87',
        fontStyle: 'italic',
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
    decisionLoading: {
        backgroundColor: '#fafafa',
        borderColor: '#d6d6d6',
    },
    titleWithHelpRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    decisionTitle: {
        fontSize: 13,
        fontWeight: '700',
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
        flexWrap: 'wrap',
    },
    inlineEditorField: {
        flex: 1,
        minWidth: 90,
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
    inlineLoadButton: {
        alignSelf: 'flex-start',
        marginTop: 4,
        marginLeft: 12,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: '#1976d2',
        borderRadius: 6,
        backgroundColor: '#fff',
    },
    inlineLoadButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#1976d2',
    },
    metric: {
        fontSize: 12,
        color: '#333',
    },
    metricMuted: {
        fontSize: 12,
        color: '#666',
    },
    metricMutedIndented: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
        marginLeft: 12,
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        overflow: 'hidden',
        fontSize: 11,
        fontWeight: '700',
        color: '#fff',
    },
    badgeLow: {
        backgroundColor: '#2e7d32',
    },
    badgeMedium: {
        backgroundColor: '#ef6c00',
    },
    badgeHigh: {
        backgroundColor: '#c62828',
    },
    badgeLoading: {
        backgroundColor: '#546e7a',
    },
    sortTitleLabel: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 6,
        marginLeft: 10,
    },
    advancedToggle: {
        marginBottom: 8,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        backgroundColor: '#fafafa',
    },
    advancedToggleText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#333',
    },
    advancedBox: {
        marginBottom: 8,
        padding: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 6,
        backgroundColor: '#fafafa',
    },
    advancedHint: {
        fontSize: 11,
        color: '#666',
        marginTop: 4,
    },
    datePickerButton: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 11,
        backgroundColor: '#fff',
    },
    datePickerButtonText: {
        fontSize: 13,
        color: '#222',
    },
    stepperRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    stepperButton: {
        width: 34,
        height: 34,
        borderWidth: 1,
        borderColor: '#1976d2',
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    stepperButtonText: {
        fontSize: 18,
        lineHeight: 20,
        fontWeight: '700',
        color: '#1976d2',
    },
    modalActionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 10,
        marginBottom: 10,
    },
    supplierModalList: {
        minHeight: 120,
        maxHeight: 360,
    },
    supplierOptionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 8,
        backgroundColor: '#fff',
        marginBottom: 8,
    },
    supplierOptionRowActive: {
        borderColor: '#1976d2',
        backgroundColor: '#eef5ff',
    },
    supplierOptionCheck: {
        fontSize: 12,
        fontWeight: '700',
        color: '#777',
        width: 16,
        textAlign: 'center',
    },
    supplierOptionCheckActive: {
        color: '#1976d2',
    },
    supplierOptionText: {
        flex: 1,
        fontSize: 13,
        color: '#222',
    },
    supplierOptionTextActive: {
        color: '#0f4fa8',
        fontWeight: '600',
    },
    historyBox: {
        marginTop: 8,
        marginBottom: 6,
        padding: 8,
        borderWidth: 1,
        borderColor: '#e5e5e5',
        borderRadius: 6,
        backgroundColor: '#fafafa',
    },
    historyTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#333',
    },
    helpModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        justifyContent: 'center',
        padding: 16,
    },
    helpModalCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        maxHeight: '82%',
    },
    helpModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
    },
    helpModalTitle: {
        flex: 1,
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    helpModalCloseButton: {
        borderWidth: 1,
        borderColor: '#1976d2',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#fff',
    },
    helpModalCloseButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1976d2',
    },
    helpSection: {
        marginBottom: 14,
    },
    helpSectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#111',
        marginBottom: 6,
    },
    helpSectionLine: {
        fontSize: 12,
        color: '#333',
        lineHeight: 18,
        marginBottom: 6,
    },
    historyLoadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    orderDeliveryBlock: {
        marginTop: 4,
        marginBottom: 6,
    },
});
