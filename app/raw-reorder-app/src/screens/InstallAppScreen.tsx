// screens/InstallAppScreen.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    StyleSheet,
    Platform,
    TouchableOpacity,
    Linking,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Constants from 'expo-constants';
import { useI18n } from '../hooks/useI18n';
import { useI18nTitle } from '../hooks/useI18nTitle';
import { useNavigation } from '@react-navigation/native';

type AppEnv = 'dev' | 'preview' | 'prod';

type Manifest = {
    versionName?: string;
    versionCode?: number;
    apkUrl?: string;
    notes?: string;
    playUrl?: string;
    expoProjectUrl?: string;
    env?: AppEnv;
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

function absolutizeUrl(url: string) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
        return new URL(url, window.location.origin).toString();
    }
    return url;
}

function resolveEnv(extra: any): AppEnv {
    const raw = String(
        extra?.EXPO_PUBLIC_ENV ??
        extra?.ENV ??
        process.env.EXPO_PUBLIC_ENV ??
        'dev'
    ).trim().toLowerCase();

    if (raw === 'preview') return 'preview';
    if (raw === 'prod' || raw === 'production') return 'prod';
    return 'dev';
}

function getInstallConfig(env: AppEnv) {
    if (env === 'preview') {
        return {
            manifestUrl: 'http://10.10.0.13:3002/api/install/android/manifest?env=preview',
            apkUrl: 'http://10.10.0.13:3002/api/install/android/apk?env=preview',
            playUrl: '',
        };
    }

    if (env === 'prod') {
        return {
            manifestUrl: '',
            apkUrl: '',
            playUrl: '',
        };
    }

    return {
        manifestUrl: 'http://10.10.0.13:3003/api/install/android/manifest?env=dev',
        apkUrl: 'http://10.10.0.13:3003/api/install/android/apk?env=dev',
        playUrl: '',
    };
}

function withCacheBusterOnce(u: string, nonce: number) {
    if (!u) return u;
    const sep = u.includes('?') ? '&' : '?';
    return `${u}${sep}t=${nonce}`;
}

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

function basename(u: string) {
    try {
        const abs = /^https?:\/\//i.test(u)
            ? u
            : typeof window !== 'undefined'
                ? new URL(u, window.location.origin).toString()
                : u;
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
    const [warning, setWarning] = useState<string | null>(null);
    const [debugUrl, setDebugUrl] = useState<string>('');
    const [nonce] = useState<number>(() => Date.now());

    const extra: any =
        (Constants as any)?.expoConfig?.extra ??
        (Constants as any)?.manifest2?.extra ??
        (Constants as any)?.manifest?.extra ??
        {};

    const env = resolveEnv(extra);
    const installConfig = getInstallConfig(env);

    const baseManifestUrl = useMemo(() => {
        return installConfig.manifestUrl?.trim() || '';
    }, [installConfig]);

    const manifestUrl = useMemo(() => {
        if (!baseManifestUrl) return '';
        return withCacheBusterOnce(baseManifestUrl, nonce);
    }, [baseManifestUrl, nonce]);

    const fallbackApkUrl = useMemo(() => {
        return installConfig.apkUrl?.trim() || '';
    }, [installConfig]);

    const fallbackPlayUrl = useMemo(() => {
        return installConfig.playUrl?.trim() || '';
    }, [installConfig]);
    const oniOS = Platform.OS === 'ios' || isIOSUAWeb();

    useEffect(() => {
        let cancelled = false;

        (async () => {
            if (!manifestUrl) {
                if (!cancelled) {
                    setWarning(`No manifest URL configured for env="${env}".`);
                    setDebugUrl('(empty)');
                    setM(null);
                }
                return;
            }

            setDebugUrl(manifestUrl);

            try {
                const res = await fetch(manifestUrl, { cache: 'no-store' });
                const ct = (res.headers.get('content-type') || '').toLowerCase();

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status} ${res.statusText}`);
                }

                if (!ct.includes('application/json')) {
                    const sample = await res.text();
                    if (/<!DOCTYPE html>|<html/i.test(sample)) {
                        throw new Error('Manifest URL returned HTML instead of JSON.');
                    }
                    throw new Error(`Expected JSON but got "${ct || 'unknown'}".`);
                }

                const data = (await res.json()) as Manifest;

                if (data?.env && data.env !== env && env !== 'prod') {
                    throw new Error(`Manifest env "${data.env}" does not match current env "${env}".`);
                }

                if (!cancelled) {
                    setM(data);
                    setWarning(null);
                }
            } catch (e: any) {
                if (!cancelled) {
                    setM(null);
                    setWarning(String(e?.message || e));
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [manifestUrl, env]);

    const expoUrl =
        m?.expoProjectUrl ||
        (extra?.EXPO_PROJECT_URL as string) ||
        'https://expo.dev/';

    const { playUrl, apkUrl, apkFileName } = useMemo(() => {
        const bestApk = m?.file?.trim()
            ? m.file
            : m?.apkUrl?.trim()
                ? m.apkUrl
                : fallbackApkUrl;

        const bestPlay = m?.playUrl?.trim() ? m.playUrl : fallbackPlayUrl;

        const apkAbs = absolutizeUrl(bestApk || '');
        const playAbs = absolutizeUrl(bestPlay || '');

        return {
            playUrl: playAbs,
            apkUrl: apkAbs,
            apkFileName: basename(apkAbs || playAbs || 'app.apk'),
        };
    }, [m, fallbackApkUrl, fallbackPlayUrl]);

    const Heading = () => <Text style={styles.title}>{t('installApp.title')}</Text>;

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Heading />

            <Text style={styles.muted}>
                {m?.versionName
                    ? t('installApp.version', {
                        version: m.versionName,
                        code: m.versionCode ?? 0,
                    })
                    : 'Ingen versionsinformation tillgÃ¤nglig'}{' '}
                â€¢ ENV: {env}
            </Text>

            {!!warning && (
                <View style={styles.notes}>
                    <Text style={styles.text}>{warning}</Text>
                </View>
            )}

            <View style={styles.grid}>
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{t('installApp.androidTitle')}</Text>
                    <View style={styles.row}>
                        <View style={styles.qrBox}>
                            <QRCode value={playUrl || apkUrl || expoUrl} size={164} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.text}>{t('installApp.scanAndroid')}</Text>
                            <Text style={styles.muted} selectable>
                                {t('installApp.directLink')} {playUrl || apkUrl || expoUrl}
                            </Text>
                        </View>
                    </View>

                    <View style={{ marginTop: 12 }}>
                        <Text style={styles.muted}>â€¢ {t('installApp.tip1')}</Text>
                        <Text style={styles.muted}>â€¢ {t('installApp.tip2')}</Text>
                    </View>

                    {!!m?.notes && (
                        <View style={styles.notes}>
                            <Text style={styles.text}>{m.notes}</Text>
                        </View>
                    )}

                    <View style={{ marginTop: 12 }}>
                        <Text style={styles.muted}>Manifest: {debugUrl || '(none)'}</Text>
                        <Text style={styles.muted}>Play: {playUrl || '(none)'}</Text>
                        <Text style={styles.muted}>APK: {apkUrl || '(none)'}</Text>
                        {!!m?.file && (
                            <Text style={styles.muted}>Versioned file: {absolutizeUrl(m.file)}</Text>
                        )}
                        {!!m?.sha256 && <Text style={styles.muted}>SHA256: {m.sha256}</Text>}
                        {!!m?.date && <Text style={styles.muted}>Date: {m.date}</Text>}
                    </View>
                </View>

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
                        <TouchableOpacity
                            style={[styles.btn, { marginTop: 12 }]}
                            onPress={() => Linking.openURL(expoUrl)}
                        >
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
    grid: {
        marginTop: 12,
        gap: 16,
        ...(Platform.OS === 'web'
            ? ({ display: 'grid', gridTemplateColumns: '1fr 1fr' } as any)
            : {}),
    },
    card: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#ddd',
        borderRadius: 12,
        padding: 16,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    qrBox: {
        padding: 6,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#eee',
        borderRadius: 12,
    },
    btn: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#ddd',
        alignSelf: 'flex-start',
    },
    btnText: { fontWeight: '600' },
    notes: {
        backgroundColor: '#f6f7fb',
        borderRadius: 12,
        padding: 12,
        marginTop: 12,
    },
});




