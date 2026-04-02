// components/IncomingNotesList.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import {
    fetchIncomingNotesAll,
    fetchIncomingRowsByRegnr,
    IncomingNote,
    IncomingNoteRow,
} from '../api/visma';

type Props = {
    onSelect?: (note: IncomingNote) => void;  // called when user taps a note
};

const MAX_CONCURRENT_ROW_FETCHES = 4;
const MAX_ROW_PREFETCH_PER_SEARCH = 60; // cap to avoid flooding

function useDebounced<T>(value: T, delay = 250) {
    const [v, setV] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setV(value), delay);
        return () => clearTimeout(id);
    }, [value, delay]);
    return v;
}

function normalize(s: any): string {
    return String(s ?? '')
        .toLowerCase()
        .normalize('NFD')
        // strip diacritics
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function parseDate(d?: string): Date | null {
    if (!d) return null;
    // Try ISO first
    const iso = new Date(d);
    if (!isNaN(iso.getTime())) return iso;

    // Fallback: try Swedish-ish d/m/y or y-m-d variants
    const m = d.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/) // yyyy-mm-dd
        || d.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/); // dd/mm/yyyy
    if (!m) return null;

    let year: number, month: number, day: number;
    if (m[1].length === 4) {
        // yyyy-mm-dd
        year = +m[1]; month = +m[2] - 1; day = +m[3];
    } else {
        // dd/mm/yyyy
        day = +m[1]; month = +m[2] - 1; year = +m[3];
    }
    const dt = new Date(year, month, day);
    return isNaN(dt.getTime()) ? null : dt;
}

function regnrToNum(regnr: string | number): number {
    const n = Number(regnr);
    return isNaN(n) ? 0 : n;
}

function formatDateDisplay(d?: string): string {
    const dt = parseDate(d);
    if (!dt) return d ?? '';
    // sv-SE date, no time
    return dt.toLocaleDateString('sv-SE');
}

function makeHeaderSearchBlob(n: IncomingNote): string {
    // Combine regnr, supplier name, and multiple date shapes
    const dateDisp = formatDateDisplay(n.doc_date);
    const dateIso =
        parseDate(n.doc_date)?.toISOString().slice(0, 10) ?? (n.doc_date ?? '');
    return normalize(`${n.regnr} ${n.supplier_name} ${dateDisp} ${dateIso}`);
}

function makeRowsSearchBlob(rows: IncomingNoteRow[]): string {
    // Gather typical row fields used for search
    const parts: string[] = [];
    for (const r of rows) {
        parts.push(
            r.artnr ?? '',
            r.sup_artnr ?? '',
            r.name ?? '',
            r.text ?? ''
        );
    }
    return normalize(parts.join(' '));
}

export const IncomingNotesList: React.FC<Props> = ({ onSelect }) => {
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState<IncomingNote[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Search state
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounced(query, 250);

    // Header blobs and row blobs
    const headerBlob = useRef<Map<string | number, string>>(new Map());
    const rowBlob = useRef<Map<string | number, string>>(new Map());
    const rowFetchInFlight = useRef<Set<string | number>>(new Set());

    // Load all notes
    useEffect(() => {
        let isMounted = true;
        (async () => {
            try {
                setLoading(true);
                const all = await fetchIncomingNotesAll();

                // Build header blobs once
                const hb = new Map<string | number, string>();
                for (const n of all) hb.set(n.regnr, makeHeaderSearchBlob(n));

                // Sort: date desc, then regnr desc
                const sorted = [...all].sort((a, b) => {
                    const da = parseDate(a.doc_date)?.getTime() ?? 0;
                    const db = parseDate(b.doc_date)?.getTime() ?? 0;
                    if (db !== da) return db - da;
                    return regnrToNum(b.regnr) - regnrToNum(a.regnr);
                });

                if (!isMounted) return;
                headerBlob.current = hb;
                setNotes(sorted);
                setError(null);
            } catch (e: any) {
                if (!isMounted) return;
                setError(e?.message || 'Kunde inte hämta följesedlar.');
            } finally {
                if (isMounted) setLoading(false);
            }
        })();
        return () => {
            isMounted = false;
        };
    }, []);

    // Filter + search
    const tokens = useMemo(() => {
        const q = normalize(debouncedQuery);
        return q.length ? q.split(/\s+/).filter(Boolean) : [];
    }, [debouncedQuery]);

    // If query present, opportunistically fetch rows for top N notes
    useEffect(() => {
        if (!tokens.length || !notes.length) return;

        // Pick first N notes that don't have row blob yet
        const toFetch: IncomingNote[] = [];
        for (const n of notes) {
            if (toFetch.length >= MAX_ROW_PREFETCH_PER_SEARCH) break;
            if (!rowBlob.current.has(n.regnr) && !rowFetchInFlight.current.has(n.regnr)) {
                toFetch.push(n);
            }
        }
        if (!toFetch.length) return;

        let active = true;
        const queue = [...toFetch];
        let running = 0;

        const pump = () => {
            if (!active) return;
            while (running < MAX_CONCURRENT_ROW_FETCHES && queue.length) {
                const n = queue.shift()!;
                rowFetchInFlight.current.add(n.regnr);
                running++;
                fetchIncomingRowsByRegnr(n.regnr)
                    .then(rows => {
                        if (!active) return;
                        rowBlob.current.set(n.regnr, makeRowsSearchBlob(rows));
                    })
                    .catch(() => {
                        /* ignore errors per-note */
                    })
                    .finally(() => {
                        rowFetchInFlight.current.delete(n.regnr);
                        running--;
                        if (active && (queue.length || running)) pump();
                    });
            }
        };
        pump();

        return () => {
            active = false;
        };
    }, [tokens.length, notes]);

    const filtered = useMemo(() => {
        if (!tokens.length) return notes;

        return notes.filter(n => {
            const h = headerBlob.current.get(n.regnr) ?? '';
            const r = rowBlob.current.get(n.regnr) ?? '';
            // AND all tokens: each must appear in either header or rows blob
            return tokens.every(t => h.includes(t) || r.includes(t));
        });
    }, [notes, tokens]);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator />
                <Text style={styles.muted}>Laddar inkommande följesedlar…</Text>
            </View>
        );
    }
    if (error) {
        return (
            <View style={styles.center}>
                <Text style={styles.error}>{error}</Text>
            </View>
        );
    }

    return (
        <View style={{ flex: 1 }}>
            {/* Search box */}
            <View style={styles.searchRow}>
                <TextInput
                    placeholder="Sök (nummer, namn, datum, raddata)…"
                    value={query}
                    onChangeText={setQuery}
                    style={styles.searchInput}
                    autoCorrect={false}
                    autoCapitalize="none"
                    clearButtonMode="while-editing"
                />
                {query?.length ? (
                    <Pressable onPress={() => setQuery('')} style={styles.clearBtn}>
                        <Text style={styles.clearBtnTxt}>✕</Text>
                    </Pressable>
                ) : null}
            </View>

            {/* Result count */}
            <Text style={styles.count}>
                {filtered.length} av {notes.length} följesedlar
                {tokens.length ? ' matchar sökningen' : ''}
            </Text>

            <FlatList
                data={filtered}
                keyExtractor={(item) => String(item.regnr)}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 8 }}
                renderItem={({ item }) => {
                    const regnr = String(item.regnr);
                    const supplier = item.supplier_name || '—';
                    const date = formatDateDisplay(item.doc_date);
                    return (
                        <Pressable
                            onPress={() => onSelect?.(item)}
                            style={({ pressed }) => [
                                styles.card,
                                pressed && { opacity: 0.7 },
                            ]}
                        >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={styles.title}>#{regnr}</Text>
                                <Text style={styles.date}>{date}</Text>
                            </View>
                            <Text style={styles.sub}>{supplier}</Text>
                            {!!item.row_count && (
                                <Text style={styles.muted}>{item.row_count} rader</Text>
                            )}
                        </Pressable>
                    );
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    center: { padding: 16, alignItems: 'center', justifyContent: 'center' },
    error: { color: '#b00020' },
    muted: { color: '#666', marginTop: 6 },
    count: { color: '#555', marginHorizontal: 12, marginBottom: 6 },
    searchRow: {
        margin: 12,
        position: 'relative',
    },
    searchInput: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
        fontSize: 16,
        backgroundColor: '#fff',
    },
    clearBtn: {
        position: 'absolute',
        right: 18,
        top: 12,
        padding: 6,
    },
    clearBtnTxt: { fontSize: 16, color: '#888' },
    card: {
        marginHorizontal: 12,
        marginBottom: 10,
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#eee',
        padding: 12,
        shadowOpacity: 0.05,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    title: { fontSize: 18, fontWeight: '600' },
    sub: { marginTop: 4, fontSize: 15 },
    date: { fontSize: 14, color: '#555' },
});
