// screens/UsersScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    Button,
    Alert,
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Platform,
} from 'react-native';
// ⬇️ Byt från @react-native-picker/picker till vår Select
// import { Picker } from '@react-native-picker/picker';
import { Select, type SelectItem } from '../components/Select';

import { useNavigation } from '@react-navigation/native';
import { useI18n } from '../hooks/useI18n';
import { useI18nTitle } from '../hooks/useI18nTitle';

import { useAuth } from '../api/auth/AuthContext';
import {
    fetchUsers,
    fetchRoles,
    createUser,
    updateUserById,
    deleteUserById,
    type UserDTO,
    type RoleDTO,
} from '../api/users';
import { formatDate } from '../utils/formatDate';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


type Mode = 'list' | 'create' | 'edit';

const norm = (s?: string) =>
    String(s ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

// Extra robusthet om backenden skulle skicka annat fältnamn
const pickRoleCode = (u: any): string =>
    u?.ANROLE ?? u?.anrole ?? u?.ROLE ?? u?.role ?? u?.ANROLL ?? '';

const UsersScreen: React.FC = () => {
    const { t } = useI18n();
    const navigation = useNavigation<any>();
    useI18nTitle(navigation, 'users.title');

    const { can } = useAuth();

    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState<Mode>('list');

    const [users, setUsers] = useState<UserDTO[]>([]);
    const [roles, setRoles] = useState<RoleDTO[]>([]);

    // filter
    const [query, setQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<string>(''); // ROLECODE eller '' (alla)

    // form
    const [editId, setEditId] = useState<number | null>(null); // ANANVN
    const [fEmail, setFEmail] = useState('');
    const [fRole, setFRole] = useState<string>('viewer');
    const [fPassword, setFPassword] = useState('');
    const [saving, setSaving] = useState(false);

    const showAlert = (title: string, message: string) => {
        if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
        else Alert.alert(title, message as any);
    };

    const confirmDialog = async (title: string, message: string): Promise<boolean> => {
        if (Platform.OS === 'web') return window.confirm(`${title}\n\n${message}`);
        return new Promise(resolve => {
            Alert.alert(title as any, message as any, [
                { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
                { text: t('common.delete'), style: 'destructive', onPress: () => resolve(true) },
            ]);
        });
    };

    const insets = useSafeAreaInsets();
    const bottomPad = Platform.OS === 'web' ? 24 : insets.bottom + 96; // buffert + safe area


    if (!can('users:manage')) {
        return (
            <View style={{ padding: 16 }}>
                <Text style={{ fontWeight: '600', fontSize: 16 }}>
                    {t('common.forbidden') || 'Åtkomst nekad'}
                </Text>
                <Text style={{ marginTop: 8 }}>
                    {t('users.needAdmin') || 'Du behöver administratörsbehörighet för att hantera användare.'}
                </Text>
            </View>
        );
    }

    const loadAll = async () => {
        setLoading(true);
        try {
            const u = await fetchUsers();
            const list = Array.isArray(u.data) ? u.data : [];
            setUsers(list);

            // Roller (med fallback)
            try {
                const r = await fetchRoles();
                if (Array.isArray(r.data) && r.data.length) {
                    setRoles(r.data);
                } else {
                    const uniq = Array.from(new Set(list.map(pickRoleCode).filter(Boolean)));
                    setRoles(
                        uniq.length
                            ? uniq.map(code => ({ ROLECODE: code, ROLENAME: code }))
                            : [
                                { ROLECODE: 'admin', ROLENAME: 'Administratör' },
                                { ROLECODE: 'operator', ROLENAME: 'Operatör' },
                                { ROLECODE: 'warehouse', ROLENAME: 'Lager' },
                                { ROLECODE: 'viewer', ROLENAME: 'Läsbehörighet' },
                            ]
                    );
                }
            } catch {
                const uniq = Array.from(new Set(list.map(pickRoleCode).filter(Boolean)));
                setRoles(
                    uniq.length
                        ? uniq.map(code => ({ ROLECODE: code, ROLENAME: code }))
                        : [
                            { ROLECODE: 'admin', ROLENAME: 'Administratör' },
                            { ROLECODE: 'operator', ROLENAME: 'Operatör' },
                            { ROLECODE: 'warehouse', ROLENAME: 'Lager' },
                            { ROLECODE: 'viewer', ROLENAME: 'Läsbehörighet' },
                        ]
                );
            }
        } catch {
            showAlert(t('users.title') || 'Användare', t('common.error') || 'Kunde inte läsa användare/roller.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ⬅️ Samma back-beteende som LevReg: växla till lista i stället för att lämna skärmen
    useEffect(() => {
        const unsub = navigation.addListener('beforeRemove', (e: any) => {
            if (mode === 'list') return;
            e.preventDefault();
            setMode('list');
        });
        return unsub;
    }, [navigation, mode]);

    // Stäng av iOS swipe-back när vi inte är i list
    useEffect(() => {
        navigation.setOptions?.({ gestureEnabled: mode === 'list' });
    }, [navigation, mode]);

    const startCreate = () => {
        setEditId(null);
        setFEmail('');
        setFRole(roles[0]?.ROLECODE || 'viewer');
        setFPassword('');
        setMode('create');
    };

    const startEdit = (u: UserDTO) => {
        if (u.ANANVN == null) {
            showAlert(t('common.error') || 'Fel', 'Saknar ANANVN i användarlistan. Backend måste returnera id.');
            return;
        }
        setEditId(u.ANANVN);
        setFEmail(u.ANMAIL || '');
        setFRole(pickRoleCode(u) || 'viewer');
        setFPassword('');
        setMode('edit');
    };

    const resetForm = () => {
        setEditId(null);
        setFEmail('');
        setFRole('viewer');
        setFPassword('');
    };

    const validate = (isCreate: boolean) => {
        const errs: string[] = [];
        if (!fEmail.trim() || !/^\S+@\S+\.\S+$/.test(fEmail)) errs.push(t('users.err.email') || 'Ogiltig e-post.');
        if (!fRole) errs.push(t('users.err.role') || 'Välj roll.');
        if (isCreate && fPassword.trim().length < 8) errs.push(t('users.err.password') || 'Lösenord minst 8 tecken.');
        return errs;
    };

    const handleSave = async () => {
        const isCreate = mode === 'create';
        const errs = validate(isCreate);
        if (errs.length) {
            showAlert(t('common.error') || 'Fel', errs.join('\n'));
            return;
        }

        setSaving(true);
        try {
            if (isCreate) {
                await createUser({ ANMAIL: fEmail.trim(), ANROLE: fRole, password: fPassword.trim() });
            } else {
                if (editId == null) {
                    showAlert(t('common.error') || 'Fel', 'Saknar ANANVN för uppdatering.');
                    setSaving(false);
                    return;
                }
                await updateUserById(editId, { ANMAIL: fEmail.trim(), ANROLE: fRole });
            }
            await loadAll();
            resetForm();
            setMode('list');
            showAlert(t('users.updated') || 'Klart', fEmail.trim() || 'OK');
        } catch (e: any) {
            showAlert(t('common.error') || 'Fel', e?.response?.data?.error || e?.message || 'Kunde inte spara.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (u: UserDTO) => {
        const ok = await confirmDialog(
            t('users.deleteTitle') || 'Ta bort användare',
            `${t('users.deleteConfirm') || 'Vill du ta bort'} ${u.ANMAIL}?`
        );
        if (!ok) return;

        if (u.ANANVN == null) {
            showAlert(t('common.error') || 'Fel', 'Saknar ANANVN i användarlistan. Backend måste returnera id.');
            return;
        }

        setLoading(true);
        try {
            await deleteUserById(u.ANANVN);
            await loadAll();
        } catch (e: any) {
            showAlert(t('common.error') || 'Fel', e?.response?.data?.error || e?.message || 'Kunde inte ta bort.');
        } finally {
            setLoading(false);
        }
    };

    const roleLabel = (code?: string) =>
        roles.find(r => r.ROLECODE === code)?.ROLENAME || code || '';

    const filtered = useMemo(() => {
        const q = norm(query);
        return users.filter(u => {
            const code = pickRoleCode(u);
            if (roleFilter && code !== roleFilter) return false;
            if (!q) return true;
            const fields = [norm(String(u.ANANVN ?? '')), norm(u.ANMAIL), norm(code)];
            return q.split(/\s+/).filter(Boolean).every(tok => fields.some(f => f.includes(tok)));
        });
    }, [users, query, roleFilter]);

    // Role items for Selects
    const roleItems: SelectItem[] = useMemo(
        () => roles.map(r => ({ value: r.ROLECODE, label: `${r.ROLENAME || r.ROLECODE}` })),
        [roles]
    );

    if (loading) return <ActivityIndicator style={{ marginTop: 50 }} />;

    // ---------- LIST ----------
    if (mode === 'list') {
        return (
            <View style={{ flex: 1, padding: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                    <TouchableOpacity onPress={startCreate} style={styles.addBtn}>
                        <Text style={styles.addText}>{t('common.add') || 'Lägg till'}</Text>
                    </TouchableOpacity>
                </View>

                {/* Filter-kort */}
                <View style={styles.filterCard}>
                    {/* Search */}
                    <View style={styles.searchRow}>
                        <TextInput
                            style={styles.input}
                            placeholder={t('common.search') || 'Sök (id, e-post, roll)…'}
                            value={query}
                            onChangeText={setQuery}
                            autoCapitalize="none"
                            autoCorrect={false}
                            // @ts-ignore
                            inputMode="search"
                        />
                        {!!query && (
                            <TouchableOpacity onPress={() => setQuery('')}>
                                <Text style={styles.clearText}>✕</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Role filter — ny Select */}
                    <View style={{ marginTop: 8 }}>
                        <Text style={styles.smallLabel}>{t('users.roleFilter') || 'Filtrera på roll'}</Text>
                        <Select
                            items={roleItems}
                            value={roleFilter || null}
                            onChange={(v) => setRoleFilter(String(v || ''))}
                            title={t('users.roleFilter') || 'Filtrera på roll'}
                            placeholder={t('common.all') || 'Alla'}
                            searchPlaceholder={t('common.searchShort')}
                            noResultsText={t('common.noResults')}
                            closeLabel={t('common.close')}
                            includePlaceholder
                            showDotOnSelected
                            style={{ alignSelf: 'flex-start', marginTop: 6 }}
                            testID="users-role-filter"
                        />
                    </View>
                </View>

                {/* 📘 Ikon-legend */}
                <View style={styles.legendBar}>
                    <View className="legendItem" style={styles.legendItem}>
                        <Text style={styles.legendIcon}>🕓</Text>
                        <Text style={styles.legendText}>{t('legend.created') || t('labels.created') || 'Skapad'}</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <Text style={styles.legendIcon}>✏️</Text>
                        <Text style={styles.legendText}>{t('legend.updated') || t('labels.modified') || 'Ändrad'}</Text>
                    </View>
                    <View style={styles.legendItem}>
                        <Text style={styles.legendIcon}>🗑️</Text>
                        <Text style={styles.legendText}>{t('legend.delete') || t('common.delete') || 'Ta bort'}</Text>
                    </View>
                </View>

                <Text style={styles.meta}>
                    {(t('common.results') || 'Träffar') + ': '} {filtered.length}
                </Text>

                <FlatList
                    data={filtered}
                    keyExtractor={(u, i) => String(u.ANANVN ?? i)}
                    ListEmptyComponent={
                        <Text style={{ padding: 12, color: '#666' }}>{t('common.noData') || 'Inga användare.'}</Text>
                    }
                    renderItem={({ item }) => {
                        const mail = item.ANMAIL || '';
                        const roleCode = pickRoleCode(item) || '';
                        const roleNameText = roleLabel(roleCode);

                        const created = item.ANRGDT ? formatDate(item.ANRGDT) : '';
                        const changed = item.ANLMDT ? formatDate(item.ANLMDT) : '';

                        return (
                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <TouchableOpacity onPress={() => startEdit(item)} style={{ flex: 1 }}>
                                        <Text style={styles.userTitle}>
                                            {mail}{roleNameText ? `  |  ${roleNameText}` : ''}
                                        </Text>
                                    </TouchableOpacity>

                                    {/* Papperskorg (emoji) */}
                                    <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                        <Text style={styles.deleteIcon}>🗑️</Text>
                                    </TouchableOpacity>
                                </View>

                                {(created || changed) ? (
                                    Platform.OS === 'web' ? (
                                        <Text style={styles.meta}>🕓 {created}{changed ? `   ✏️ ${changed}` : ''}</Text>
                                    ) : (
                                        <View style={{ marginTop: 4 }}>
                                            {created ? <Text style={styles.meta}>🕓 {created}</Text> : null}
                                            {changed ? <Text style={styles.meta}>✏️ {changed}</Text> : null}
                                        </View>
                                    )
                                ) : null}
                            </View>
                        );
                    }}
                    contentContainerStyle={{ paddingBottom: bottomPad }}
                />
            </View>
        );
    }

    // ---------- CREATE/EDIT ----------
    const isEdit = mode === 'edit';
    return (
        <View style={{ flex: 1, padding: 16 }}>
            <Text style={styles.title}>
                {isEdit ? t('users.editTitle') || 'Redigera användare' : t('users.createTitle') || 'Ny användare'}
            </Text>

            {isEdit && (
                <>
                    <Text style={styles.label}>{t('users.id') || 'Användar-ID'}</Text>
                    <Text style={[styles.input, styles.readonly]} selectable>
                        {editId}
                    </Text>
                </>
            )}

            <Text style={styles.label}>{t('users.email') || 'E-post'}</Text>
            <TextInput
                style={styles.input}
                value={fEmail}
                onChangeText={setFEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
            />

            <Text style={styles.label}>{t('users.role') || 'Roll'}</Text>
            <Select
                items={roleItems}
                value={fRole}
                onChange={(v) => setFRole(String(v || ''))}
                title={t('users.role') || 'Roll'}
                placeholder={t('common.selectPlaceholder')}
                searchPlaceholder={t('common.searchShort')}
                noResultsText={t('common.noResults')}
                closeLabel={t('common.close')}
                includePlaceholder={false}
                showDotOnSelected
                style={{ alignSelf: 'flex-start', marginTop: 6, marginBottom: 6 }}
                testID="users-role-select"
            />

            {!isEdit && (
                <>
                    <Text style={styles.label}>{t('users.password') || 'Lösenord'}</Text>
                    <TextInput
                        style={styles.input}
                        value={fPassword}
                        onChangeText={setFPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry
                        placeholder={t('users.passwordHint') || 'Minst 8 tecken'}
                    />
                </>
            )}

            <View style={{ marginTop: 12, gap: 8 }}>
                {saving ? (
                    <ActivityIndicator />
                ) : (
                    <>
                        <Button title={t('common.save')} onPress={handleSave} />
                        <View style={{ height: 8 }} />
                        <Button
                            title={t('common.cancel')}
                            onPress={() => {
                                resetForm();
                                setMode('list');
                            }}
                        />
                    </>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    title: { fontSize: 18, fontWeight: '600' },
    label: { fontWeight: '600', marginTop: 12 },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: Platform.OS === 'ios' ? 6 : 8,
        marginTop: 6,
        backgroundColor: '#fff',
    },

    // (Tidigare picker-wrapper används inte längre)
    pickerWrapper: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 4,
        marginTop: 6,
        backgroundColor: '#fff',
        overflow: 'hidden',
    },
    smallPicker: {
        width: '100%',
        height: Platform.OS === 'ios' ? 34 : 40,
    },

    addBtn: { backgroundColor: '#4CAF50', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4 },
    addText: { color: '#fff', fontWeight: '600' },

    filterCard: {
        borderWidth: 1,
        borderColor: '#e2e2e2',
        borderRadius: 8,
        padding: 12,
        backgroundColor: '#fafafa',
        marginBottom: 8,
    },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    clearText: { color: '#1976D2', marginLeft: 6 },
    smallLabel: { fontSize: 12, color: '#444' },
    meta: { fontSize: 12, color: '#555', marginTop: 4 },

    // 📘 Legend
    legendBar: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 4,
        marginBottom: 4,
        alignItems: 'center',
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    legendIcon: { fontSize: 12, marginRight: 2 },
    legendText: { fontSize: 12, color: '#555' },

    card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginVertical: 6, backgroundColor: '#fff' },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
        flexWrap: 'wrap',
    },
    userTitle: { fontSize: 16, fontWeight: '600' },
    readonly: { backgroundColor: '#f5f5f5', color: '#555' },

    // Emoji-papperskorg
    deleteIcon: {
        fontSize: 16,
        marginLeft: 8,
    },
});

export default UsersScreen;
