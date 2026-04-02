// components/NoteListItem.tsx
import React, { useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Pressable,
    TextInput,
} from 'react-native';
import styles from '../screens/RawRegScreenStyles';

type PrefetchStatus = 'idle' | 'inflight' | 'ready_ok' | 'ready_err';

type Props = {
    item: any;
    importedInfo: any;
    prefetchStatus: Record<string, PrefetchStatus>;
    hasPrefetchedRows: boolean;

    // inline-rader
    rows?: any[];
    rowSelection?: Record<string, boolean>;
    expanded?: boolean;

    // callbacks
    onToggleExpand?: (note: any) => void;
    onToggleRowSelection?: (note: any, row: any) => void;
    onPressRow?: (note: any) => void; // fallback om man använder komponenten på annat ställe
    onPressFetchRows: (note: any) => void;
    onImportSelectedRows?: (note: any) => void;

    formatQtySummary: (qty: Record<string, number>) => string;
    t: (key: string, vars?: any) => string;
    validArticleCodes: Set<string>;
    canImportRow: (note: any, row: any) => boolean;

    // ✅ NYTT: batch per rad (rowKey => batch)
    batchByRowKey?: Record<string, string>;
    onChangeBatch?: (rowKey: string, val: string) => void;
    importedRowsByRegnr: Record<string, Record<string, { batch?: string }>>;
};

const statusDotColor = (s?: PrefetchStatus) => {
    switch (s) {
        case 'inflight': return '#1976d2';
        case 'ready_ok': return '#2e7d32';
        case 'ready_err': return '#d32f2f';
        case 'idle':
        default: return '#9e9e9e';
    }
};

function rowKeyOf(row: any) {
    return String(
        row.id ??
        row.rowIndex ??
        row.rownumber ??
        row.row_number ??
        row.line_no ??
        ''
    );
}

function rowArticleOf(row: any) {
    return String(
        row.article_number ??
        row.articleNumber ??
        row.artikelnr ??
        row.RWARTN ??
        ''
    ).trim();
}

function rowBatchFromRow(row: any) {
    // Om Visma redan skickar batch på raden någon gång:
    return String(
        row.batch ??
        row.batchnr ??
        row.batch_number ??
        row.BATCHNR ??
        row.RWBATCHNR ??
        ''
    ).trim();
}

const NoteListItem = React.memo(function NoteListItem({
    item,
    importedInfo,
    prefetchStatus,
    hasPrefetchedRows,
    rows,
    rowSelection,
    expanded,
    onToggleExpand,
    onToggleRowSelection,
    onPressRow,
    onPressFetchRows,
    onImportSelectedRows,
    t,
    validArticleCodes,
    canImportRow,
    batchByRowKey,
    onChangeBatch,
    importedRowsByRegnr,
}: Props) {
    // 🔹 1) Importerade rader (från din egen tabell)
    const doneImported = importedInfo?.rows ?? 0;

    // 🔹 2) Hämtade rader (i cache/IncomingNoteRows)
    const fetchedCount =
        (Array.isArray(rows) ? rows.length : undefined) ??
        (typeof item.cachedRowCount === 'number' ? item.cachedRowCount : 0);

    // 🔹 3) Totalt antal i Visma (row_count/nrows eller fallback)
    const vismaTotalRaw =
        (typeof item.row_count === 'number' && item.row_count >= 0
            ? item.row_count
            : undefined) ??
        (typeof item.nrows === 'number' && item.nrows >= 0
            ? item.nrows
            : undefined) ??
        fetchedCount;

    const vismaTotal = vismaTotalRaw ?? 0;

    // Rad-text: Importerade / Hämtade / Totalt i Visma
    const rowsLabel =
        t('raw.rowsSummaryLabel', {
            imported: doneImported,
            fetched: fetchedCount,
            total: vismaTotal,
        }) ||
        `${doneImported} / ${fetchedCount} / ${vismaTotal} rader`;

    // Badge-status – baserad på importerade vs totalt i Visma
    const isFull = vismaTotal > 0 && doneImported >= vismaTotal;
    const isNone = doneImported === 0;
    const badgeBg = isFull
        ? '#2e7d32'
        : isNone
            ? '#9e9e9e'
            : '#ef6c00';
    const badgeText = isFull
        ? (t('common.done') || 'Klar')
        : isNone
            ? (t('common.notImported') || 'Inte importerad')
            : (t('common.partial') || 'Delvis importerad');

    const key = String(item.regnr || '');

    // Prefetch-status för rad-knapp
    let pst: PrefetchStatus = prefetchStatus?.[key] || 'idle';
    if (pst === 'idle' && hasPrefetchedRows) {
        pst = 'ready_ok';
    }

    let fetchBtnText: string;
    if (pst === 'inflight') {
        fetchBtnText = t('common.loading') || 'Hämtar…';
    } else if (pst === 'ready_err') {
        fetchBtnText = t('raw.fetchRowsAgain') || 'Försök igen';
    } else if (pst === 'ready_ok' || hasPrefetchedRows) {
        fetchBtnText = t('raw.importRows') || 'Importera rader';
    } else {
        fetchBtnText = t('raw.fetchRows') || 'Hämta rader';
    }

    const regnrLabel = item.regnr
        ? t('raw.regnrLabel', { regnr: item.regnr })
        : t('raw.noRegnr');

    const docNumber = item.doc_number ?? item.displayRegnr ?? '';
    const docLabel = docNumber
        ? t('raw.deliveryLabel', { docNumber }) // "Följesedel #{{docNumber}}"
        : '';

    const supplierLabel = item.supplier_name || item.supplier_no || '';
    const dateLabel = item.date || '';

    const handlePressHeader = () => {
        // I importlistan vill vi expandera rader under headen
        if (onToggleExpand) {
            onToggleExpand(item);
        } else if (onPressRow) {
            // fallback, om komponenten används någon annanstans
            onPressRow(item);
        }
    };

    // ✅ status per rad
    const rowStats = useMemo(() => {
        const list = Array.isArray(rows) ? rows : [];
        let importable = 0;
        let alreadyImported = 0;
        let unknownArticle = 0;

        for (const r of list) {
            const art = rowArticleOf(r);
            const known = !!art && validArticleCodes.has(art);

            if (!known) {
                unknownArticle += 1;
                continue;
            }

            // canImportRow = (känd artikel) && (!existsDuplicate)
            if (canImportRow(item, r)) importable += 1;
            else alreadyImported += 1;
        }

        return { importable, alreadyImported, unknownArticle, total: list.length };
    }, [rows, validArticleCodes, item, canImportRow]);

    const selectedImportableCount = useMemo(() => {
        const list = Array.isArray(rows) ? rows : [];
        let n = 0;
        for (const r of list) {
            const rk = rowKeyOf(r);
            if (!rk) continue;
            if (!canImportRow(item, r)) continue; // räkna bara valbara
            if (rowSelection?.[rk]) n += 1;
        }
        return n;
    }, [rows, rowSelection, item, canImportRow]);

    const rowsSummaryDetail =
        t('raw.rowsImportabilitySummary', {
            importable: rowStats.importable,
            already: rowStats.alreadyImported,
            unknown: rowStats.unknownArticle,
            total: rowStats.total,
        }) ||
        `${rowStats.importable} kan importeras, ${rowStats.alreadyImported} redan importerade` +
        (rowStats.unknownArticle > 0 ? `, ${rowStats.unknownArticle} saknas i ARTREG` : '') +
        ` (totalt ${rowStats.total})`;

    return (
        <View
            style={{
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderColor: '#ddd',
            }}
        >
            {/* HEADER / HEAD-RADEN */}
            <Pressable onPress={handlePressHeader}>
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    {/* Vänster: Regnr + Följesedel + leverantör + datum */}
                    <View style={{ flex: 1, paddingRight: 8 }}>
                        {/* Rad 1: Regnr + status-dot */}
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View
                                style={[
                                    styles.statusDot,
                                    { backgroundColor: statusDotColor(pst) },
                                ]}
                            />
                            <Text
                                style={{ fontWeight: '600' }}
                                numberOfLines={1}
                            >
                                {regnrLabel}
                            </Text>
                        </View>

                        {/* Rad 2: Följesedel (om finns) */}
                        {docLabel ? (
                            <Text
                                style={{ fontSize: 12, color: '#555', marginTop: 2 }}
                                numberOfLines={1}
                            >
                                {docLabel}
                            </Text>
                        ) : null}

                        {/* Rad 3: Leverantör */}
                        {supplierLabel ? (
                            <Text
                                style={{ fontSize: 12, color: '#555', marginTop: 2 }}
                                numberOfLines={1}
                            >
                                {supplierLabel}
                            </Text>
                        ) : null}

                        {/* Rad 4: Datum */}
                        {dateLabel ? (
                            <Text
                                style={{ fontSize: 12, color: '#555', marginTop: 2 }}
                                numberOfLines={1}
                            >
                                {dateLabel}
                            </Text>
                        ) : null}

                        {/* Rad 5: Importerade / Hämtade / Totalt i Visma */}
                        <Text
                            style={{ fontSize: 12, color: '#555', marginTop: 2 }}
                            numberOfLines={1}
                        >
                            {rowsLabel}
                        </Text>

                        {/* ✅ import-status för rader */}
                        {expanded && Array.isArray(rows) && rows.length > 0 && (
                            <Text
                                style={{ fontSize: 11, color: '#666', marginTop: 2 }}
                                numberOfLines={2}
                            >
                                {rowsSummaryDetail}
                            </Text>
                        )}
                    </View>

                    {/* Höger: badge + knapp för rader */}
                    <View style={{ alignItems: 'flex-end' }}>
                        {/* Badge "Klar / Inte importerad / Delvis" */}
                        <View
                            style={{
                                backgroundColor: badgeBg,
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 12,
                                marginBottom: 6,
                            }}
                        >
                            <Text
                                style={{
                                    color: '#fff',
                                    fontSize: 11,
                                    fontWeight: '600',
                                }}
                            >
                                {badgeText}
                            </Text>
                        </View>

                        {/* Hämta/Importera rader-knapp */}
                        <TouchableOpacity
                            style={styles.fetchRowsBtnInline}
                            onPress={() => {
                                if (pst === 'inflight') return;

                                if (pst === 'ready_ok' || hasPrefetchedRows) {
                                    // Har redan rader → expandera/fäll ihop
                                    onToggleExpand?.(item);
                                } else {
                                    // Första gången → hämta rader
                                    onPressFetchRows(item);
                                }
                            }}
                        >
                            <Text style={styles.fetchRowsBtnText}>{fetchBtnText}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Pressable>

            {/* 🔽 Expanderade rader under head */}
            {expanded && Array.isArray(rows) && rows.length > 0 && (
                <View style={{ marginTop: 8, paddingLeft: 24 }}>
                    {rows.map((row: any) => {
                        const rowKey = rowKeyOf(row);
                        const checked = !!rowSelection?.[rowKey];

                        const article = rowArticleOf(row);
                        const descr =
                            row.description ??
                            row.benamning ??
                            row.text ??
                            '';
                        const qty =
                            row.quantity ??
                            row.quantity1 ??
                            '';
                        const unit =
                            row.unit ??
                            row.enh ??
                            '';

                        const known = !!article && validArticleCodes.has(String(article));
                        const allowed = known && canImportRow(item, row);
                        const importedBatch =
                        importedRowsByRegnr?.[String(item.regnr || '')]?.[article]?.batch || '';

                        // ✅ status-text per rad
                        const rowStatusText = !known
                        ? (t('raw.rowMissingArticle') || 'Saknas i ARTREG')
                        : allowed
                        ? (t('raw.rowCanImport') || 'Kan importeras')
                        : (
                            (t('raw.rowAlreadyImported') || 'Redan importerad') +
                            (importedBatch ? ` (${t('raw.field.batch') || 'Batch'}: ${importedBatch})` : ''));

                            const rowStatusIcon = !known ? '⚠️' : allowed ? '✅' : '🚫';
                            const disabled = !allowed;

                            // ✅ batch: från state om finns, annars ev från row (om du senare får batch från API)
                            const batchFromState = (batchByRowKey && rowKey) ? (batchByRowKey[rowKey] ?? '') : '';
                            const batchFallback = rowBatchFromRow(row);
                            const batchValue = batchFromState || batchFallback || '';
                            const regKey = String(item.regnr || '');

                        return (
                            <View
                                key={rowKey || `${article}-${descr}-${qty}-${unit}`}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'flex-start',
                                    marginBottom: 10,
                                    opacity: disabled ? 0.45 : 1,
                                }}
                            >
                                {/* Checkbox (inaktiv om disabled) */}
                                <TouchableOpacity
                                    disabled={disabled}
                                    onPress={() => {
                                        if (disabled) return;
                                        onToggleRowSelection?.(item, row);
                                    }}
                                    style={{
                                        width: 22,
                                        height: 22,
                                        borderRadius: 4,
                                        borderWidth: 1,
                                        borderColor: disabled ? '#ccc' : '#666',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginRight: 8,
                                        marginTop: 2,
                                        backgroundColor: checked ? '#1976d2' : '#fff',
                                    }}
                                >
                                    {checked && (
                                        <Text
                                            style={{
                                                color: '#fff',
                                                fontSize: 14,
                                                fontWeight: 'bold',
                                            }}
                                        >
                                            ✓
                                        </Text>
                                    )}
                                </TouchableOpacity>

                                {/* Rad-info + batch-input */}
                                <View style={{ flex: 1 }}>
                                    <Text
                                        style={{ fontSize: 13, fontWeight: '500' }}
                                        numberOfLines={1}
                                    >
                                        {article}{' '}
                                        {descr ? `– ${descr}` : ''}
                                    </Text>

                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 12, color: '#555' }}>
                                            {qty} {unit}
                                        </Text>

                                        <Text style={{ fontSize: 11, color: '#666', marginLeft: 10 }}>
                                            {rowStatusIcon} {rowStatusText}
                                        </Text>
                                    </View>

                                    {/* ✅ Batch per rad (endast om raden får importeras) */}
                                    {allowed && !!onChangeBatch && (
                                        <View style={{ marginTop: 6 }}>
                                            <Text style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
                                                {t('raw.field.batch') || 'Batch'}
                                            </Text>
                                            <TextInput
                                                value={batchValue}
                                                onChangeText={(val) => onChangeBatch(String(rowKey), val)}
                                                placeholder={t('raw.field.batch') || 'Batchnummer…'}
                                                autoCorrect={false}
                                                autoCapitalize="none"
                                                style={{
                                                    borderWidth: 1,
                                                    borderColor: '#ccc',
                                                    borderRadius: 8,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 8,
                                                    fontSize: 13,
                                                    backgroundColor: '#fff',
                                                }}
                                            />
                                        </View>
                                    )}
                                </View>
                            </View>
                        );
                    })}

                    {/* ✅ Import-knapp: bara om det finns VALBARA+VALDA rader */}
                    {onImportSelectedRows && (
                        <TouchableOpacity
                            style={{
                                marginTop: 6,
                                alignSelf: 'flex-start',
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                backgroundColor: selectedImportableCount > 0 ? '#1976d2' : '#9e9e9e',
                                borderRadius: 6,
                            }}
                            onPress={() => {
                                if (selectedImportableCount <= 0) return;
                                onImportSelectedRows(item);
                            }}
                            disabled={selectedImportableCount <= 0}
                        >
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                                {(t('raw.importSelected') || 'Importera valda rader')}{' '}
                                {selectedImportableCount > 0 ? `(${selectedImportableCount})` : ''}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </View>
    );
});

export default NoteListItem;
