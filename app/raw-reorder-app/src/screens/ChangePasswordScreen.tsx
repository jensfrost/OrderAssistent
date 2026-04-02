// screens/ChangePasswordScreen.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, ActivityIndicator, Platform, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { changePassword } from '../api/authReg';
import { useI18n } from '../hooks/useI18n';

const ChangePasswordScreen: React.FC = () => {
    const navigation = useNavigation<any>();
    const { t } = useI18n(); // ⬅️ lyssnar på språkbyte och triggar re-render

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newPassword2, setNewPassword2] = useState('');
    const [loading, setLoading] = useState(false);

    // Sätt skärmtitel och uppdatera vid språkbyte
    useEffect(() => {
        navigation.setOptions({ title: t('auth.change.title') });
    }, [navigation, t]);

    const submit = async () => {
        const cur = currentPassword.trim();
        const np = newPassword.trim();
        const np2 = newPassword2.trim();

        if (!cur) {
            Alert.alert(t('common.error') as any, t('auth.change.missingCurrent') as any);
            return;
        }
        if (np.length < 8) {
            Alert.alert(t('common.error') as any, t('auth.passwordMin') as any);
            return;
        }
        if (np !== np2) {
            Alert.alert(t('common.error') as any, t('auth.passwordMismatch') as any);
            return;
        }

        setLoading(true);
        try {
            await changePassword(cur, np);
            const ok = t('auth.change.success');
            if (Platform.OS === 'web') window.alert(ok);
            else Alert.alert(t('common.done') as any, ok as any);
            setCurrentPassword('');
            setNewPassword('');
            setNewPassword2('');
        } catch (e: any) {
            Alert.alert(
                t('common.error') as any,
                (e?.response?.data?.message || e?.message || t('auth.change.error')) as any
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={{ padding: 16 }}>
            <Text>{t('auth.change.current')}</Text>
            <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry
                autoCapitalize="none"
                style={{
                    borderWidth: 1,
                    borderColor: '#ccc',
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 10,
                    marginTop: 6,
                }}
            />

            <Text style={{ marginTop: 12 }}>{t('auth.change.new')}</Text>
            <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
                style={{
                    borderWidth: 1,
                    borderColor: '#ccc',
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 10,
                    marginTop: 6,
                }}
                placeholder={t('auth.reset.passwordPlaceholder')}
            />

            <Text style={{ marginTop: 12 }}>{t('auth.change.repeat')}</Text>
            <TextInput
                value={newPassword2}
                onChangeText={setNewPassword2}
                secureTextEntry
                autoCapitalize="none"
                style={{
                    borderWidth: 1,
                    borderColor: '#ccc',
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 10,
                    marginTop: 6,
                }}
            />

            <View style={{ marginTop: 16 }}>
                {loading ? (
                    <ActivityIndicator />
                ) : (
                    <Button title={t('auth.change.cta')} onPress={submit} />
                )}
            </View>
        </View>
    );
};

export default ChangePasswordScreen;
