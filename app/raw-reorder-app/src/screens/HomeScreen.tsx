// screens/HomeScreen.tsx
import React, { useLayoutEffect } from 'react';
import { View, Button, StyleSheet, ScrollView } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../App';
import { useAuth } from '../api/auth/AuthContext';
import { useI18n } from '../hooks/useI18n';
import { useI18nTitle } from '../hooks/useI18nTitle';

type HomeProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: HomeProps) {
    const { user, can } = useAuth();
    const isAdmin = user?.role === 'admin';
    const { t } = useI18n();

    useI18nTitle(navigation, 'mainMenu.title');

    useLayoutEffect(() => {
        navigation.setOptions({
            headerBackVisible: false,
            headerLeft: () => null,
            headerBackTitleVisible: false,
        });
    }, [navigation]);

    return (
        <ScrollView contentContainerStyle={styles.container}>
            {(can('reorder:view') || can('purchasing:view') || isAdmin) && (
                <View style={styles.buttonContainer}>
                    <Button
                        title={t('mainMenu.reorderAssist') || 'Beställningar'}
                        onPress={() => navigation.navigate('Reorder')}
                    />
                </View>
            )}

            {can('users:manage') && (
                <View style={styles.buttonContainer}>
                    <Button
                        title={t('mainMenu.users') || 'Användare'}
                        onPress={() => navigation.navigate('Users')}
                    />
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    buttonContainer: {
        width: '100%',
        marginVertical: 8,
    },
});

export default HomeScreen;