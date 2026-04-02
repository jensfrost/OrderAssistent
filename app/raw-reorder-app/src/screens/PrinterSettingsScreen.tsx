// screens/PrinterSettingsScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    ScrollView,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Platform,
    Alert,
    useWindowDimensions,
    Switch,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation } from '@react-navigation/native';
import { useI18n } from '../hooks/useI18n';
import { printLabel, type PrintLabelOptions } from '../utils/labelPrint';
import { SvgXml, Svg, Line } from 'react-native-svg';

import {
    DEFAULT_FULL,
    DEFAULT_MINI,
    renderFullPreviewSVG,
    renderMiniPreviewSVG,
    type LabelData,
    type TextLabels,
    resolveFull,
    resolveMini,
} from '../utils/labelLayout';

import {
    loadPrinterSettings,
    savePrinterSettings,
    upsertPrinter,
    removePrinter,
    makeNewPrinter,
    type PrinterSettings,
    type PrinterProfile,
} from '../utils/printerSettings';

type Mode = 'html' | 'zpl';
type Variant = 'full' | 'mini';

function nowLocalISOMinute() {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
        .replace('T', ' ');
}

/* ─────────────── Ikoner (SVG) så de alltid syns på web ─────────────── */
function IconMinusSVG() {
    return (
        <Svg width={18} height={18} viewBox="0 0 18 18">
            <Line x1="2" y1="9" x2="16" y2="9" stroke="black" strokeWidth="2" strokeLinecap="round" />
        </Svg>
    );
}
function IconPlusSVG() {
    return (
        <Svg width={18} height={18} viewBox="0 0 18 18">
            <Line x1="2" y1="9" x2="16" y2="9" stroke="black" strokeWidth="2" strokeLinecap="round" />
            <Line x1="9" y1="2" x2="9" y2="16" stroke="black" strokeWidth="2" strokeLinecap="round" />
        </Svg>
    );
}

/* ─────────────── Stepper ─────────────── */
function Stepper({
    value,
    setValue,
    step = 1,
    min = -Infinity,
    max = Infinity,
    width = 230,
    keyboardType = 'numeric',
}: {
    value: string;
    setValue: (v: string) => void;
    step?: number;
    min?: number;
    max?: number;
    width?: number | string;
    keyboardType?: 'numeric' | 'numbers-and-punctuation' | 'default';
}) {
    const parse = (s: string) => {
        const n = Number((s ?? '').toString().trim().replace(',', '.'));
        return Number.isFinite(n) ? n : 0;
    };
    const bump = (dir: 1 | -1) => {
        const n = parse(value);
        let next = n + dir * step;
        if (Number.isFinite(min)) next = Math.max(min, next);
        if (Number.isFinite(max)) next = Math.min(max, next);
        setValue(String(Math.round(next * 1000) / 1000));
    };

    const numericWidth = typeof width === 'number' ? width : undefined;
    const RESERVED = 40 + 1 + 1 + 40; // 82
    const inputExactWidth = numericWidth ? Math.max(60, numericWidth - RESERVED) : undefined;

    return (
        <View style={[styles.stepRow, numericWidth ? { width: numericWidth } : { width: '100%' }]}>
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="minus"
                onPress={() => bump(-1)}
                style={[styles.stepBtn, styles.stepBtnLeft, styles.stepBtnRaise]}
            >
                <IconMinusSVG />
            </TouchableOpacity>

            <View style={styles.stepDivider} />

            <TextInput
                style={[
                    styles.stepInput,
                    inputExactWidth != null
                        ? { width: inputExactWidth }
                        : { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 60 },
                ]}
                value={value}
                onChangeText={setValue}
                keyboardType={keyboardType}
            />

            <View style={styles.stepDivider} />

            <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="plus"
                onPress={() => bump(1)}
                style={[styles.stepBtn, styles.stepBtnRight, styles.stepBtnRaise]}
            >
                <IconPlusSVG />
            </TouchableOpacity>
        </View>
    );
}

/* ─────────────── Helpers för routes ─────────────── */
function ensureRoutes(s: any, fallbackPrinterId: string | null) {
    const routes = s?.routes ?? {};
    const mini = routes.mini ?? { printerId: fallbackPrinterId, includeQr: true };
    const full = routes.full ?? { printerId: fallbackPrinterId, includeQr: true };
    return { ...s, routes: { mini, full } };
}

function fixRoutesIfMissingPrinter(s: any) {
    const printers: PrinterProfile[] = s?.printers ?? [];
    const firstId = printers[0]?.id ?? null;
    const routes = s?.routes ?? {};
    const ok = (id: any) => !!id && printers.some((p) => p.id === id);

    const miniPrinterId = ok(routes?.mini?.printerId) ? routes.mini.printerId : firstId;
    const fullPrinterId = ok(routes?.full?.printerId) ? routes.full.printerId : firstId;

    return {
        ...s,
        routes: {
            mini: { includeQr: routes?.mini?.includeQr ?? true, printerId: miniPrinterId },
            full: { includeQr: routes?.full?.includeQr ?? true, printerId: fullPrinterId },
        },
    };
}

/* ─────────────── Skärmen ─────────────── */
const PrinterSettingsScreen: React.FC = () => {
    const navigation = useNavigation<any>();
    const { t } = useI18n();
    const { width: screenW } = useWindowDimensions();
    const isNarrow = screenW < 420;

    const [settings, setSettings] = useState<PrinterSettings | null>(null);

    // UI: vilken profil redigeras just nu (endast UI)
    const [editingPrinterId, setEditingPrinterId] = useState<string>('');

    const printers = useMemo(() => (settings?.printers ?? []) as PrinterProfile[], [settings]);

    const editingPrinter = useMemo(() => {
        if (!settings) return null;
        return printers.find((p) => p.id === editingPrinterId) ?? printers[0] ?? null;
    }, [settings, printers, editingPrinterId]);

    // Routes: vilken skrivare används för mini/full + QR flag
    const routeMini = settings?.routes?.mini;
    const routeFull = settings?.routes?.full;

    // Profilfält (redigerar alltid editingPrinter)
    const [printerName, setPrinterName] = useState('');

    const [mode, setMode] = useState<Mode>('html');
    const [backendUrl, setBackendUrl] = useState('');
    const [host, setHost] = useState('');
    const [port, setPort] = useState('9100');
    const [fieldSep, setFieldSep] = useState(';');

    // Backend auto-fit + shift
    const [backendAutoFit, setBackendAutoFit] = useState<boolean>(true);
    const [backendShiftDots, setBackendShiftDots] = useState<string>('-120');

    // FULL-layout
    const [f_labelWidthDots, setF_labelWidthDots] = useState(String(DEFAULT_FULL.labelWidthDots));
    const [f_leftMargin, setF_leftMargin] = useState(String(DEFAULT_FULL.leftMargin));
    const [f_qrTop, setF_qrTop] = useState('20');
    const [f_qrMag, setF_qrMag] = useState(String(DEFAULT_FULL.qrMag));
    const [f_qrBox, setF_qrBox] = useState(String(DEFAULT_FULL.qrBox));
    const [f_gap, setF_gap] = useState(String(DEFAULT_FULL.gap));
    const [f_fbMaxLines, setF_fbMaxLines] = useState(String(DEFAULT_FULL.fbMaxLines));
    const [f_fbLineSpacing, setF_fbLineSpacing] = useState(String(DEFAULT_FULL.fbLineSpacing));
    const [f_textTopAdjust, setF_textTopAdjust] = useState('20');

    // MINI-layout
    const [m_labelWidthDots, setM_labelWidthDots] = useState(String(DEFAULT_MINI.labelWidthDots));
    const [m_leftMargin, setM_leftMargin] = useState(String(DEFAULT_MINI.leftMargin));
    const [m_titleTop, setM_titleTop] = useState(String(DEFAULT_MINI.miniTitleTop));
    const [m_line2Top, setM_line2Top] = useState(String(DEFAULT_MINI.miniLine2Top));
    const [m_line3Top, setM_line3Top] = useState(String(DEFAULT_MINI.miniLine3Top));
    const [m_qrMag, setM_qrMag] = useState(String(DEFAULT_MINI.miniQrMag ?? 5));
    const [m_qrBox, setM_qrBox] = useState(String(DEFAULT_MINI.miniQrBox ?? 200));
    const [m_qrTop, setM_qrTop] = useState(String(DEFAULT_MINI.miniQrTop ?? 10));

    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState<'none' | 'full' | 'mini'>('none');

    // Previews
    const [previewFull, setPreviewFull] = useState('');
    const [previewMini, setPreviewMini] = useState('');
    const [saveFeedback, setSaveFeedback] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({
        type: 'idle',
    });

    useEffect(() => {
        navigation.setOptions({ title: t('printer.title') || 'Skrivare' });
    }, [navigation, t]);

    // ✅ Uppdatera profilen i settings direkt (så namn mm inte “tappar” vid save/reload)
    const patchEditingProfile = (patch: Partial<PrinterProfile>) => {
        setSettings((prev) => {
            if (!prev) return prev;
            const current = (prev.printers ?? []).find((p) => p.id === editingPrinterId) ?? (prev.printers ?? [])[0];
            if (!current) return prev;

            const nextProfile: PrinterProfile = { ...current, ...patch, id: current.id };
            return upsertPrinter(prev as any, nextProfile as any) as any;
        });
    };

    // Load settings
    useEffect(() => {
        (async () => {
            const raw = await loadPrinterSettings();

            const rawPrinters: PrinterProfile[] = (raw as any)?.printers ?? [];
            const firstId = rawPrinters[0]?.id ?? null;

            const withRoutes = ensureRoutes(raw as any, firstId);
            const fixed = fixRoutesIfMissingPrinter(withRoutes);

            const fixedPrinters: PrinterProfile[] = (fixed as any)?.printers ?? [];
            setSettings(fixed as any);

            setEditingPrinterId(fixedPrinters[0]?.id ?? '');
        })();
    }, []);

    // När editing-printer byts: fyll fält
    useEffect(() => {
        if (!settings || !editingPrinter) return;

        const P = editingPrinter;

        setPrinterName(P.name || '');

        setMode((P.mode as Mode) || 'html');
        setBackendUrl(P.backendUrl || '');
        setHost(P.host || '');
        setPort(String(P.port ?? '9100'));
        setFieldSep(P.fieldSep || ';');

        setBackendAutoFit(P.backendAutoFit ?? true);
        setBackendShiftDots(String(P.backendShiftDots ?? -120));

        const rawF = P.zplLayoutFull;
        let F = resolveFull(rawF || DEFAULT_FULL);

        const isUnset = (v: any) => v == null || v === '' || Number.isNaN(Number(v));
        if (isUnset(rawF?.qrTop) || Number(rawF?.qrTop) === 160) F.qrTop = 20;
        if (isUnset(rawF?.textTopAdjust) || Number(rawF?.textTopAdjust) === -6) F.textTopAdjust = 20;

        setF_labelWidthDots(String(F.labelWidthDots));
        setF_leftMargin(String(F.leftMargin));
        setF_qrTop(String(F.qrTop));
        setF_qrMag(String(F.qrMag));
        setF_qrBox(String(F.qrBox));
        setF_gap(String(F.gap));
        setF_fbMaxLines(String(F.fbMaxLines));
        setF_fbLineSpacing(String(F.fbLineSpacing));
        setF_textTopAdjust(String(F.textTopAdjust ?? 20));

        const rawM = P.zplLayoutMini;
        const M = resolveMini(rawM || DEFAULT_MINI);

        setM_labelWidthDots(String(M.labelWidthDots));
        setM_leftMargin(String(M.leftMargin));
        setM_titleTop(String(M.miniTitleTop));
        setM_line2Top(String(M.miniLine2Top));
        setM_line3Top(String(M.miniLine3Top));
        setM_qrMag(String(M.miniQrMag ?? DEFAULT_MINI.miniQrMag ?? 5));
        setM_qrBox(String(M.miniQrBox ?? DEFAULT_MINI.miniQrBox ?? 200));
        setM_qrTop(String(M.miniQrTop ?? DEFAULT_MINI.miniQrTop ?? 10));
    }, [settings, editingPrinterId, editingPrinter]);

    const toNum = (v: string, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);

    const parsedFull = useMemo(
        () => ({
            labelWidthDots: toNum(f_labelWidthDots, DEFAULT_FULL.labelWidthDots),
            leftMargin: toNum(f_leftMargin, DEFAULT_FULL.leftMargin),
            qrTop: toNum(f_qrTop, 20),
            qrMag: toNum(f_qrMag, DEFAULT_FULL.qrMag),
            qrBox: toNum(f_qrBox, DEFAULT_FULL.qrBox),
            gap: toNum(f_gap, DEFAULT_FULL.gap),
            fbMaxLines: toNum(f_fbMaxLines, DEFAULT_FULL.fbMaxLines),
            fbLineSpacing: toNum(f_fbLineSpacing, DEFAULT_FULL.fbLineSpacing),
            textTopAdjust: toNum(f_textTopAdjust, 20),
        }),
        [f_labelWidthDots, f_leftMargin, f_qrTop, f_qrMag, f_qrBox, f_gap, f_fbMaxLines, f_fbLineSpacing, f_textTopAdjust]
    );

    const parsedMini = useMemo(
        () => ({
            labelWidthDots: toNum(m_labelWidthDots, DEFAULT_MINI.labelWidthDots),
            leftMargin: toNum(m_leftMargin, DEFAULT_MINI.leftMargin),
            miniTitleTop: toNum(m_titleTop, DEFAULT_MINI.miniTitleTop),
            miniLine2Top: toNum(m_line2Top, DEFAULT_MINI.miniLine2Top),
            miniLine3Top: toNum(m_line3Top, DEFAULT_MINI.miniLine3Top),
            miniQrMag: toNum(m_qrMag, DEFAULT_MINI.miniQrMag ?? 6),
            miniQrBox: toNum(m_qrBox, DEFAULT_MINI.miniQrBox ?? 260),
            miniQrTop: toNum(m_qrTop, DEFAULT_MINI.miniQrTop ?? 10),
        }),
        [m_labelWidthDots, m_leftMargin, m_titleTop, m_line2Top, m_line3Top, m_qrMag, m_qrBox, m_qrTop]
    );

    const buildTestLabel = (): LabelData => ({
        header: {
            BRBATCH: 'TEST-123',
            BRARTS: 'TEST-ART',
            BRBBDT: new Date().toISOString().slice(0, 10),
            BRKVANT: 1,
        },
        productName: 'Testprodukt',
        lines: [
            { raw: 'R-100', name: 'Råvara A', quantity: 0.5, unit: 'kg' },
            { raw: 'R-200', name: 'Råvara B', quantity: 2, unit: 'st' },
            { raw: 'R-300', name: 'Råvara C', quantity: 0.25, unit: 'kg' },
        ],
        createdLocalISO: nowLocalISOMinute(),
    });

    const includeQrFull = settings?.routes?.full?.includeQr ?? true;
    const includeQrMini = settings?.routes?.mini?.includeQr ?? true;

    // Previews (observera: själva SVG-renderers bygger alltid QR i labelLayout.ts som du postade.
    // Vill du dölja QR i preview när includeQr=false behöver renderFullPreviewSVG/renderMiniPreviewSVG få stöd för includeQr.
    useEffect(() => {
        (async () => {
            const label = buildTestLabel();
            const textLabels: TextLabels = {
                batch: t('labels.batch') || 'Parti',
                bestBefore: t('labels.bestBefore') || 'Bäst före',
                quantity: t('labels.quantity') || 'Antal',
                created: t('labels.created') || 'Skapad',
                product: t('labels.product') || 'Artikel',
            };

            const availW = Math.max(220, Math.min(560, screenW - 32));

            try {
                const fullSvg = await renderFullPreviewSVG({
                    label,
                    fieldSep: fieldSep || ';',
                    textLabels,
                    layout: parsedFull as any,
                    displayWidthPx: Math.min(parsedFull.labelWidthDots, availW),
                    includeQr: includeQrFull,
                });
                setPreviewFull(fullSvg);
            } catch {
                setPreviewFull('');
            }

            try {
                const miniSvg = await renderMiniPreviewSVG({
                    label,
                    textLabels,
                    layout: parsedMini as any,
                    displayWidthPx: Math.min(parsedMini.labelWidthDots, availW),
                    includeQr: includeQrMini,
                });
                setPreviewMini(miniSvg);
            } catch {
                setPreviewMini('');
            }
        })();
    }, [
        t,
        fieldSep,
        screenW,
        includeQrFull,
        includeQrMini,
        parsedFull.labelWidthDots,
        parsedFull.leftMargin,
        parsedFull.qrTop,
        parsedFull.qrMag,
        parsedFull.qrBox,
        parsedFull.gap,
        parsedFull.fbMaxLines,
        parsedFull.fbLineSpacing,
        parsedFull.textTopAdjust,
        parsedMini.labelWidthDots,
        parsedMini.leftMargin,
        parsedMini.miniTitleTop,
        parsedMini.miniLine2Top,
        parsedMini.miniLine3Top,
        parsedMini.miniQrTop,
        parsedMini.miniQrBox,
        parsedMini.miniQrMag,
    ]);

    const onAddPrinter = () => {
        if (!settings) return;
        const p = makeNewPrinter(`Skrivare ${printers.length + 1}`);
        const next = upsertPrinter(settings as any, p as any);

        const firstId = (next as any)?.printers?.[0]?.id ?? p.id;
        const withRoutes = ensureRoutes(next, firstId);

        setSettings(withRoutes as any);
        setEditingPrinterId(p.id);

        // sätt UI-fält direkt
        setPrinterName(p.name || '');
    };

    const onDeleteEditing = () => {
        if (!settings) return;
        if (printers.length <= 1) {
            Alert.alert(t('common.error') || 'Fel', 'Du måste ha minst en skrivare.');
            return;
        }

        const id = editingPrinterId;
        const next = removePrinter(settings as any, id);

        const fixed = fixRoutesIfMissingPrinter(next);
        setSettings(fixed as any);

        const remaining = (fixed as any)?.printers ?? [];
        setEditingPrinterId(remaining[0]?.id ?? '');
    };

    const updateRoutePrinter = (variant: Variant, printerId: string) => {
        if (!settings) return;
        const next = {
            ...(settings as any),
            routes: {
                ...(settings as any).routes,
                [variant]: {
                    ...((settings as any).routes?.[variant] ?? {}),
                    printerId,
                },
            },
        };
        setSettings(next);
    };

    const updateRouteIncludeQr = (variant: Variant, includeQr: boolean) => {
        if (!settings) return;
        const next = {
            ...(settings as any),
            routes: {
                ...(settings as any).routes,
                [variant]: {
                    ...((settings as any).routes?.[variant] ?? {}),
                    includeQr,
                },
            },
        };
        setSettings(next);
    };

    const onSave = async () => {
        if (!settings || !editingPrinter) return;

        setSaving(true);
        setSaveFeedback({ type: 'idle' });

        try {
            const P0 = editingPrinter;

            const updatedProfile: PrinterProfile = {
                ...P0,
                id: P0.id,
                // ✅ trim + fallback, men viktigast: vi PATCHAR också settings live i onChangeText
                name: (printerName || P0.name || 'Skrivare').trim(),

                mode,
                backendUrl: backendUrl.trim(),
                host: host.trim(),
                port: (port || '').trim() || '9100',
                fieldSep: fieldSep || ';',

                zplLayoutFull: parsedFull as any,
                zplLayoutMini: parsedMini as any,

                backendAutoFit,
                backendShiftDots: Number(backendShiftDots),
            };

            const nextSettings = upsertPrinter(settings as any, updatedProfile as any);

            const fixed = fixRoutesIfMissingPrinter(
                ensureRoutes(nextSettings as any, (nextSettings as any)?.printers?.[0]?.id ?? null)
            );

            const saved = await savePrinterSettings(fixed as any);
            setSettings(saved as any);

            const msg = t('common.saved') || 'Sparat';
            if (Platform.OS !== 'web') Alert.alert(t('printer.title') || 'Skrivare', msg);
            setSaveFeedback({ type: 'success', message: msg });
        } catch (e: any) {
            const errTitle = t('common.error') || 'Fel';
            const errMsg = e?.message || (t('common.saveFailed') as string) || 'Kunde inte spara';
            if (Platform.OS !== 'web') Alert.alert(errTitle, errMsg);
            setSaveFeedback({ type: 'error', message: errMsg });
        } finally {
            setSaving(false);
        }
    };

    const testPrint = async (variant: Variant) => {
        if (!settings) return;

        const route = (settings as any)?.routes?.[variant];
        const printerId = route?.printerId;

        if (!printerId) {
            Alert.alert(t('common.error') || 'Fel', 'Ingen skrivare vald för denna etikett.');
            return;
        }

        const printer = printers.find((p) => p.id === printerId);
        if (!printer) {
            Alert.alert(t('common.error') || 'Fel', 'Vald skrivare finns inte längre.');
            return;
        }

        setTesting(variant);
        try {
            const label = buildTestLabel();
            const includeQr = !!route?.includeQr;

            const opts: PrintLabelOptions = {
                mode: (printer.mode as any) || 'html',
                backendUrl: (printer.backendUrl ?? '').trim(),
                fieldSep: printer.fieldSep || ';',
                variant,
                target: { host: (printer.host ?? '').trim() || undefined, port: (printer.port as any) || '9100' },

                printerHost: (printer.host ?? '').trim() || undefined,
                printerPort: Number(printer.port) || 9100,

                zplFullLayout: (printer.zplLayoutFull ?? parsedFull) as any,
                zplMiniLayout: (printer.zplLayoutMini ?? parsedMini) as any,

                backendAutoFit: printer.backendAutoFit ?? true,
                backendShiftDots: Number(printer.backendShiftDots ?? -120),

                // ✅ QR styrs av routen
                fullIncludeQr: variant === 'full' ? includeQr : (settings as any)?.routes?.full?.includeQr ?? true,
                miniIncludeQr: variant === 'mini' ? includeQr : (settings as any)?.routes?.mini?.includeQr ?? true,
            };

            await printLabel(label, opts);
            Alert.alert(t('common.ok') || 'OK', (t('printer.testSent') || 'Test skickad') + ` (${variant})`);
        } catch (e: any) {
            Alert.alert(
                t('printer.title') || 'Utskrift',
                e?.message || (t('printer.testFailed') as string) || 'Utskrift misslyckades'
            );
        } finally {
            setTesting('none');
        }
    };

    const SUGGEST_BACKEND = 'http://10.10.0.13:3001';
    const labelColWidth = isNarrow ? '100%' : 220;
    const stepperWidth: number | string = isNarrow ? '100%' : 230;

    if (!settings) {
        return (
            <View style={[styles.container, { padding: 16 }]}>
                <Text>{t('common.loading') || 'Laddar…'}</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.pageContent}>
            <Text style={styles.title}>{t('printer.title') || 'Skrivare'}</Text>

            {/* ── Skrivare per etikett (ROUTES) ───────────────────────────────── */}
            <View style={styles.backendBox}>
                <Text style={styles.subtitle}>{t('printer.routes.title') || 'Skrivare per etikett'}</Text>

                <Text style={styles.label}>{t('printer.routes.mini') || 'Kort etikett'}</Text>
                <View style={[styles.pickerWrap, isNarrow && { alignSelf: 'stretch' }]}>
                    <Picker
                        selectedValue={(routeMini as any)?.printerId ?? ''}
                        onValueChange={(v) => updateRoutePrinter('mini', String(v))}
                        mode="dropdown"
                        style={[styles.picker, isNarrow && { width: '100%' }]}
                    >
                        {printers.map((p) => (
                            <Picker.Item key={p.id} label={p.name || p.id} value={p.id} />
                        ))}
                    </Picker>
                </View>

                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                    <Text style={{ fontWeight: '600' }}>
                        {t('printer.qr.enabledMini') || 'Skriv ut QR-kod (kort etikett)'}
                    </Text>
                    <Switch value={includeQrMini} onValueChange={(v) => updateRouteIncludeQr('mini', v)} />
                </View>

                <View style={{ height: 12 }} />

                <Text style={styles.label}>{t('printer.routes.full') || 'Full etikett'}</Text>
                <View style={[styles.pickerWrap, isNarrow && { alignSelf: 'stretch' }]}>
                    <Picker
                        selectedValue={(routeFull as any)?.printerId ?? ''}
                        onValueChange={(v) => updateRoutePrinter('full', String(v))}
                        mode="dropdown"
                        style={[styles.picker, isNarrow && { width: '100%' }]}
                    >
                        {printers.map((p) => (
                            <Picker.Item key={p.id} label={p.name || p.id} value={p.id} />
                        ))}
                    </Picker>
                </View>

                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                    <Text style={{ fontWeight: '600' }}>
                        {t('printer.qr.enabledFull') || 'Skriv ut QR-kod (full etikett)'}
                    </Text>
                    <Switch value={includeQrFull} onValueChange={(v) => updateRouteIncludeQr('full', v)} />
                </View>

                <Text style={styles.hint}>
                    {t('printer.qr.hint') || 'Om QR är avstängd ska ingen QR skrivas ut.'}
                </Text>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                        style={[styles.btn, { backgroundColor: '#388E3C' }]}
                        onPress={() => testPrint('full')}
                        disabled={testing !== 'none'}
                    >
                        <Text style={styles.btnText}>
                            {testing === 'full' ? (t('printer.sending') || 'Skickar…') : (t('printer.testFull') || 'Testa full etikett')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.btn, { backgroundColor: '#00897B' }]}
                        onPress={() => testPrint('mini')}
                        disabled={testing !== 'none'}
                    >
                        <Text style={styles.btnText}>
                            {testing === 'mini' ? (t('printer.sending') || 'Skickar…') : (t('printer.testMini') || 'Testa kort etikett')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Flera skrivare (profiler) ───────────────────────────────── */}
            <View style={styles.backendBox}>
                <Text style={styles.subtitle}>{t('printer.printers') || 'Skrivare'}</Text>

                <Text style={styles.label}>{t('printer.editPrinter') || 'Redigera skrivare'}</Text>
                <View style={[styles.pickerWrap, isNarrow && { alignSelf: 'stretch' }]}>
                    <Picker
                        selectedValue={editingPrinterId || printers[0]?.id}
                        onValueChange={(v) => setEditingPrinterId(String(v))}
                        mode="dropdown"
                        style={[styles.picker, isNarrow && { width: '100%' }]}
                    >
                        {printers.map((p) => (
                            <Picker.Item key={p.id} label={p.name || p.id} value={p.id} />
                        ))}
                    </Picker>
                </View>

                <Text style={styles.label}>{t('printer.printerName') || 'Skrivarnamn'}</Text>
                <TextInput
                    style={[styles.input, isNarrow && { width: '100%' }]}
                    value={printerName}
                    onChangeText={(v) => {
                        // ✅ uppdatera både UI-state och settings-profilen direkt
                        setPrinterName(v);
                        patchEditingProfile({ name: v });
                    }}
                    placeholder="t.ex. Lager Zebra"
                />

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <TouchableOpacity style={[styles.btn, { backgroundColor: '#455A64' }]} onPress={onAddPrinter}>
                        <Text style={styles.btnText}>{t('printer.addPrinter') || 'Lägg till skrivare'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btn, { backgroundColor: '#B71C1C' }]} onPress={onDeleteEditing}>
                        <Text style={styles.btnText}>{t('printer.deletePrinter') || 'Ta bort skrivare'}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── Basinställningar (för redigerad skrivare) ───────────────── */}
            <Text style={styles.label}>{t('printer.mode') || 'Utskriftsläge'}</Text>
            <View style={[styles.pickerWrap, isNarrow && { alignSelf: 'stretch' }]}>
                <Picker
                    selectedValue={mode}
                    onValueChange={(v) => setMode(v as any)}
                    mode="dropdown"
                    dropdownIconColor={Platform.OS === 'android' ? '#333' : undefined}
                    style={[styles.picker, isNarrow && { width: '100%' }]}
                >
                    <Picker.Item label={t('printer.modeHtml') || 'Skriv ut html'} value="html" />
                    <Picker.Item label={t('printer.modeZpl') || 'Skriv ut ZPL'} value="zpl" />
                </Picker>
            </View>

            <Text style={styles.label}>{t('printer.backendUrl') || 'Backend-URL'}</Text>
            <View style={[styles.row, isNarrow && { flexDirection: 'column', alignItems: 'stretch', gap: 6 }]}>
                <TextInput
                    style={[styles.input, isNarrow ? { width: '100%' } : { flex: 1 }]}
                    placeholder={'http://localhost:7071'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={backendUrl}
                    onChangeText={setBackendUrl}
                />
                <TouchableOpacity
                    onPress={() => setBackendUrl(SUGGEST_BACKEND)}
                    style={[styles.btn, { backgroundColor: '#455A64' }, isNarrow ? { alignSelf: 'stretch' } : { marginLeft: 8 }]}
                >
                    <Text style={styles.btnText}>{t('printer.fillIn') || 'Fyll i'}</Text>
                </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
                {t('printer.backendHint') || 'API som tar emot ZPL (POST /print/zpl) och skickar till skrivaren.'}
            </Text>

            <Text style={styles.label}>{t('printer.ip') || 'Skrivar-IP/Värdnamn'}</Text>
            <TextInput
                style={[styles.input, isNarrow && { width: '100%' }]}
                placeholder="ZDesigner GX430t eller 10.10.0.50"
                autoCapitalize="none"
                autoCorrect={false}
                value={host}
                onChangeText={setHost}
            />

            <Text style={styles.label}>{t('printer.port') || 'Port'}</Text>
            <TextInput
                style={[styles.input, isNarrow && { width: '100%' }]}
                placeholder="9100"
                keyboardType="number-pad"
                value={port}
                onChangeText={setPort}
            />
            <Text style={styles.hint}>{t('printer.portHint') || 'Standard för Zebra är 9100 (RAW).'}</Text>

            <Text style={styles.label}>{t('printer.fieldSep') || 'Fältseparator (QR)'}</Text>
            <TextInput
                style={[styles.input, isNarrow && { width: '100%' }]}
                placeholder=";"
                value={fieldSep}
                onChangeText={setFieldSep}
                maxLength={1}
            />

            {/* Backend-centrering/justering */}
            <View style={[styles.backendBox]}>
                <Text style={[styles.subtitle]}>{t('printer.backend.section') || 'Backend-justering (server)'}</Text>

                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                    <Text style={{ fontWeight: '600' }}>{t('printer.backend.autoFit') || 'Auto-fit via skrivare'}</Text>
                    <Switch value={backendAutoFit} onValueChange={setBackendAutoFit} />
                </View>
                <Text style={styles.hint}>
                    {t('printer.backend.autoHint') || 'Läser faktisk etikettbredd från GX430t och centrerar utskriften.'}
                </Text>

                <Labeled inline={!isNarrow} label={t('printer.backend.shift') || 'Backend shift (dots)'} colWidth={labelColWidth}>
                    <Stepper
                        value={backendShiftDots}
                        setValue={setBackendShiftDots}
                        step={10}
                        min={-2000}
                        max={2000}
                        width={stepperWidth}
                        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                    />
                </Labeled>
                <Text style={styles.hint}>
                    {t('printer.backend.shiftHint') ||
                        'Negativt = flytta åt höger, positivt = vänster. Används som fallback eller för finjustering.'}
                </Text>
            </View>

            {/* FULL layout + preview */}
            <View style={[styles.zplRow, Platform.OS === 'web' ? { flexDirection: 'row' } : { flexDirection: 'column' }]}>
                <View style={[styles.zplFormCol, Platform.OS !== 'web' && { minWidth: 0, maxWidth: '100%' }]}>
                    <Text style={[styles.subtitle, { marginTop: 16 }]}>{t('printer.fullTitle') || 'Full etikett (QR + rader)'}</Text>

                    <Labeled inline={!isNarrow} label={t('printer.full.labelWidth') || 'Etikettbredd (dots)'} colWidth={labelColWidth}>
                        <Stepper value={f_labelWidthDots} setValue={setF_labelWidthDots} step={10} min={200} max={4000} width={stepperWidth} />
                    </Labeled>
                    <Labeled inline={!isNarrow} label={t('printer.full.leftMargin') || 'Vänstermarginal (dots)'} colWidth={labelColWidth}>
                        <Stepper value={f_leftMargin} setValue={setF_leftMargin} step={2} min={0} max={300} width={stepperWidth} />
                    </Labeled>
                    <Labeled inline={!isNarrow} label={t('printer.full.qrTop') || 'QR topp (dots)'} colWidth={labelColWidth}>
                        <Stepper value={f_qrTop} setValue={setF_qrTop} step={2} min={0} max={2000} width={stepperWidth} />
                    </Labeled>
                    <Labeled inline={!isNarrow} label={t('printer.full.qrMag') || 'QR magnifier (5–7)'} colWidth={labelColWidth}>
                        <Stepper value={f_qrMag} setValue={setF_qrMag} step={1} min={1} max={10} width={stepperWidth} />
                    </Labeled>
                    <Labeled inline={!isNarrow} label={t('printer.full.qrBox') || 'QR boxbredd (dots)'} colWidth={labelColWidth}>
                        <Stepper value={f_qrBox} setValue={setF_qrBox} step={5} min={80} max={2000} width={stepperWidth} />
                    </Labeled>
                    <Labeled inline={!isNarrow} label={t('printer.full.qrGap') || 'Gap TEXT→QR (dots)'} colWidth={labelColWidth}>
                        <Stepper value={f_gap} setValue={setF_gap} step={1} min={0} max={400} width={stepperWidth} />
                    </Labeled>
                    <Labeled inline={!isNarrow} label={t('printer.full.maxLines') || 'Maxrader (text)'} colWidth={labelColWidth}>
                        <Stepper value={f_fbMaxLines} setValue={setF_fbMaxLines} step={1} min={1} max={50} width={stepperWidth} />
                    </Labeled>
                    <Labeled inline={!isNarrow} label={t('printer.full.lineSpacing') || 'Radavstånd (dots)'} colWidth={labelColWidth}>
                        <Stepper value={f_fbLineSpacing} setValue={setF_fbLineSpacing} step={1} min={12} max={80} width={stepperWidth} />
                    </Labeled>
                    <Labeled inline={!isNarrow} label={t('printer.full.textTopAdjust') || 'Text topp-justering (±dots)'} colWidth={labelColWidth}>
                        <Stepper
                            value={f_textTopAdjust}
                            setValue={setF_textTopAdjust}
                            step={1}
                            min={-80}
                            max={80}
                            width={stepperWidth}
                            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                        />
                    </Labeled>

                    <View style={{ height: 8 }} />
                    {Platform.OS === 'web' ? (
                        <View style={[styles.previewBox]}>
                            <div
                                style={{
                                    display: 'inline-block',
                                    border: '1px solid #ddd',
                                    padding: 8,
                                    borderRadius: 8,
                                    background: '#fafafa',
                                    overflowX: 'auto',
                                }}
                                dangerouslySetInnerHTML={{ __html: previewFull || '<div style="color:#888">Ingen förhandsvisning</div>' }}
                            />
                        </View>
                    ) : (
                        <View style={[styles.previewBox]}>
                            {previewFull ? <SvgXml xml={previewFull} /> : <Text style={styles.hint}>Ingen förhandsvisning</Text>}
                        </View>
                    )}
                </View>
            </View>

            {/* MINI layout + preview */}
            <View style={[styles.zplRow, Platform.OS === 'web' ? { flexDirection: 'row' } : { flexDirection: 'column' }]}>
                <View style={[styles.zplFormCol, Platform.OS !== 'web' && { minWidth: 0, maxWidth: '100%' }]}>
                    <Text style={[styles.subtitle, { marginTop: 16 }]}>{t('printer.miniTitle') || 'Kort etikett (Parti/Artikel/Bäst före)'}</Text>

                    <Labeled inline={!isNarrow} label={t('printer.mini.labelWidth') || 'Etikettbredd (dots)'} colWidth={labelColWidth}>
                        <Stepper value={m_labelWidthDots} setValue={setM_labelWidthDots} step={10} min={200} max={4000} width={stepperWidth} />
                    </Labeled>
                    <Labeled inline={!isNarrow} label={t('printer.mini.leftMargin') || 'Vänstermarginal (dots)'} colWidth={labelColWidth}>
                        <Stepper value={m_leftMargin} setValue={setM_leftMargin} step={2} min={0} max={300} width={stepperWidth} />
                    </Labeled>
                    <Labeled inline={!isNarrow} label={t('printer.mini.titleTop') || 'Parti (top, dots)'} colWidth={labelColWidth}>
                        <Stepper value={m_titleTop} setValue={setM_titleTop} step={2} min={0} max={2000} width={stepperWidth} />
                    </Labeled>
                    <Labeled inline={!isNarrow} label={t('printer.mini.line2Top') || 'Artikel (top, dots)'} colWidth={labelColWidth}>
                        <Stepper value={m_line2Top} setValue={setM_line2Top} step={2} min={0} max={2000} width={stepperWidth} />
                    </Labeled>
                    <Labeled inline={!isNarrow} label={t('printer.mini.line3Top') || 'Bäst före (top, dots)'} colWidth={labelColWidth}>
                        <Stepper value={m_line3Top} setValue={setM_line3Top} step={2} min={0} max={2000} width={stepperWidth} />
                    </Labeled>

                    <Labeled inline={!isNarrow} label={t('printer.mini.qrMag') || 'QR-förstoring (mini)'} colWidth={labelColWidth}>
                        <Stepper
                            value={m_qrMag}
                            setValue={setM_qrMag}
                            step={1}
                            min={2}
                            max={12}
                            width={stepperWidth}
                            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                        />
                    </Labeled>

                    <Labeled inline={!isNarrow} label={t('printer.mini.qrBox') || 'QR boxbredd (mini)'} colWidth={labelColWidth}>
                        <Stepper value={m_qrBox} setValue={setM_qrBox} step={5} min={80} max={2000} width={stepperWidth} />
                    </Labeled>

                    <Labeled inline={!isNarrow} label={t('printer.mini.qrTop') || 'QR topp (mini)'} colWidth={labelColWidth}>
                        <Stepper value={m_qrTop} setValue={setM_qrTop} step={2} min={0} max={2000} width={stepperWidth} />
                    </Labeled>

                    <View style={{ height: 8 }} />
                    {Platform.OS === 'web' ? (
                        <View style={[styles.previewBox]}>
                            <div
                                style={{
                                    display: 'inline-block',
                                    border: '1px solid #ddd',
                                    padding: 8,
                                    borderRadius: 8,
                                    background: '#fafafa',
                                    overflowX: 'auto',
                                }}
                                dangerouslySetInnerHTML={{ __html: previewMini || '<div style="color:#888">Ingen förhandsvisning</div>' }}
                            />
                        </View>
                    ) : (
                        <View style={[styles.previewBox]}>
                            {previewMini ? <SvgXml xml={previewMini} /> : <Text style={styles.hint}>Ingen förhandsvisning</Text>}
                        </View>
                    )}
                </View>
            </View>

            <View style={{ height: 16 }} />
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#1976D2' }]} onPress={onSave} disabled={saving}>
                <Text style={styles.btnText}>{saving ? (t('common.saving') || 'Sparar…') : (t('common.save') || 'Spara')}</Text>
            </TouchableOpacity>

            {saveFeedback.type === 'success' && <Text style={{ marginTop: 8, color: '#2e7d32', fontSize: 12 }}>{saveFeedback.message}</Text>}
            {saveFeedback.type === 'error' && <Text style={{ marginTop: 8, color: '#c62828', fontSize: 12 }}>{saveFeedback.message}</Text>}

            <View style={{ height: 16 }} />
            <Text style={styles.help}>
                {t('printer.note') || 'Obs! Du väljer skrivare per etikett här. På andra sidor ska ingen skrivare väljas.'}
            </Text>
        </ScrollView>
    );
};

function Labeled({
    label,
    children,
    inline,
    colWidth,
}: {
    label: string;
    children: React.ReactNode;
    inline?: boolean;
    colWidth?: number | string;
}) {
    if (inline) {
        return (
            <View style={styles.row}>
                <Text style={[styles.label, { marginTop: 0, marginBottom: 0, width: colWidth }]}>{label}</Text>
                <View>{children}</View>
            </View>
        );
    }
    return (
        <View style={[styles.row, { flexDirection: 'column', alignItems: 'stretch' }]}>
            <Text style={[styles.label, { marginTop: 0, marginBottom: 6 }]}>{label}</Text>
            <View style={{ width: '100%' }}>{children}</View>
        </View>
    );
}

export default PrinterSettingsScreen;

/* ─────────────── Styles ─────────────── */
const styles = StyleSheet.create({
    container: { flex: 1 },
    pageContent: { padding: 16 },

    title: { fontSize: 18, lineHeight: 30, fontWeight: '700', marginBottom: 12 },
    subtitle: { fontSize: 16, lineHeight: 26, fontWeight: '700', marginBottom: 8 },
    label: { lineHeight: 22, fontWeight: '600', marginTop: 12, marginBottom: 6 },

    pickerWrap: {
        alignSelf: 'flex-start',
        minWidth: 220,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        overflow: 'hidden',
    },
    picker: {
        minWidth: 220,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
    },

    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        paddingHorizontal: 10,
        paddingVertical: Platform.OS === 'ios' ? 8 : 10,
        borderRadius: 6,
        backgroundColor: '#fff',
    },

    row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6, flexWrap: 'wrap' },

    zplRow: { marginTop: 12, gap: 16, alignItems: 'flex-start' },
    zplFormCol: { flex: 1, minWidth: 320, maxWidth: 680 },

    hint: { fontSize: 12, color: '#666', marginTop: 4 },
    help: { fontSize: 12, color: '#444', marginTop: 10 },

    btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 6, alignSelf: 'flex-start' },
    btnText: { color: '#fff', fontWeight: '700' },

    stepRow: {
        position: 'relative',
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#ccc',
        backgroundColor: '#fff',
        overflow: 'hidden',
    },
    stepBtn: {
        width: 40,
        height: Platform.OS === 'ios' ? 36 : 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f0f0f0',
        borderColor: '#ccc',
    },
    stepBtnLeft: { borderRightWidth: 1, borderRightColor: '#ccc' },
    stepBtnRight: { borderLeftWidth: 1, borderLeftColor: '#ccc' },
    stepBtnRaise: { position: 'relative', zIndex: 2 },
    stepInput: { paddingHorizontal: 10, paddingVertical: Platform.OS === 'ios' ? 6 : 8, backgroundColor: '#fff', zIndex: 1 },
    stepDivider: { width: 1, alignSelf: 'stretch', backgroundColor: '#ccc' },

    previewBox: {
        borderWidth: 1,
        borderColor: '#ddd',
        backgroundColor: '#fafafa',
        borderRadius: 8,
        padding: 8,
        alignSelf: 'stretch',
    },

    backendBox: {
        marginTop: 16,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 8,
        backgroundColor: '#fafafa',
    },
});
