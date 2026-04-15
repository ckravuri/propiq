import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, TextInput, KeyboardAvoidingView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import { apiGet, apiPost, apiDelete, apiPut } from '../lib/api';
import { EXPENSE_CATEGORIES } from '../lib/types';
import type { Property } from '../lib/types';

interface Reminder {
  reminder_id: string;
  property_id: string;
  property_name: string;
  title: string;
  category: string;
  amount: number;
  due_day: number;
  frequency: string;
  notes: string;
  active: boolean;
}

export default function RemindersScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    property_id: '',
    title: '',
    category: 'mortgage',
    amount: '',
    due_day: '1',
    frequency: 'monthly',
    notes: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const [rems, props] = await Promise.all([apiGet('/reminders'), apiGet('/properties')]);
      setReminders(rems);
      setProperties(props);
      if (props.length > 0 && !form.property_id) {
        setForm(prev => ({ ...prev, property_id: props[0].property_id }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const handleSave = async () => {
    if (!form.title.trim() || !form.property_id) {
      const msg = 'Title and property are required';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Validation', msg);
      return;
    }
    setSaving(true);
    try {
      await apiPost('/reminders', {
        property_id: form.property_id,
        title: form.title.trim(),
        category: form.category,
        amount: parseFloat(form.amount) || 0,
        due_day: parseInt(form.due_day) || 1,
        frequency: form.frequency,
        notes: form.notes.trim(),
      });
      setShowForm(false);
      setForm({ property_id: properties[0]?.property_id || '', title: '', category: 'mortgage', amount: '', due_day: '1', frequency: 'monthly', notes: '' });
      fetchData();
    } catch (e: any) {
      Platform.OS === 'web' ? alert(e.message) : Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (reminderId: string) => {
    try {
      await apiPut(`/reminders/${reminderId}/toggle`, {});
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = (reminderId: string) => {
    const doDelete = async () => {
      try {
        await apiDelete(`/reminders/${reminderId}`);
        fetchData();
      } catch (e: any) {
        Platform.OS === 'web' ? alert(e.message) : Alert.alert('Error', e.message);
      }
    };
    if (Platform.OS === 'web') {
      if (confirm('Delete this reminder?')) doDelete();
    } else {
      Alert.alert('Delete Reminder', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const FREQUENCIES = ['monthly', 'quarterly', 'yearly'];

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator testID="reminders-loading" size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView testID="reminders-screen" style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity testID="back-reminders" onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Bill Reminders</Text>
          <TouchableOpacity testID="add-reminder-btn" style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowForm(!showForm)}>
            <Ionicons name={showForm ? 'close' : 'add'} size={20} color="#FFF" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Add Reminder Form */}
          {showForm && (
            <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.formTitle, { color: colors.textPrimary }]}>New Reminder</Text>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Property</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {properties.map(p => (
                      <TouchableOpacity key={p.property_id}
                        style={[styles.chip, { borderColor: colors.border }, form.property_id === p.property_id && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                        onPress={() => setForm(prev => ({ ...prev, property_id: p.property_id }))}>
                        <Text style={[styles.chipText, { color: colors.textPrimary }, form.property_id === p.property_id && { color: '#FFF' }]}>{p.property_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Title</Text>
                <TextInput testID="input-reminder-title" style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                  value={form.title} onChangeText={v => setForm(prev => ({ ...prev, title: v }))} placeholder="e.g. Monthly Mortgage" placeholderTextColor={colors.textSecondary + '60'} />
              </View>

              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Amount ($)</Text>
                  <TextInput testID="input-reminder-amount" style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                    value={form.amount} onChangeText={v => setForm(prev => ({ ...prev, amount: v }))} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textSecondary + '60'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Due Day</Text>
                  <TextInput testID="input-reminder-day" style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                    value={form.due_day} onChangeText={v => setForm(prev => ({ ...prev, due_day: v }))} keyboardType="numeric" placeholder="1-31" placeholderTextColor={colors.textSecondary + '60'} />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Frequency</Text>
                <View style={styles.chipRow}>
                  {FREQUENCIES.map(f => (
                    <TouchableOpacity key={f} style={[styles.chip, { borderColor: colors.border }, form.frequency === f && { backgroundColor: colors.accent, borderColor: colors.accent }]}
                      onPress={() => setForm(prev => ({ ...prev, frequency: f }))}>
                      <Text style={[styles.chipText, { color: colors.textPrimary }, form.frequency === f && { color: '#FFF' }]}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {EXPENSE_CATEGORIES.map(c => (
                      <TouchableOpacity key={c} style={[styles.chip, { borderColor: colors.border }, form.category === c && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                        onPress={() => setForm(prev => ({ ...prev, category: c }))}>
                        <Text style={[styles.chipText, { color: colors.textPrimary }, form.category === c && { color: '#FFF' }]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              <TouchableOpacity testID="save-reminder-btn" style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="#FFF" /> :
                  <Text style={styles.saveBtnText}>Create Reminder</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* Reminders List */}
          {reminders.length === 0 && !showForm ? (
            <View style={styles.emptyState}>
              <Ionicons name="notifications-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Reminders</Text>
              <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>Set up bill reminders for your properties</Text>
            </View>
          ) : (
            reminders.map(r => (
              <View key={r.reminder_id} style={[styles.reminderCard, { backgroundColor: colors.card, borderColor: colors.border }, !r.active && { opacity: 0.5 }]}>
                <View style={styles.reminderHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reminderTitle, { color: colors.textPrimary }]}>{r.title}</Text>
                    <Text style={[styles.reminderProperty, { color: colors.textSecondary }]}>{r.property_name}</Text>
                  </View>
                  <Switch testID={`toggle-${r.reminder_id}`} value={r.active} onValueChange={() => handleToggle(r.reminder_id)}
                    trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFF" />
                </View>
                <View style={styles.reminderMeta}>
                  <View style={[styles.metaTag, { backgroundColor: colors.primary + '15' }]}>
                    <Text style={[styles.metaText, { color: colors.primary }]}>{r.category}</Text>
                  </View>
                  <View style={[styles.metaTag, { backgroundColor: colors.accent + '15' }]}>
                    <Text style={[styles.metaText, { color: colors.accent }]}>{r.frequency}</Text>
                  </View>
                  <Text style={[styles.reminderAmount, { color: colors.textPrimary }]}>${r.amount.toLocaleString()}</Text>
                  <Text style={[styles.reminderDue, { color: colors.textSecondary }]}>Due: {r.due_day}th</Text>
                </View>
                <TouchableOpacity testID={`delete-${r.reminder_id}`} style={styles.deleteBtn} onPress={() => handleDelete(r.reminder_id)}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '700' },
  addBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20, gap: 12 },
  formCard: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 8 },
  formTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  field: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '500', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  rowFields: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  chipRow: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '500', textTransform: 'capitalize' },
  saveBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  reminderCard: { borderRadius: 14, padding: 14, borderWidth: 1, position: 'relative' },
  reminderHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  reminderTitle: { fontSize: 16, fontWeight: '600' },
  reminderProperty: { fontSize: 12, marginTop: 2 },
  reminderMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  metaText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  reminderAmount: { fontSize: 15, fontWeight: '700', marginLeft: 'auto' },
  reminderDue: { fontSize: 12 },
  deleteBtn: { position: 'absolute', bottom: 14, right: 14, padding: 4 },
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  emptyDesc: { fontSize: 14, marginTop: 6, textAlign: 'center' },
});
