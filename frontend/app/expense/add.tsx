import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, KeyboardAvoidingView, Switch, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../lib/theme';
import { apiPost } from '../../lib/api';
import { EXPENSE_CATEGORIES } from '../../lib/types';

export default function AddExpenseScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { propertyId, propertyName } = useLocalSearchParams<{ propertyId: string; propertyName: string }>();
  const [saving, setSaving] = useState(false);
  const [receiptBase64, setReceiptBase64] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    category: 'miscellaneous',
    notes: '',
    recurring: false,
    frequency: 'monthly',
  });

  const update = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }));

  const pickReceipt = async (source: 'library' | 'camera') => {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        const msg = 'Camera permission is required';
        Platform.OS === 'web' ? alert(msg) : Alert.alert('Permission needed', msg);
        return;
      }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const msg = 'Photo library permission is required';
        Platform.OS === 'web' ? alert(msg) : Alert.alert('Permission needed', msg);
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = {
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled && result.assets[0]?.base64) {
      const asset = result.assets[0];
      const mimeType = asset.mimeType || 'image/jpeg';
      setReceiptBase64(`data:${mimeType};base64,${asset.base64}`);
    }
  };

  const handleSave = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      const msg = 'Please enter a valid amount';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Validation', msg);
      return;
    }
    setSaving(true);
    try {
      await apiPost('/expenses', {
        property_id: propertyId,
        date: form.date,
        amount: parseFloat(form.amount),
        category: form.category,
        notes: form.notes.trim(),
        recurring: form.recurring,
        frequency: form.frequency,
        receipt_base64: receiptBase64,
      });
      router.back();
    } catch (e: any) {
      const msg = e.message || 'Failed to save';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView testID="add-expense-screen" style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity testID="cancel-expense-btn" onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Add Expense</Text>
          <TouchableOpacity testID="save-expense-btn" style={[styles.saveBtn, { backgroundColor: colors.danger }]}
            onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#FFF" /> :
              <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.propertyTag, { backgroundColor: colors.primary + '15' }]}>
            <Ionicons name="business" size={16} color={colors.primary} />
            <Text style={[styles.propertyName, { color: colors.primary }]}>{propertyName || 'Property'}</Text>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Amount ($)</Text>
            <TextInput testID="input-expense-amount"
              style={[styles.amountInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.danger }]}
              value={form.amount} onChangeText={(v) => update('amount', v)} keyboardType="numeric" placeholder="0.00"
              placeholderTextColor={colors.textSecondary + '60'} />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Date</Text>
            <TextInput testID="input-expense-date"
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
              value={form.date} onChangeText={(v) => update('date', v)} placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary + '60'} />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
            <View style={styles.categoryGrid}>
              {EXPENSE_CATEGORIES.map(c => (
                <TouchableOpacity key={c} testID={`expense-cat-${c.replace(/\s/g, '-')}`}
                  style={[styles.categoryChip, { borderColor: colors.border }, form.category === c && { backgroundColor: colors.danger, borderColor: colors.danger }]}
                  onPress={() => update('category', c)}>
                  <Text style={[styles.categoryText, { color: colors.textPrimary }, form.category === c && { color: '#FFF' }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.recurringRow, { borderColor: colors.border }]}>
            <View>
              <Text style={[styles.recurringLabel, { color: colors.textPrimary }]}>Recurring Expense</Text>
              <Text style={[styles.recurringDesc, { color: colors.textSecondary }]}>Mark as recurring bill</Text>
            </View>
            <Switch testID="recurring-toggle" value={form.recurring} onValueChange={(v) => update('recurring', v)}
              trackColor={{ false: colors.border, true: colors.danger }} thumbColor="#FFF" />
          </View>

          {/* Frequency selector - shown when recurring */}
          {form.recurring && (
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Frequency</Text>
              <View style={styles.freqRow}>
                {(['weekly', 'monthly', 'quarterly', 'yearly'] as const).map(f => (
                  <TouchableOpacity key={f} testID={`expense-freq-${f}`}
                    style={[styles.freqChip, { borderColor: colors.border },
                      form.frequency === f && { backgroundColor: colors.danger, borderColor: colors.danger }]}
                    onPress={() => update('frequency', f)}>
                    <Text style={[styles.freqText, { color: colors.textPrimary },
                      form.frequency === f && { color: '#FFF' }]}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {parseFloat(form.amount) > 0 && (
                <View testID="yearly-expense-estimate" style={[styles.yearlyEstimate, { backgroundColor: colors.danger + '10', borderColor: colors.danger + '30' }]}>
                  <Ionicons name="calculator" size={16} color={colors.danger} />
                  <Text style={[styles.yearlyText, { color: colors.danger }]}>
                    Annualised: ${(
                      form.frequency === 'weekly' ? parseFloat(form.amount) * 52 :
                      form.frequency === 'monthly' ? parseFloat(form.amount) * 12 :
                      form.frequency === 'quarterly' ? parseFloat(form.amount) * 4 :
                      parseFloat(form.amount)
                    ).toLocaleString()}/yr
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Receipt/Invoice Attachment */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Receipt / Invoice</Text>
            <View style={[styles.receiptSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {receiptBase64 ? (
                <View>
                  <Image testID="receipt-preview" source={{ uri: receiptBase64 }} style={styles.receiptPreview} resizeMode="cover" />
                  <View style={styles.receiptActions}>
                    <TouchableOpacity testID="change-receipt-btn" style={[styles.receiptBtn, { backgroundColor: colors.primary }]} onPress={() => pickReceipt('library')}>
                      <Ionicons name="images" size={14} color="#FFF" />
                      <Text style={styles.receiptBtnText}>Change</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID="remove-receipt-btn" style={[styles.receiptBtn, { backgroundColor: colors.danger }]} onPress={() => setReceiptBase64(null)}>
                      <Ionicons name="trash" size={14} color="#FFF" />
                      <Text style={styles.receiptBtnText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.receiptPlaceholder}>
                  <Ionicons name="receipt-outline" size={32} color={colors.textSecondary} />
                  <Text style={[styles.receiptPlaceholderText, { color: colors.textSecondary }]}>Attach receipt or invoice</Text>
                  <View style={styles.receiptActions}>
                    <TouchableOpacity testID="pick-receipt-btn" style={[styles.receiptBtn, { backgroundColor: colors.primary }]} onPress={() => pickReceipt('library')}>
                      <Ionicons name="images" size={14} color="#FFF" />
                      <Text style={styles.receiptBtnText}>Gallery</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID="take-receipt-btn" style={[styles.receiptBtn, { backgroundColor: colors.accent }]} onPress={() => pickReceipt('camera')}>
                      <Ionicons name="camera" size={14} color="#FFF" />
                      <Text style={styles.receiptBtnText}>Camera</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Notes</Text>
            <TextInput testID="input-expense-notes"
              style={[styles.input, styles.multiline, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
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
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  categoryText: { fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
  recurringRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, marginBottom: 16 },
  recurringLabel: { fontSize: 15, fontWeight: '500' },
  recurringDesc: { fontSize: 12, marginTop: 2 },
  freqRow: { flexDirection: 'row', gap: 6 },
  freqChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  freqText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  yearlyEstimate: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  yearlyText: { fontSize: 14, fontWeight: '600' },
  receiptSection: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  receiptPreview: { width: '100%', height: 180, borderRadius: 14 },
  receiptPlaceholder: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  receiptPlaceholderText: { fontSize: 14 },
  receiptActions: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16 },
  receiptBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  receiptBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
});
