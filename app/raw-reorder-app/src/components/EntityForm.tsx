import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Button,
    StyleSheet,
    ScrollView,
    Platform,
    Pressable,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import i18n from '../i18n/i18n';

type FieldDefString =
    | { label: string; key: string; type: 'string' | 'number' | 'dateTime' | 'date' }
    | { label: string; key: string; type: 'picker'; options: (string | { label: string; value: string })[] };

type FieldDef = FieldDefString;

interface EntityFormProps {
    fields: FieldDef[];
    initial?: Record<string, any>;
    onSubmit: (data: Record<string, any>) => void;
    buttonLabel: string;
}

export const EntityForm: React.FC<EntityFormProps> = ({
    fields,
    initial = {},
    onSubmit,
    buttonLabel,
}) => {
    const [form, setForm] = useState<Record<string, any>>({ ...initial });
    const [showDatePickerFor, setShowDatePickerFor] = useState<string | null>(null);

    const handleChange = (key: string, value: any) => {
        setForm(prev => ({ ...prev, [key]: value }));
    };

    const handleButton = () => {
        const payload: Record<string, any> = {};
        fields.forEach(f => {
            const val = form[f.key];
            if (f.type === 'number') {
                payload[f.key] = val === '' ? null : Number(val);
            } else {
                payload[f.key] = val;
            }
        });
        onSubmit(payload);
    };

    return (
        <ScrollView style={{ padding: 16 }}>
            {fields.map(f => (
                <View key={f.key} style={styles.fieldContainer}>
                    <Text style={styles.label}>{f.label}</Text>

                    {f.type === 'picker' ? (
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={form[f.key] ?? ''}
                                onValueChange={value => handleChange(f.key, value)}
                            >
                                <Picker.Item label={i18n.t('common.selectPlaceholder')} value="" />
                                {(f as any).options.map((opt: any, idx: number) => {
                                    const label = typeof opt === 'object' ? opt.label : String(opt);
                                    const value = typeof opt === 'object' ? opt.value : opt;
                                    return (
                                        <Picker.Item
                                            key={`${f.key}-${idx}`}
                                            label={label}
                                            value={value}
                                        />
                                    );
                                })}
                            </Picker>
                    </View>
                    ) : f.type === 'date' && Platform.OS === 'web' ? (
                        <TextInput
                            style={styles.input}
                            value={form[f.key] || ''}
                            onChangeText={(text) => handleChange(f.key, text)}
                            placeholder="YYYY-MM-DD"
                            type="date"
                            inputMode="numeric"
                        />
                    ) : f.type === 'date' ? (
                        <>
                            <Pressable
                                onPress={() => setShowDatePickerFor(f.key)}
                                style={styles.input}
                            >
                                <Text>{form[f.key] || i18n.t('common.selectPlaceholder')}</Text>
                            </Pressable>
                            {showDatePickerFor === f.key && (
                                <DateTimePicker
                                    value={form[f.key] ? new Date(form[f.key]) : new Date()}
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    onChange={(event, selectedDate) => {
                                        setShowDatePickerFor(null);
                                        if (selectedDate) {
                                            const iso = selectedDate.toISOString().split('T')[0]; // YYYY-MM-DD
                                            handleChange(f.key, iso);
                                        }
                                    }}
                                />
                            )}
                        </>
                    ) : (
                        f.type === 'number' && f.key === 'weight' ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <TextInput
                                    style={[styles.input, { flex: 1 }]}
                                    keyboardType="decimal-pad"
                                    value={
                                        form[f.key] === undefined || form[f.key] === ''
                                            ? '0.000'
                                            : Number(form[f.key]).toFixed(3)
                                    }
                                    onChangeText={(text) => {
                                        let cleaned = text.replace(/[^0-9.]/g, '');
                                        const parts = cleaned.split('.');
                                        if (parts.length > 2) {
                                            cleaned = parts[0] + '.' + parts.slice(1).join('');
                                        }
                                        if (parts[1]?.length > 3) {
                                            parts[1] = parts[1].substring(0, 3);
                                            cleaned = parts.join('.');
                                        }
                                        handleChange(f.key, cleaned === '' ? 0 : parseFloat(cleaned));
                                    }}
                                />
                                <Text style={{ marginLeft: 8 }}>kg</Text>
                            </View>
                        ) : (
                            <TextInput
                                style={styles.input}
                                value={form[f.key] != null ? String(form[f.key]) : ''}
                                placeholder={
                                    f.type === 'date'
                                        ? 'YYYY-MM-DD'
                                        : f.type === 'dateTime'
                                            ? 'YYYY-MM-DDTHH:mm:ss'
                                            : undefined
                                }
                                keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                                onChangeText={text => handleChange(f.key, text)}
                            />
                        )
                    )}
                </View>
            ))}

            <Button title={buttonLabel} onPress={handleButton} />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    fieldContainer: {
        marginBottom: 12,
    },
    label: {
        marginBottom: 4,
        fontWeight: '600',
    },
    input: {
        borderWidth: 1,
        borderColor: '#999',
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 10,
        backgroundColor: '#fff',
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: '#999',
        borderRadius: 4,
    },
});
