import React from 'react';
import { SafeAreaView, StyleSheet, ViewStyle } from 'react-native';

type Props = {
    children: React.ReactNode;
    style?: ViewStyle | ViewStyle[];
};

export default function ScreenContainer({ children, style }: Props) {
    return <SafeAreaView style={[styles.container, style]}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#fff',
    },
});