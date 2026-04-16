import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { apiPost } from '../../lib/api';

const INCOME_TYPES = ['rent', 'other'];
const FREQUENCIES = ['weekly', 'fortnightly', 'monthly'];

function freqLabel(f: string, amt: number) {
  if (f === 'weekly') return `$${(amt * 52).toLocaleString()}/yr`;
  if (f === 'fortnightly') return `$${(amt * 26).toLocaleString()}/yr`;
  if (f === 'monthly') return `$${(amt * 12).toLocaleString()}/yr`;
  return '';
}

export default function AddIncomeScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { propertyId, propertyName } = useLocalSearchParams<{ propertyId: string; propertyName: string }>();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    income_type: 'rent',
    frequency: 'weekly',
    tenant_name: '',
    notes: '',
  });

  const update = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      const msg = 'Please enter a valid amount';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Validation', msg);
      return;
    }
    setSaving(true);
    try {
      await apiPost('/income', {
        property_id: propertyId,
        date: form.date,
        amount: parseFloat(form.amount),
        income_type: form.income_type,
        frequency: form.frequency,
        tenant_name: form.tenant_name.trim(),
        notes: form.notes.trim(),
      });
      router.back();
    } catch (e: any) {
      const msg = e.message || 'Failed to save';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const amt = parseFloat(form.amount) || 0;

  return (
    <SafeAreaView testID="add-income-screen" style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity testID="cancel-income-btn" onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Add Income</Text>
          <TouchableOpacity testID="save-income-btn" style={[styles.saveBtn, { backgroundColor: colors.success }]}
            onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#FFF" /> :
              <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[styles.propertyTag, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="business" size={16} color={colors.primary} />
            <Text style={[styles.propertyName, { color: colors.primary }]}>{propertyName || 'Property'}</Text>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Amount ($)</Text>
            <TextInput testID="input-income-amount" style={[styles.amountInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.success }]}
              value={form.amount} onChangeText={(v) => update('amount', v)} keyboardType="numeric" placeholder="0.00"
              placeholderTextColor={colors.textSecondary + '60'} />
          </View>

          {/* Frequency Selector */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Frequency</Text>
            <View style={styles.chipRow}>
              {FREQUENCIES.map(f => (
                <TouchableOpacity key={f} testID={`freq-${f}`}
                  style={[styles.freqChip, { borderColor: colors.border },
                    form.frequency === f && { backgroundColor: colors.success, borderColor: colors.success }]}
                  onPress={() => update('frequency', f)}>
                  <Text style={[styles.freqText, { color: colors.textPrimary },
                    form.frequency === f && { color: '#FFF' }]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {amt > 0 && (
              <View testID="yearly-estimate" style={[styles.yearlyEstimate, { backgroundColor: colors.success + '10', borderColor: colors.success + '30' }]}>
                <Ionicons name="calculator" size={16} color={colors.success} />
                <Text style={[styles.yearlyText, { color: colors.success }]}>
                  Estimated yearly income: {freqLabel(form.frequency, amt)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Date</Text>
            <TextInput testID="input-income-date" style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
              value={form.date} onChangeText={(v) => update('date', v)} placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary + '60'} />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Type</Text>
            <View style={styles.chipRow}>
              {INCOME_TYPES.map(t => (
                <TouchableOpacity key={t} testID={`income-type-${t}`}
                  style={[styles.chip, { borderColor: colors.border }, form.income_type === t && { backgroundColor: colors.success, borderColor: colors.success }]}
                  onPress={() => update('income_type', t)}>
                  <Text style={[styles.chipText, { color: colors.textPrimary }, form.income_type === t && { color: '#FFF' }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Tenant Name</Text>
            <TextInput testID="input-tenant-name" style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
              value={form.tenant_name} onChangeText={(v) => update('tenant_name', v)} placeholder="Optional"
              placeholderTextColor={colors.textSecondary + '60'} />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Notes</Text>
            <TextInput testID="input-income-notes" style={[styles.input, styles.multiline, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
              value={form.notes} onChangeText={(v) => update('notes', v)} multiline numberOfLines={3}
              placeholder="Optional notes" placeholderTextColor={colors.textSecondary + '60'} />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  saveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  scroll: { padding: 20 },
  propertyTag: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginBottom: 20 },
  propertyName: { fontSize: 14, fontWeight: '600' },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  amountInput: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, fontSize: 28, fontWeight: '700', textAlign: 'center' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '500', textTransform: 'capitalize' },
  freqChip: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  freqText: { fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  yearlyEstimate: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  yearlyText: { fontSize: 14, fontWeight: '600' },
});
