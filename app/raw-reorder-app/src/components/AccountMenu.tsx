import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Platform,
    Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../api/auth/AuthContext';
import i18n, {
    setLocale,
    getLocale,
    onLanguageChanged,
    offLanguageChanged,
} from '../i18n/i18n';

// 🔢 Läs version direkt från samma JSON som bump-scriptet använder
// (justera sökväg om din struktur är annorlunda)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const versionInfo = require('../version.android.json') as {
    versionName: string;
    versionCode: number;
};

// ───────────────── Context ─────────────────
type Ctx = {
    open: boolean;
    setOpen: (v: boolean) => void;
    toggle: () => void;
};
const AccountMenuCtx = React.createContext<Ctx | null>(null);

export const AccountMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [open, setOpen] = React.useState(false);
    const toggle = React.useCallback(() => setOpen(v => !v), []);
    return (
        <AccountMenuCtx.Provider value={{ open, setOpen, toggle }}>
            {children}
        </AccountMenuCtx.Provider>
    );
};

function useAccountMenu() {
    const ctx = React.useContext(AccountMenuCtx);
    if (!ctx) throw new Error('AccountMenuProvider saknas runt trädet');
    return ctx;
}

// ───────────────── Header-knappen ─────────────────
export const HeaderAccountButton: React.FC = () => {
    const navigation = useNavigation<any>();
    const { user } = useAuth();
    const { toggle } = useAccountMenu();

    if (!user) {
        return (
            <TouchableOpacity
                onPress={() => navigation.navigate('Login')}
                style={styles.loginBtn}
            >
                <Text style={styles.loginText}>{i18n.t('auth.login')}</Text>
            </TouchableOpacity>
        );
    }

    const nameOrMail = user.username || user.email || '—';
    const avatarLetter = (nameOrMail?.[0] || '?').toUpperCase();

    return (
        <TouchableOpacity
            onPress={toggle}
            style={styles.pill}
        >
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{avatarLetter}</Text>
            </View>
            <Text numberOfLines={1} style={styles.name}>{nameOrMail}</Text>
            <Text style={styles.chev}>▾</Text>
        </TouchableOpacity>
    );
};

// ───────────────── Overlay-menyn ─────────────────
export const AccountMenuOverlay: React.FC = () => {
    const navigation = useNavigation<any>();
    const { user, logout } = useAuth();
    const { open, setOpen } = useAccountMenu();

    // Force re-render vid språkbyte
    const [_, setTick] = React.useState(0);
    React.useEffect(() => {
        const cb = () => setTick(x => x + 1);
        onLanguageChanged(cb);
        return () => offLanguageChanged(cb);
    }, []);

    if (!open) return null;

    const locale = (getLocale && getLocale()) || 'sv';
    const close = () => setOpen(false);

    // 🔢 Version från version.android.json (single source of truth)
    const version = versionInfo.versionName || '0.0.0';
    const androidVersionCode = versionInfo.versionCode ?? 0;

    // Miljö – från EXPO_PUBLIC_ENV_NAME om den finns, annars dev
    const envName =
        process.env.EXPO_PUBLIC_ENV_NAME ??
        'dev';

    let versionLabel = `v${version} · ${envName}`;

    if (Platform.OS === 'android' && androidVersionCode) {
        versionLabel = `v${version} (versionCode: ${androidVersionCode}) · ${envName}`;
    }

    return (
        <Pressable style={styles.overlay} onPress={close}>
            <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
                {/* Byt lösenord */}
                {user && (
                    <TouchableOpacity
                        onPress={() => { close(); navigation.navigate('ChangePassword'); }}
                        style={styles.menuItem}
                    >
                        <Text style={styles.menuText}>{i18n.t('auth.change.title')}</Text>
                    </TouchableOpacity>
                )}

                {/* Skrivare */}
                <TouchableOpacity
                    onPress={() => { close(); navigation.navigate('PrinterSettings'); }}
                    style={styles.menuItem}
                >
                    <Text style={styles.menuText}>{i18n.t('printer.title') || 'Skrivare'}</Text>
                </TouchableOpacity>

                {/* Installera appen (NY) */}
                <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => { setOpen(false); navigation.navigate('InstallApp'); }}
                >
                    <Text style={styles.menuText}>{i18n.t('app.installApp') || 'Installera appen'}</Text>
                </TouchableOpacity>

                {/* Språk (expanderad lista) */}
                <View style={styles.menuItemRow}>
                    <Text style={styles.menuText}>{i18n.t('settings.language') || 'Språk'}</Text>
                    <Text style={styles.menuHint}>{locale === 'sv' ? 'Svenska' : 'English'}</Text>
                </View>
                <TouchableOpacity
                    onPress={() => { setLocale('sv'); }}
                    style={styles.langItem}
                >
                    <Text style={styles.menuText}>Svenska</Text>
                    <Text>{locale === 'sv' ? '●' : '○'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => { setLocale('en'); }}
                    style={styles.langItem}
                >
                    <Text style={styles.menuText}>English</Text>
                    <Text>{locale === 'en' ? '●' : '○'}</Text>
                </TouchableOpacity>

                <View style={styles.divider} />

                {/* Logga ut */}
                {user && (
                    <TouchableOpacity
                        onPress={async () => {
                            close();
                            await logout();
                            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                        }}
                        style={styles.menuItem}
                    >
                        <Text style={[styles.menuText, styles.logout]}>{i18n.t('auth.logout')}</Text>
                    </TouchableOpacity>
                )}

                {/* Versionsinfo längst ner */}
                <View style={styles.versionContainer}>
                    <Text style={styles.versionText}>{versionLabel}</Text>
                </View>
            </Pressable>
        </Pressable>
    );
};

// ───────────────── styles ─────────────────
const styles = StyleSheet.create({
    // header pill
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10, paddingVertical: 6,
        backgroundColor: '#f2f4f7',
        borderRadius: 18,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
    },
    avatar: {
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#1976D2',
        alignItems: 'center', justifyContent: 'center',
        marginRight: 8,
    },
    avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    name: { maxWidth: 140, fontWeight: '600' },
    chev: { marginLeft: 6, color: '#555' },

    // overlay
    overlay: {
        position: 'absolute',
        inset: 0 as any,
        zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.10)',
    },
    menu: {
        position: 'absolute',
        right: 8, top: 56,
        minWidth: 220,
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1, borderColor: '#e5e7eb',
        shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
        elevation: 3,
    },

    menuItem: { paddingHorizontal: 12, paddingVertical: 10 },
    menuItemRow: {
        paddingHorizontal: 12, paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    menuText: { fontSize: 14 },
    menuHint: { fontSize: 14, color: '#666' },

    langItem: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },

    divider: { height: 1, backgroundColor: '#eee' },

    // login button (om ej inloggad)
    loginBtn: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 18,
        backgroundColor: '#1976D2',
    },
    loginText: { color: '#fff', fontWeight: '600' },

    logout: { color: '#c62828', fontWeight: '600' },

    // version-rad
    versionContainer: {
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6',
        marginTop: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    versionText: {
        fontSize: 11,
        color: '#9ca3af',
        textAlign: 'right',
    },
});
