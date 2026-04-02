// components/Select.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Pressable,
    FlatList,
    Modal,
    Platform,
    StyleSheet,
} from 'react-native';
import ReactDOM from 'react-dom';
import { useI18n } from '../hooks/useI18n';

export type SelectItem = { value: string | number; label: string };

type Props = {
    items: SelectItem[];
    value: string | number | null;
    onChange: (v: string | number | null) => void;

    // Alla texter kommer in via props (inga defaults):
    title?: string;
    placeholder?: string;
    searchPlaceholder?: string;
    noResultsText?: string;
    closeLabel?: string;

    // Beteenden:
    includePlaceholder?: boolean; // placeholder-rad i listan (används bara om placeholder finns)
    showDotOnSelected?: boolean;

    style?: any;
    testID?: string;
};

const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    if (Platform.OS !== 'web' || !ReactDOM?.createPortal) return <>{children}</>;
    return ReactDOM.createPortal(children as any, document.body);
};

const MAX_HEIGHT = 320;

const SelectInner: React.FC<Props> = ({
    items,
    value,
    onChange,
    title,
    placeholder,
    searchPlaceholder,
    noResultsText,
    closeLabel,
    includePlaceholder = true,
    showDotOnSelected = true,
    style,
    testID,
}) => {
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef<any>(null);
    const inputRef = useRef<TextInput | null>(null);

    // fallback för sök-placeholder via i18n (ingen hårdkodad text)
    const searchPh = searchPlaceholder ?? t('common.searchShort');

    // ── WEB: placera portaldropdown under fältet ──
    const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
    const updateAnchor = () => {
        if (Platform.OS !== 'web') return;
        const el = rootRef.current;
        const node = el?.getBoundingClientRect ? el : el?._node;
        const rect = node?.getBoundingClientRect?.();
        if (rect) {
            setAnchor({ top: Math.round(rect.bottom), left: Math.round(rect.left), width: Math.round(rect.width) });
        }
    };
    useEffect(() => {
        if (Platform.OS !== 'web' || !open) return;
        updateAnchor();
        const onWin = () => updateAnchor();
        window.addEventListener('scroll', onWin, true);
        window.addEventListener('resize', onWin);
        return () => {
            window.removeEventListener('scroll', onWin, true);
            window.removeEventListener('resize', onWin);
        };
    }, [open]);

    // ── Placeholder-rad byggs bara om placeholder faktiskt är satt ──
    const listItems: SelectItem[] = useMemo(() => {
        if (!(includePlaceholder && placeholder)) return items;
        return [{ value: '__placeholder__', label: placeholder }, ...items];
    }, [items, includePlaceholder, placeholder]);

    // ── Label i fältet (ingen defaulttext) ──
    const selectedLabel = useMemo(() => {
        const hit = items.find(i => String(i.value) === String(value ?? ''));
        if (hit) return hit.label;
        return placeholder ?? ''; // om inte satt → tomt
    }, [items, value, placeholder]);

    // ── Filtrering (utan defaulttexter) ──
    const norm = (s: any) =>
        String(s ?? '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    const filtered = useMemo(() => {
        const q = norm(query);
        if (!q) return listItems;
        return listItems.filter(it => norm(it.label).includes(q) || norm(it.value).includes(q));
    }, [listItems, query]);

    // ── WEB: outside click stänger ──
    useEffect(() => {
        if (Platform.OS !== 'web' || !open) return;
        const onDown = (e: any) => {
            const root = rootRef.current as any;
            const node = root?.getBoundingClientRect ? root : root?._node;
            const target = e.target as Node;
            const dropdown = document.getElementById('select-dropdown-portal');
            if (node?.contains?.(target) || dropdown?.contains?.(target)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('touchstart', onDown, true);
        return () => {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('touchstart', onDown, true);
        };
    }, [open]);

    const doSelect = (it: SelectItem) => {
        if (includePlaceholder && placeholder && it.value === '__placeholder__') {
            onChange(null);
            return setOpen(false);
        }
        onChange(it.value);
        setOpen(false);
    };

    const openPicker = () => {
        setOpen(true);
        setTimeout(() => inputRef.current?.focus?.(), 0);
    };

    return (
        <View
            ref={rootRef}
            style={[styles.container, style]}
            testID={testID}
            onLayout={() => {
                if (Platform.OS === 'web' && open) updateAnchor();
            }}
        >
            {/* Fält (ingen ellips; texten radar bryts) */}
            <Pressable onPress={openPicker} style={styles.field} accessibilityRole="button">
                <Text
                    style={[
                        styles.fieldText,
                        !items.find(i => String(i.value) === String(value ?? '')) && placeholder ? styles.placeholder : null,
                    ]}
                >
                    {selectedLabel}
                </Text>
                <Text style={styles.caret}>▾</Text>
            </Pressable>

            {/* WEB: Portal-dropdown */}
            {open && Platform.OS === 'web' && anchor && (
                <Portal>
                    <View
                        id="select-dropdown-portal"
                        style={[styles.portalWrap, { top: anchor.top, left: anchor.left, width: anchor.width }]}
                    >
                        <View style={styles.sheet}>
                            {/* Sökfält */}
                            <View style={styles.searchRow}>
                                <TextInput
                                    ref={inputRef}
                                    value={query}
                                    onChangeText={setQuery}
                                    placeholder={searchPh}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    // @ts-ignore
                                    inputMode="search"
                                    style={styles.searchInput}
                                />
                                {!!query && (
                                    <TouchableOpacity
                                        onPress={() => {
                                            setQuery('');
                                            inputRef.current?.focus?.();
                                        }}
                                    >
                                        <Text style={styles.clearText}>✕</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            <View
                                // @ts-ignore RN-web
                                style={[styles.listBox, { overflowY: 'auto', maxHeight: MAX_HEIGHT }]}
                            >
                                {filtered.length === 0 && !!noResultsText ? (
                                    <Text style={styles.noResultsText}>{noResultsText}</Text>
                                ) : (
                                    <FlatList
                                        keyboardShouldPersistTaps="always"
                                        data={filtered}
                                        keyExtractor={(it) => String(it.value)}
                                        renderItem={({ item }) => {
                                            const isSel = String(item.value) === String(value ?? '');
                                            return (
                                                <TouchableOpacity
                                                    onPress={() => doSelect(item)}
                                                    style={[styles.row, isSel && styles.rowSel]}
                                                    activeOpacity={0.6}
                                                >
                                                    {showDotOnSelected && <Text style={styles.dot}>{isSel ? '●' : '○'}</Text>}
                                                    <Text style={styles.rowText}>{item.label}</Text>
                                                </TouchableOpacity>
                                            );
                                        }}
                                    />
                                )}
                            </View>
                        </View>
                    </View>
                </Portal>
            )}

            {/* NATIVE: Modal */}
            {open && Platform.OS !== 'web' && (
                <Modal visible animationType="fade" transparent onRequestClose={() => setOpen(false)}>
                    <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
                    <View style={styles.centerWrap}>
                        <View style={styles.sheet}>
                            {/* Header utan hårdkodad text */}
                            {(title || placeholder || closeLabel) && (
                                <View style={styles.header}>
                                    <Text style={styles.title}>{title || placeholder || ''}</Text>
                                    <TouchableOpacity
                                        onPress={() => setOpen(false)}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        accessibilityRole="button"
                                    >
                                        <Text style={styles.close}>{closeLabel ?? '✕'}</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {/* Sökfält */}
                            <View style={styles.searchRow}>
                                <TextInput
                                    ref={inputRef}
                                    value={query}
                                    onChangeText={setQuery}
                                    placeholder={searchPh}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    blurOnSubmit={false}
                                    // @ts-ignore
                                    inputMode="search"
                                    style={styles.searchInput}
                                />
                                {!!query && (
                                    <TouchableOpacity
                                        onPress={() => {
                                            setQuery('');
                                            inputRef.current?.focus?.();
                                        }}
                                    >
                                        <Text style={styles.clearText}>✕</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {filtered.length === 0 && !!noResultsText ? (
                                <Text style={[styles.noResultsText, { paddingHorizontal: 12, paddingBottom: 12 }]}>
                                    {noResultsText}
                                </Text>
                            ) : (
                                <FlatList
                                    keyboardShouldPersistTaps="always"
                                    data={filtered}
                                    keyExtractor={(it) => String(it.value)}
                                    renderItem={({ item }) => {
                                        const isSel = String(item.value) === String(value ?? '');
                                        return (
                                            <TouchableOpacity
                                                onPress={() => doSelect(item)}
                                                style={[styles.row, isSel && styles.rowSel]}
                                                activeOpacity={0.6}
                                            >
                                                {showDotOnSelected && <Text style={styles.dot}>{isSel ? '●' : '○'}</Text>}
                                                <Text style={styles.rowText}>{item.label}</Text>
                                            </TouchableOpacity>
                                        );
                                    }}
                                    style={{ maxHeight: MAX_HEIGHT }}
                                />
                            )}
                        </View>
                    </View>
                </Modal>
            )}
        </View>
    );
};

export const Select = SelectInner;
export default SelectInner;

const styles = StyleSheet.create({
    container: {
        width: '100%',
        alignSelf: 'stretch',
    },
    field: {
        width: '100%',
        minHeight: 44,
        borderWidth: 1,
        borderColor: '#999',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 10,
        backgroundColor: '#fff',
        flexDirection: 'row',
        alignItems: 'center',
    },
    fieldText: {
        flex: 1,
        fontSize: 14,
        color: '#222',
    },
    placeholder: { color: '#777' },
    caret: { marginLeft: 8, fontSize: 16, color: '#666' },

    // WEB-portal
    portalWrap: {
        position: 'fixed',
        zIndex: 2147483647, // över allt
    },
    sheet: {
        backgroundColor: '#fff',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#bbb',
        borderRadius: 10,
        overflow: 'hidden',
        // @ts-ignore RN-web
        boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
    },
    listBox: {},
    noResultsText: {
        padding: 10,
        fontStyle: 'italic',
        color: '#666',
    },

    // Header (native)
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
    centerWrap: { position: 'absolute', left: 12, right: 12, top: '12%' },
    header: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    title: { fontSize: 16, fontWeight: '700' },
    close: { color: '#1976D2', fontWeight: '600', fontSize: 18 },

    // Sökfält
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingTop: 10 },
    searchInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#ccc',
        paddingHorizontal: 8,
        paddingVertical: Platform.OS === 'ios' ? 6 : 8,
        borderRadius: 6,
        backgroundColor: '#fff',
    },
    clearText: { marginLeft: 6, fontSize: 16, opacity: 0.75 },

    // Listan
    row: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    rowSel: { backgroundColor: '#f5faff' },
    dot: { width: 18, textAlign: 'center', lineHeight: 18, marginTop: 2 },
    rowText: { flex: 1, fontSize: 14, color: '#222', lineHeight: 18 },
});
