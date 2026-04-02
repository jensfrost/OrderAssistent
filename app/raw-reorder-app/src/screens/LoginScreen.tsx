import React, { useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Button,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Platform,
    TouchableOpacity,
    KeyboardAvoidingView,
    ScrollView,
    Keyboard,
    TouchableWithoutFeedback,
} from 'react-native';
import { useAuth } from '../api/auth/AuthContext';
import i18n from '../i18n/i18n';
import { forgotPassword } from '../api/authReg';
import { getApiBase, getApiPrefix, api } from '../api';

const LoginScreen: React.FC = () => {
    const { login } = useAuth();
    const [email, setEmail] = useState('test@aveo.se');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const passwordRef = useRef<TextInput>(null);

    function httpStatus(err: any): number | undefined {
        return err?.response?.status ?? err?.status;
    }

    function serverDetail(err: any): string | undefined {
        return (
            err?.response?.data?.detail ??
            err?.response?.data?.message ??
            err?.message
        );
    }

    function isNavigatorOffline(): boolean {
        const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
        return typeof nav?.onLine === 'boolean' ? nav.onLine === false : false;
    }

    function mapLoginError(err: any): string {
        const s = httpStatus(err);

        if (s === 401) return i18n.t('auth.badcreds');
        if (s === 403) return i18n.t('auth.forbidden');
        if (s === 429) return i18n.t('auth.too_many');

        // Endast rapportera offline om vi VET att onLine === false
        if (isNavigatorOffline()) return i18n.t('common.offline');

        if (s && s >= 500) return i18n.t('common.server_error');
        return serverDetail(err) || i18n.t('auth.failed');
    }

    const onSubmit = async () => {
        if (!email || !password) {
            setError(i18n.t('auth.missing'));
            return;
        }
        setLoading(true);
        setError(null);
        try {
            await login(email, password);
        } catch (e: any) {
            // --------- DEBUGBLOKKET: visar exakt vad som händer på enheten ----------
            try {
                const base = String(getApiBase() || '').replace(/\/+$/, '');
                const pref = '/' + String(getApiPrefix() || 'api').replace(/^\/+|\/+$/g, '');

                // A) fetch GET mot list-endpointen (du sa att den funkar i Chrome)
                const testListUrl = `${base}${pref}/visma/incoming/list?limit=1&refresh=1`;
                const rg = await fetch(testListUrl, { method: 'GET' as const });
                console.log('[fetch test] GET list', testListUrl, rg.status);

                // B) fetch POST mot login-endpointen
                const testLoginUrl = `${base}${pref}/authReg/login`;
                const rp = await fetch(testLoginUrl, {
                    method: 'POST' as const,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });
                console.log('[fetch test] POST login', testLoginUrl, rp.status);

                // C) axios GET för jämförelse
                try {
                    const ax = await api.get('/visma/incoming/list', { params: { limit: 1, refresh: 1 } });
                    console.log('[axios GET list] OK', ax.status);
                } catch (ge: any) {
                    console.log('[axios GET list] FAILED', ge?.message, ge?.code, ge?.response?.status);
                }
            } catch (fe) {
                console.log('[fetch/axios debug] FAILED', fe);
            }
            // ------------------------------------------------------------------------

            const msg = mapLoginError(e);
            setError(msg);
            if (httpStatus(e) === 401) setPassword('');
        } finally {
            setLoading(false);
        }
    };

    const onForgotPassword = async () => {
        const addr = (email || '').trim();
        if (!addr) {
            const title = i18n.t('common.notice');
            const msg = i18n.t('auth.enter_email_first');
            if (Platform.OS === 'web') window.alert(`${title}: ${msg}`);
            else Alert.alert(title, msg as any);
            return;
        }
        try {
            await forgotPassword(addr);
        } catch {
            // medvetet neutral felhantering
        } finally {
            const title = i18n.t('auth.reset_sent_title');
            const msg = i18n.t('auth.reset_sent');
            if (Platform.OS === 'web') window.alert(`${title}: ${msg}`);
            else Alert.alert(title, msg as any);
        }
    };

    const keyboardVerticalOffset = Platform.OS === 'ios' ? 24 : 0;

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={keyboardVerticalOffset}
        >
            <ScrollView
                style={{ flex: 1, width: '100%' }}
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="always" // så att taps i inputs inte avbryts
            >
                {Platform.OS === 'web' ? (
                    // WEB: ingen Keyboard.dismiss här (annars blur:ar inputs direkt)
                    <View style={styles.content}>
                        <Text style={styles.title}>{i18n.t('auth.title')}</Text>

                        <Text style={styles.label}>{i18n.t('auth.email')}</Text>
                        <TextInput
                            style={styles.input}
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            autoComplete="email"
                            keyboardType="email-address"
                            placeholder={i18n.t('auth.email_placeholder')}
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => passwordRef.current?.focus()}
                        />

                        <Text style={styles.label}>{i18n.t('auth.password')}</Text>
                        <TextInput
                            ref={passwordRef}
                            style={styles.input}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoComplete="password"
                            placeholder={i18n.t('auth.password_placeholder')}
                            returnKeyType="done"
                            onSubmitEditing={onSubmit}
                        />

                        <View style={{ marginTop: 12 }}>
                            {loading ? (
                                <ActivityIndicator />
                            ) : (
                                <Button title={i18n.t('auth.login')} onPress={onSubmit} disabled={loading} />
                            )}
                        </View>

                        {!!error && <Text style={styles.error}>{error}</Text>}

                        <TouchableOpacity onPress={onForgotPassword} style={{ marginTop: 12 }}>
                            <Text style={{ color: '#1976D2' }}>{i18n.t('auth.forgot')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    // NATIVE: behåll bekvämligheten att tappa bort keyboard när man trycker utanför
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                        <View style={styles.content}>
                            <Text style={styles.title}>{i18n.t('auth.title')}</Text>

                            <Text style={styles.label}>{i18n.t('auth.email')}</Text>
                            <TextInput
                                style={styles.input}
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                autoComplete="email"
                                keyboardType="email-address"
                                placeholder={i18n.t('auth.email_placeholder')}
                                returnKeyType="next"
                                blurOnSubmit={false}
                                onSubmitEditing={() => passwordRef.current?.focus()}
                            />

                            <Text style={styles.label}>{i18n.t('auth.password')}</Text>
                            <TextInput
                                ref={passwordRef}
                                style={styles.input}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry
                                autoComplete="password"
                                placeholder={i18n.t('auth.password_placeholder')}
                                returnKeyType="done"
                                onSubmitEditing={onSubmit}
                            />

                            <View style={{ marginTop: 12 }}>
                                {loading ? (
                                    <ActivityIndicator />
                                ) : (
                                    <Button title={i18n.t('auth.login')} onPress={onSubmit} disabled={loading} />
                                )}
                            </View>

                            {!!error && <Text style={styles.error}>{error}</Text>}

                            <TouchableOpacity onPress={onForgotPassword} style={{ marginTop: 12 }}>
                                <Text style={{ color: '#1976D2' }}>{i18n.t('auth.forgot')}</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableWithoutFeedback>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );

};

const styles = StyleSheet.create({
    // Viktigt på web: centrera content-containern och låt den fylla höjden
    container: {
        flexGrow: 1,
        padding: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    // Inner-wrap som begränsar maxbredd och centreras
    content: {
        alignSelf: 'center',       // <- centrera kortet (tidigare: 'stretch')
        width: '100%',
        maxWidth: 520,             // snyggt på desktop
        // valfritt: lite extra sidopadding på små skärmar
        paddingHorizontal: Platform.OS === 'web' ? 8 : 0,
    },
    title: { fontSize: 22, fontWeight: '600', marginBottom: 16, textAlign: 'center' },
    label: { alignSelf: 'flex-start', marginTop: 8, fontWeight: '600' },
    input: {
        alignSelf: 'stretch',
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 10,
        marginTop: 6,
    },
    error: {
        alignSelf: 'stretch',
        marginTop: 12,
        color: '#B00020',
        backgroundColor: '#FDECEC',
        borderWidth: 1,
        borderColor: '#F5C2C7',
        padding: 8,
        borderRadius: 6,
    },
    hint: { marginTop: 16, fontSize: 12, color: '#666' },
});

export default LoginScreen;
