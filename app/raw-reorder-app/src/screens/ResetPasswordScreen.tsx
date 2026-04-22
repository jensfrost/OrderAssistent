// screens/ResetPasswordScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, ActivityIndicator, Platform, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useI18n } from '../hooks/useI18n';
import { useI18nTitle } from '../hooks/useI18nTitle';
import { resetPasswordWithToken } from '../api/authReg';

function getWebToken(): string {
    if (Platform.OS !== 'web') return '';
    try {
        const params = new URLSearchParams(window.location?.search || '');
        return params.get('token') || '';
    } catch {
        return '';
    }
}

const ResetPasswordScreen: React.FC = () => {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();
    const { t } = useI18n();
    useI18nTitle(navigation, 'auth.reset.title');

    const [token, setToken] = useState<string>('');
    const [pwd, setPwd] = useState('');
    const [pwd2, setPwd2] = useState('');
    const [loading, setLoading] = useState(false);

    // Pick up token from route or URL
    useEffect(() => {
        const tkn = route.params?.token || getWebToken();
        setToken(String(tkn || ''));
    }, [route.params]);

    const submit = async () => {
        const p = pwd.trim();
        const p2 = pwd2.trim();

        if (!token) {
            Alert.alert(t('common.error'), t('auth.reset.badToken'));
            return;
        }
        if (p.length < 8) {
            Alert.alert(t('common.error'), t('auth.passwordMin'));
            return;
        }
        if (p !== p2) {
            Alert.alert(t('common.error'), t('auth.passwordMismatch'));
            return;
        }

        setLoading(true);
        try {
            await resetPasswordWithToken(token, p);
            const okMsg = t('auth.reset.success');
            if (Platform.OS === 'web') window.alert(okMsg);
            else Alert.alert(t('common.done'), okMsg);
            navigation.navigate('Login'); // adjust if your route differs
        } catch (e: any) {
            Alert.alert(
                t('common.error'),
                e?.response?.data?.message || e?.message || t('auth.reset.error')
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={{ padding: 16 }}>
            <Text style={{ marginBottom: 8, color: '#555' }}>
                {t('auth.reset.subtitle')}
            </Text>

            <Text>{t('auth.reset.newPassword')}</Text>
            <TextInput
                value={pwd}
                onChangeText={setPwd}
                secureTextEntry
                autoCapitalize="none"
                style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 10, marginTop: 6 }}
                placeholder={t('auth.reset.passwordPlaceholder')}
            />

            <Text style={{ marginTop: 12 }}>{t('auth.reset.repeatPassword')}</Text>
            <TextInput
                value={pwd2}
                onChangeText={setPwd2}
                secureTextEntry
                autoCapitalize="none"
                style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 10, marginTop: 6 }}
            />

            <View style={{ marginTop: 16 }}>
                {loading ? (
                    <ActivityIndicator />
                ) : (
                    <Button title={t('auth.reset.cta')} onPress={submit} />
                )}
            </View>
        </View>
    );
};

export default ResetPasswordScreen;
