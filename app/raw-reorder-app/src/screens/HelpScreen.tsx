import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useI18n } from '../hooks/useI18n';
import { useI18nTitle } from '../hooks/useI18nTitle';

export default function HelpScreen() {
    const navigation = useNavigation<any>();
    const { t } = useI18n();
    useI18nTitle(navigation, 'nav.help');

    const troubleshootingItems = [
        t('help.troubleshooting1'),
        t('help.troubleshooting2'),
        t('help.troubleshooting3'),
    ];
    const reorderHelpSections = [
        {
            title: t('reorderAssist.helpSectionBasics'),
            lines: [
                t('reorderAssist.help.page'),
                `${t('reorderAssist.dateFrom')}: ${t('reorderAssist.help.dateFrom')}`,
                `${t('reorderAssist.dateTo')}: ${t('reorderAssist.help.dateTo')}`,
            ],
        },
        {
            title: t('reorderAssist.helpSectionDefaults'),
            lines: [
                `${t('reorderAssist.leadTime')}: ${t('reorderAssist.help.defaultLeadTime')}`,
                `${t('reorderAssist.safetyDays')}: ${t('reorderAssist.help.defaultSafetyDays')}`,
                `${t('raw.field.quantity')}: ${t('reorderAssist.help.packSize')}`,
            ],
        },
        {
            title: t('reorderAssist.helpSectionLeadTimeFetch'),
            lines: [t('reorderAssist.help.leadTimeFetch')],
        },
        {
            title: t('reorderAssist.helpSectionDecision'),
            lines: [
                t('reorderAssist.help.decision'),
                t('reorderAssist.help.formulas'),
                `${t('reorderAssist.stock')}: ${t('reorderAssist.help.stock')}`,
                `${t('reorderAssist.dailyUsage')}: ${t('reorderAssist.help.dailyUsage')}`,
            ],
        },
        {
            title: t('common.searchShort'),
            lines: [
                t('reorderAssist.help.search'),
                t('reorderAssist.help.searchChips'),
            ],
        },
        {
            title: t('reorderAssist.helpSectionHistory'),
            lines: [t('reorderAssist.help.history')],
        },
    ];

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>{t('nav.help')}</Text>
            <Text style={styles.intro}>{t('help.intro')}</Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('reorderAssist.helpOverviewTitle')}</Text>
                {reorderHelpSections.map((section) => (
                    <View key={section.title} style={styles.section}>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        {section.lines.map((line) => (
                            <Text key={`${section.title}-${line}`} style={styles.listItem}>
                                {'\u2022'} {line}
                            </Text>
                        ))}
                    </View>
                ))}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('help.installTitle')}</Text>
                <Text style={styles.text}>{t('help.installBody')}</Text>
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => navigation.navigate('InstallApp')}
                >
                    <Text style={styles.buttonText}>{t('help.openInstall')}</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('help.passwordTitle')}</Text>
                <Text style={styles.text}>{t('help.passwordBody')}</Text>
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => navigation.navigate('ChangePassword')}
                >
                    <Text style={styles.buttonText}>{t('help.openChangePassword')}</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('help.troubleshootingTitle')}</Text>
                {troubleshootingItems.map((item) => (
                    <Text key={item} style={styles.listItem}>
                        {'\u2022'} {item}
                    </Text>
                ))}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('help.contactTitle')}</Text>
                <Text style={styles.text}>{t('help.contactBody')}</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 16,
        gap: 12,
    },
    title: {
        fontSize: 22,
        fontWeight: '600',
    },
    intro: {
        fontSize: 14,
        color: '#4b5563',
    },
    card: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#ddd',
        borderRadius: 12,
        padding: 16,
        gap: 10,
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '600',
    },
    text: {
        fontSize: 14,
        lineHeight: 20,
    },
    listItem: {
        fontSize: 14,
        lineHeight: 20,
    },
    section: {
        gap: 6,
        marginTop: 4,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
    },
    button: {
        alignSelf: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#1976D2',
    },
    buttonText: {
        color: '#fff',
        fontWeight: '600',
    },
});
