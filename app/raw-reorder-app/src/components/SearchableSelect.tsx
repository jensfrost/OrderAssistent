// components/SearchableSelect.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    FlatList,
    Pressable,
    Platform,
    Keyboard,
} from 'react-native';
import { useI18n } from '../hooks/useI18n';
import styles from '../screens/RawRegScreenStyles';


type Option = { label: string; value: string; id?: string; name?: string };

const ROW_HEIGHT = 44;

const norm = (s: any) =>
    (s ?? '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

type Props = {
    options: Option[];
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    testID?: string;
};

export const SearchableSelect: React.FC<Props> = ({
    options,
    value,
    onChange,
    placeholder,
    testID,
}) => {
    const { t } = useI18n();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const rootRef = useRef<any>(null);
    const selectingRef = useRef(false);

    const selectedLabel = useMemo(() => {
        const hit = options.find((o) => o.value === value);
        return hit ? hit.label : '';
    }, [options, value]);

    useEffect(() => {
        setQuery(selectedLabel);
    }, [selectedLabel]);

    const filtered = useMemo(() => {
        const q = norm(query);
        if (!q) return options.slice(0, 100);
        const tokens = q.split(/\s+/).filter(Boolean);
        return options
            .filter((o) => {
                const fields = [
                    norm(o.label),
                    norm(o.value),
                    norm(o.id || ''),
                    norm(o.name || ''),
                ];
                return tokens.every((tt) =>
                    fields.some((f) => f.includes(tt)),
                );
            })
            .slice(0, 100);
    }, [options, query]);

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const handler = (e: any) => {
            if (!open) return;
            const root = rootRef.current as any;
            if (root && root.contains && !root.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler, true);
        document.addEventListener('touchstart', handler, true);
        return () => {
            document.removeEventListener('mousedown', handler, true);
            document.removeEventListener('touchstart', handler, true);
        };
    }, [open]);

    const doPick = (opt: Option) => {
        onChange(opt.value);
        setQuery(opt.label);
        setOpen(false);
        Keyboard.dismiss();
    };
    const pickEarly = (opt: Option) => {
        selectingRef.current = true;
        doPick(opt);
        setTimeout(() => {
            selectingRef.current = false;
        }, 0);
    };
    const onBlur = () =>
        setTimeout(() => {
            if (!selectingRef.current) setOpen(false);
        }, 120);

    return (
        <View
            // @ts-ignore web-only ref
            ref={rootRef}
            style={[
                styles.autoContainer,
                open && styles.autoContainerOpen,
            ]}
            testID={testID}
        >
            <TextInput
                style={styles.input}
                value={query}
                placeholder={placeholder || t('common.search')}
                onChangeText={(tval) => {
                    setQuery(tval);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={onBlur}
                autoCorrect={false}
                autoCapitalize="none"
                // @ts-ignore
                inputMode="search"
            />
            {!!query && (
                <Pressable
                    onPress={() => {
                        setQuery('');
                        onChange('');
                        setOpen(true);
                    }}
                    style={styles.clearBtn}
                >
                    <Text style={{ fontSize: 16 }}>✕</Text>
                </Pressable>
            )}

            {open && (
                <View style={styles.autoDropdown}>
                    {filtered.length === 0 ? (
                        <Text style={styles.autoNoResults}>
                            {t('common.noResults')}
                        </Text>
                    ) : (
                        <FlatList
                            data={filtered}
                            keyExtractor={(it) => it.value}
                            keyboardShouldPersistTaps="handled"
                            getItemLayout={(_, index) => ({
                                length: ROW_HEIGHT,
                                offset: ROW_HEIGHT * index,
                                index,
                            })}
                            renderItem={({ item }) => (
                                <Pressable
                                    style={[styles.autoItem, {
                                        height: ROW_HEIGHT,
                                    }]}
                                    onPressIn={() => pickEarly(item)}
                                    // @ts-ignore
                                    onMouseDown={(e: any) => {
                                        e?.preventDefault?.();
                                        pickEarly(item);
                                    }}
                                    onTouchStart={() => pickEarly(item)}
                                >
                                    <Text style={styles.autoItemText}>
                                        {item.label}
                                    </Text>
                                </Pressable>
                            )}
                        />
                    )}
                </View>
            )}
        </View>
    );
};
