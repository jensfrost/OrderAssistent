// screens/InstallAppScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, TouchableOpacity, Linking } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Constants from 'expo-constants';
import { useI18n } from '../hooks/useI18n';
import { useI18nTitle } from '../hooks/useI18nTitle';
import { useNavigation } from '@react-navigation/native';

type Manifest = {
    versionName: string;
    versionCode: number;
    apkUrl: string;          // relativ (/downloads/xxx.apk) eller absolut (https://...)
    notes?: string;
    playUrl?: string;
    expoProjectUrl?: string;
    env?: 'dev' | 'preview' | 'prod';
    file?: string;
    sha256?: string;
    date?: string;
};

function isAndroidUAWeb() {
    if (Platform.OS !== 'web') return false;
    return /Android/i.test(navigator.userAgent);
}
function isIOSUAWeb() {
    if (Platform.OS !== 'web') return false;
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Basen för web-sökvägar (hanterar subpath och <base href>)
function webBasePath(): string {
    try {
        if (typeof document !== 'undefined') {
            const baseEl = document.querySelector('base[href]') as HTMLBaseElement | null;
            if (baseEl?.href) return new URL('.', baseEl.href).pathname;
        }
        if (typeof window !== 'undefined') {
            const p = window.location.pathname;
            return p.endsWith('/') ? p : p.replace(/\/[^/]*$/, '/');
        }
    } catch { }
    return '/';
}

// Default manifest-sökväg per miljö (web)
function defaultWebManifestPath(env: 'dev' | 'preview' | 'prod') {
    const base = webBasePath();
    const folder = env === 'dev' ? 'dev' : 'preview'; // 'prod' delar preview-kanalen
    return `${base}downloads/${folder}/android.json`;
}

function absolutizeUrl(url: string) {
    if (/^https?:\/\//i.test(url)) return url;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        return new URL(url, window.location.origin).toString();
    }
    return url;
}

// Miljöupplösning
function resolveEnv(extra: any): 'dev' | 'preview' | 'prod' {
    const raw =
        String(extra?.EXPO_PUBLIC_ENV ?? extra?.ENV ?? '')
            .trim()
            .toLowerCase();

    if (raw === 'preview') return 'preview';
    if (raw === 'prod' || raw === 'production') return 'prod';
    return 'dev';
}

// Plocka env-specifik variabel från env/extra
function getEnvSpecificManifestUrl(extra: any, env: string): string | undefined {
    const key = `EXPO_PUBLIC_ANDROID_MANIFEST_URL_${env.toUpperCase()}`;
    // @ts-expect-error indexerad access
    return (process.env[key] as string | undefined) || (extra?.[key] as string | undefined);
}

// Lägg på cache-buster EN gång per sidladdning
function withCacheBusterOnce(u: string, nonce: number) {
    if (!u) return u;
    const sep = u.includes('?') ? '&' : '?';
    return `${u}${sep}t=${nonce}`;
}

// För webben: tvinga nedladdning som .apk
function forceDownloadWeb(url: string, filename?: string) {
    try {
        const a = document.createElement('a');
        a.href = url;
        if (filename) a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch {
        window.open(url, '_self');
    }
}

// Extrahera filnamnet
function basename(u: string) {
    try {
        const abs = /^https?:\/\//i.test(u) ? u : (typeof window !== 'undefined' ? new URL(u, window.location.origin).toString() : u);
        const p = new URL(abs).pathname;
        return p.split('/').filter(Boolean).pop() || 'app.apk';
    } catch {
        const parts = u.split('/').filter(Boolean);
        return parts.pop() || 'app.apk';
    }
}

export default function InstallAppScreen() {
    const { t } = useI18n();
    const navigation = useNavigation<any>();
    useI18nTitle(navigation, 'installApp.title');

    const [m, setM] = useState<Manifest | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [debugUrl, setDebugUrl] = useState<string>('');

    // Stabil nonce för cache-buster (ändras inte över renders)
    const [nonce] = useState<number>(() => Date.now());

    const extra: any =
        (Constants as any)?.expoConfig?.extra ??
        (Constants as any)?.manifest?.extra ??
        {};

    const env = resolveEnv(extra);

    // 1) Bas-URL (utan cache-buster)
    const baseManifestUrl = useMemo(() => {
        return (
            getEnvSpecificManifestUrl(extra, env) ||
            process.env.EXPO_PUBLIC_ANDROID_MANIFEST_URL ||
            extra.EXPO_PUBLIC_ANDROID_MANIFEST_URL ||
            (Platform.OS === 'web' ? defaultWebManifestPath(env) : '')
        )?.toString().trim();
    }, [extra, env]);

    // 2) Cache-bustad URL som är stabil pga "nonce"
    const manifestUrl = useMemo(() => {
        if (!baseManifestUrl) return '';
        return withCacheBusterOnce(baseManifestUrl, nonce);
    }, [baseManifestUrl, nonce]);

    const onAndroid = Platform.OS === 'android' || isAndroidUAWeb();
    const oniOS = Platform.OS === 'ios' || isIOSUAWeb();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!manifestUrl) {
                const msg = Platform.OS === 'web'
                    ? `No manifest URL configured for env="${env}". Serve ${defaultWebManifestPath(env)} or set EXPO_PUBLIC_ANDROID_MANIFEST_URL_${env.toUpperCase()}.`
                    : `No manifest URL configured for env="${env}". Set EXPO_PUBLIC_ANDROID_MANIFEST_URL_${env.toUpperCase()} (or EXPO_PUBLIC_ANDROID_MANIFEST_URL) to an absolute https:// URL.`;
                setError(msg);
                setDebugUrl('(empty)');
                return;
            }
            if (Platform.OS !== 'web' && !/^https?:\/\//i.test(baseManifestUrl || '')) {
                setError('On native, the manifest URL must be absolute (https://...).');
                setDebugUrl(manifestUrl);
                return;
            }

            setDebugUrl(manifestUrl);
            try {
                const res = await fetch(manifestUrl, { cache: 'no-store' });
                const ct = (res.headers.get('content-type') || '').toLowerCase();
                if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

                if (!ct.includes('application/json')) {
                    const sample = await res.text();
                    throw new Error(`Expected JSON but got "${ct || 'unknown'}". First bytes: ${sample.slice(0, 80)}`);
                }

                const data = (await res.json()) as Manifest;

                // Valfri säkerhet
                if (data?.env && data.env !== env && env !== 'prod') {
                    throw new Error(`Manifest env "${data.env}" does not match current env "${env}".`);
                }

                if (!cancelled) setM(data);
            } catch (e: any) {
                if (!cancelled) setError(String(e?.message || e));
            }
        })();
        return () => { cancelled = true; };
    }, [manifestUrl, baseManifestUrl, env]);

    const Heading = () => <Text style={styles.title}>{t('installApp.title')}</Text>;

    // Länkar
    const { primaryLink, apkLinkAbs, apkFileName } = useMemo(() => {
        // Prioritera versionerad fil för att undvika cache och mismatch
        const best = m?.file?.trim() ? m.file! : (m?.apkUrl ?? '');
        const bestAbs = absolutizeUrl(best);
        const pk = m?.playUrl ? m.playUrl : bestAbs; // Play om satt, annars bestAbs
        return {
            primaryLink: pk,
            apkLinkAbs: bestAbs,
            apkFileName: basename(bestAbs || pk || 'app.apk'),
        };
    }, [m]);

    if (error) {
        return (
            <ScrollView contentContainerStyle={styles.container}>
                <Heading />
                <Text style={styles.error}>{t('common.error')} {error}</Text>
                <Text style={styles.note}>{t('installApp.hintConfig')}</Text>
                {!!debugUrl && <Text style={styles.muted}>URL: {debugUrl}</Text>}
                <View style={styles.badgeRow}>
                    <Text style={styles.badge}>ENV: {env}</Text>
                </View>
            </ScrollView>
        );
    }

    if (!m) {
        return (
            <ScrollView contentContainerStyle={styles.container}>
                <Heading />
                <Text style={styles.muted}>{t('common.loading')}</Text>
                {!!debugUrl && <Text style={styles.muted}>URL: {debugUrl}</Text>}
                <View style={styles.badgeRow}>
                    <Text style={styles.badge}>ENV: {env}</Text>
                </View>
            </ScrollView>
        );
    }

    const expoUrl =
        m.expoProjectUrl ||
        (extra?.EXPO_PROJECT_URL as string) ||
        'https://expo.dev/';

    const handleAndroidPress = () => {
        if (m.playUrl) {
            Linking.openURL(m.playUrl);
            return;
        }
        if (Platform.OS === 'web') {
            forceDownloadWeb(apkLinkAbs, apkFileName);
        } else {
            Linking.openURL(apkLinkAbs);
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Heading />
            <Text style={styles.muted}>
                {t('installApp.version', { version: m.versionName, code: m.versionCode })} • ENV: {env}
            </Text>

            <View style={styles.grid}>
                {/* ANDROID */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{t('installApp.androidTitle')}</Text>

                    {onAndroid ? (
                        <TouchableOpacity style={styles.btn} onPress={handleAndroidPress}>
                            <Text style={styles.btnText}>
                                {m.playUrl ? t('installApp.openPlay') : t('installApp.downloadApk')}
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.row}>
                            <View style={styles.qrBox}>
                                <QRCode value={m.playUrl ? m.playUrl : apkLinkAbs} size={164} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.text}>{t('installApp.scanAndroid')}</Text>
                                <Text style={styles.muted} selectable>
                                    {t('installApp.directLink')} {m.playUrl ? m.playUrl : apkLinkAbs}
                                </Text>
                            </View>
                        </View>
                    )}

                    <View style={{ marginTop: 12 }}>
                        <Text style={styles.muted}>• {t('installApp.tip1')}</Text>
                        <Text style={styles.muted}>• {t('installApp.tip2')}</Text>
                    </View>

                    {!!m.notes && (
                        <View style={styles.notes}>
                            <Text style={styles.text}>{m.notes}</Text>
                        </View>
                    )}

                    {/* Debug-info */}
                    <View style={{ marginTop: 12 }}>
                        <Text style={styles.muted}>Manifest: {debugUrl}</Text>
                        <Text style={styles.muted}>APK: {apkLinkAbs}</Text>
                        {!!m.file && <Text style={styles.muted}>Versioned file: {absolutizeUrl(m.file)}</Text>}
                        {!!m.sha256 && <Text style={styles.muted}>SHA256: {m.sha256}</Text>}
                        {!!m.date && <Text style={styles.muted}>Date: {m.date}</Text>}
                    </View>
                </View>

                {/* iOS */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{t('installApp.iosTitle')}</Text>

                    <View style={{ marginBottom: 8 }}>
                        <Text style={styles.text}>1) {t('installApp.expoStep1')}</Text>
                        <Text style={styles.text}>2) {t('installApp.expoStep2')}</Text>
                    </View>

                    <View style={styles.row}>
                        <View style={styles.qrBox}>
                            <QRCode value={expoUrl} size={164} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <TouchableOpacity onPress={() => Linking.openURL(expoUrl)}>
                                <Text style={[styles.muted, { textDecorationLine: 'underline' }]}>
                                    {t('installApp.projectPage')}: {expoUrl}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {oniOS && (
                        <TouchableOpacity style={[styles.btn, { marginTop: 12 }]} onPress={() => Linking.openURL(expoUrl)}>
                            <Text style={styles.btnText}>{t('installApp.openInExpoGo')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { padding: 16, gap: 8 },
    title: { fontSize: 22, fontWeight: '600' },
    cardTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
    muted: { opacity: 0.7, fontSize: 12 },
    text: { fontSize: 14 },
    error: { color: '#b00020', marginTop: 8 },
    note: { marginTop: 12, opacity: 0.8 },
    grid: {
        marginTop: 12,
        gap: 16,
        ...(Platform.OS === 'web'
            ? ({ display: 'grid', gridTemplateColumns: '1fr 1fr' } as any)
            : {}),
    },
    card: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#ddd', borderRadius: 12, padding: 16 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    qrBox: { padding: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: '#eee', borderRadius: 12 },
    btn: {
        paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth, borderColor: '#ddd', alignSelf: 'flex-start'
    },
    btnText: { fontWeight: '600' },
    notes: { backgroundColor: '#f6f7fb', borderRadius: 12, padding: 12, marginTop: 12 },
    badgeRow: { marginTop: 8, flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    badge: { fontSize: 12, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6, backgroundColor: '#f2f2f7' },
});
