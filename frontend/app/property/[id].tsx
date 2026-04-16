import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { apiGet, apiDelete, apiPost } from '../../lib/api';
import AdBanner from '../../components/AdBanner';
import type { Property, Income, Expense } from '../../lib/types';

function fmt(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [income, setIncome] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'income' | 'expenses'>('overview');

  const fetchData = useCallback(async () => {
    try {
      const [p, inc, exp] = await Promise.all([
        apiGet(`/properties/${id}`),
        apiGet(`/income/${id}`),
        apiGet(`/expenses/${id}`),
      ]);
      setProperty(p);
      setIncome(inc);
      setExpenses(exp);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const handleDelete = () => {
    const doDelete = async () => {
      try {
        await apiDelete(`/properties/${id}`);
        router.back();
      } catch (e: any) {
        if (Platform.OS === 'web') alert(e.message);
        else Alert.alert('Error', e.message);
      }
    };
    if (Platform.OS === 'web') {
      if (confirm('Delete this property and all its data?')) doDelete();
    } else {
      Alert.alert('Delete Property', 'Delete this property and all its data?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const getAIInsights = async (model: string) => {
    setAiLoading(true);
    try {
      const data = await apiPost('/ai/insights', { property_id: id, model });
      setAiInsights(data.insights);
    } catch (e: any) {
      setAiInsights('Unable to generate insights. Please try again later.');
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator testID="property-detail-loading" size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  if (!property) return null;

  const totalIncome = income.reduce((s, i) => s + i.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netCashflow = totalIncome - totalExpenses;
  const growth = property.purchase_price > 0 ? ((property.current_estimated_value - property.purchase_price) / property.purchase_price * 100) : 0;
  const roi = property.purchase_price > 0 ? (netCashflow / property.purchase_price * 100) : 0;
  const repairs = expenses.filter(e => ['repairs', 'repeated repairs', 'maintenance'].includes(e.category)).reduce((s, e) => s + e.amount, 0);

  return (
    <SafeAreaView testID="property-detail-screen" style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>{property.property_name}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity testID="edit-property-btn" onPress={() => router.push({ pathname: '/property/add', params: { editId: id } })} style={styles.headerBtn}>
            <Ionicons name="create-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity testID="delete-property-btn" onPress={handleDelete} style={styles.headerBtn}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Property Image */}
        {property.image_base64 && (
          <View style={[styles.imageContainer, { borderColor: colors.border }]}>
            <Image testID="property-detail-image" source={{ uri: property.image_base64 }} style={styles.propertyImage} resizeMode="cover" />
          </View>
        )}

        {/* Summary Card */}
        <View testID="property-summary-card" style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
          <View style={styles.summaryTop}>
            <View style={[styles.typeTag, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={styles.typeTagText}>{property.property_type}</Text>
            </View>
            <Text style={styles.summaryAddress}>
              {[property.address, property.suburb, property.state, property.postcode].filter(Boolean).join(', ')}
            </Text>
          </View>
          <Text style={styles.summaryValueLabel}>Current Value</Text>
          <Text style={styles.summaryValue}>{fmt(property.current_estimated_value)}</Text>
          <View style={styles.summaryMetrics}>
            <View style={styles.summaryMetric}>
              <Text style={styles.smLabel}>Purchase</Text>
              <Text style={styles.smValue}>{fmt(property.purchase_price)}</Text>
            </View>
            <View style={styles.summaryMetric}>
              <Text style={styles.smLabel}>Loan</Text>
              <Text style={styles.smValue}>{fmt(property.loan_amount)}</Text>
            </View>
            <View style={styles.summaryMetric}>
              <Text style={styles.smLabel}>Growth</Text>
              <Text style={styles.smValue}>{growth.toFixed(1)}%</Text>
            </View>
          </View>
        </View>

        {/* Specs */}
        <View style={[styles.specsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {[
            { icon: 'bed-outline', val: property.bedrooms, label: 'Beds' },
            { icon: 'water-outline', val: property.bathrooms, label: 'Baths' },
            { icon: 'car-outline', val: property.parking, label: 'Cars' },
            { icon: 'resize-outline', val: property.land_size ? `${property.land_size}m²` : '-', label: 'Land' },
          ].map((s, i) => (
            <View key={i} style={styles.specItem}>
              <Ionicons name={s.icon as any} size={20} color={colors.primary} />
              <Text style={[styles.specVal, { color: colors.textPrimary }]}>{s.val}</Text>
              <Text style={[styles.specLabel, { color: colors.textSecondary }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Financial Metrics */}
        <View style={styles.metricsGrid}>
          {[
            { label: 'Income YTD', value: fmt(totalIncome), color: colors.success },
            { label: 'Expenses YTD', value: fmt(totalExpenses), color: colors.danger },
            { label: 'Net Cashflow', value: fmt(netCashflow), color: netCashflow >= 0 ? colors.success : colors.danger },
            { label: 'Repairs', value: fmt(repairs), color: colors.accent },
            { label: 'ROI', value: `${roi.toFixed(1)}%`, color: colors.primary },
            { label: 'Rate', value: `${property.interest_rate}%`, color: colors.textSecondary },
          ].map((m, i) => (
            <View key={i} style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{m.label}</Text>
              <Text style={[styles.metricValue, { color: m.color }]}>{m.value}</Text>
            </View>
          ))}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity testID="add-income-btn" style={[styles.quickAction, { backgroundColor: colors.success + '15', borderColor: colors.success + '30' }]}
            onPress={() => router.push({ pathname: '/income/add', params: { propertyId: id, propertyName: property.property_name } })}>
            <Ionicons name="trending-up" size={20} color={colors.success} />
            <Text style={[styles.quickActionText, { color: colors.success }]}>Add Income</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="add-expense-btn" style={[styles.quickAction, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '30' }]}
            onPress={() => router.push({ pathname: '/expense/add', params: { propertyId: id, propertyName: property.property_name } })}>
            <Ionicons name="trending-down" size={20} color={colors.danger} />
            <Text style={[styles.quickActionText, { color: colors.danger }]}>Add Expense</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={[styles.tabBar, { borderColor: colors.border }]}>
          {(['overview', 'income', 'expenses'] as const).map(tab => (
            <TouchableOpacity key={tab} testID={`tab-${tab}`} style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <View style={styles.tabContent}>
            {property.notes ? (
              <View style={[styles.notesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.notesTitle, { color: colors.textPrimary }]}>Notes</Text>
                <Text style={[styles.notesText, { color: colors.textSecondary }]}>{property.notes}</Text>
              </View>
            ) : null}
            {/* AI Insights */}
            <View style={[styles.aiCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.aiHeader}>
                <Ionicons name="sparkles" size={20} color={colors.accent} />
                <Text style={[styles.aiTitle, { color: colors.textPrimary }]}>AI Insights</Text>
              </View>
              {aiInsights ? (
                <Text style={[styles.aiText, { color: colors.textSecondary }]}>{aiInsights}</Text>
              ) : (
                <View style={styles.aiButtons}>
                  <TouchableOpacity testID="ai-gpt-btn" style={[styles.aiBtn, { backgroundColor: colors.primary }]}
                    onPress={() => getAIInsights('gpt-5.2')} disabled={aiLoading}>
                    {aiLoading ? <ActivityIndicator size="small" color="#FFF" /> :
                      <Text style={styles.aiBtnText}>GPT-5.2 Analysis</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity testID="ai-gemini-btn" style={[styles.aiBtn, { backgroundColor: colors.accent }]}
                    onPress={() => getAIInsights('gemini-3-flash')} disabled={aiLoading}>
                    {aiLoading ? <ActivityIndicator size="small" color="#FFF" /> :
                      <Text style={styles.aiBtnText}>Gemini Flash</Text>}
                  </TouchableOpacity>
                </View>
              )}
              {aiInsights && (
                <TouchableOpacity onPress={() => setAiInsights(null)} style={styles.refreshAi}>
                  <Ionicons name="refresh" size={14} color={colors.primary} />
                  <Text style={[styles.refreshText, { color: colors.primary }]}>Regenerate</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {activeTab === 'income' && (
          <View style={styles.tabContent}>
            {income.length === 0 ? (
              <Text style={[styles.emptyTab, { color: colors.textSecondary }]}>No income entries yet</Text>
            ) : income.map(i => (
              <View key={i.income_id} style={[styles.entryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.entryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.entryDate, { color: colors.textSecondary }]}>{i.date}</Text>
                    <Text style={[styles.entryType, { color: colors.textPrimary }]}>{i.income_type}{i.tenant_name ? ` - ${i.tenant_name}` : ''}</Text>
                    {(i as any).frequency && (
                      <Text style={[styles.entryNotes, { color: colors.primary }]}>
                        {(i as any).frequency} → ${((i as any).frequency === 'weekly' ? i.amount * 52 : (i as any).frequency === 'fortnightly' ? i.amount * 26 : i.amount * 12).toLocaleString()}/yr
                      </Text>
                    )}
                    {i.notes ? <Text style={[styles.entryNotes, { color: colors.textSecondary }]}>{i.notes}</Text> : null}
                  </View>
                  <Text style={[styles.entryAmount, { color: colors.success }]}>+${i.amount.toLocaleString()}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'expenses' && (
          <View style={styles.tabContent}>
            {expenses.length === 0 ? (
              <Text style={[styles.emptyTab, { color: colors.textSecondary }]}>No expense entries yet</Text>
            ) : expenses.map(e => (
              <View key={e.expense_id} style={[styles.entryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.entryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.entryDate, { color: colors.textSecondary }]}>{e.date}</Text>
                    <Text style={[styles.entryType, { color: colors.textPrimary }]}>{e.category}{e.recurring ? ' (Recurring)' : ''}</Text>
                    {e.notes ? <Text style={[styles.entryNotes, { color: colors.textSecondary }]}>{e.notes}</Text> : null}
                  </View>
                  <View style={styles.entryRight}>
                    <Text style={[styles.entryAmount, { color: colors.danger }]}>-${e.amount.toLocaleString()}</Text>
                    {(e as any).receipt_base64 && (
                      <View style={[styles.receiptBadge, { backgroundColor: colors.primary + '15' }]}>
                        <Ionicons name="receipt-outline" size={12} color={colors.primary} />
                        <Text style={[styles.receiptBadgeText, { color: colors.primary }]}>Receipt</Text>
                      </View>
                    )}
                  </View>
                </View>
                {(e as any).receipt_base64 && (
                  <Image source={{ uri: (e as any).receipt_base64 }} style={styles.receiptThumbnail} resizeMode="cover" />
                )}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
      <AdBanner />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 8 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: { padding: 6 },
  scroll: { paddingHorizontal: 20, paddingTop: 16 },
  imageContainer: { borderRadius: 16, overflow: 'hidden', marginBottom: 12, borderWidth: 1 },
  propertyImage: { width: '100%', height: 200 },
  summaryCard: { borderRadius: 20, padding: 20, marginBottom: 12 },
  summaryTop: { marginBottom: 12 },
  typeTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, marginBottom: 6 },
  typeTagText: { color: '#FFF', fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  summaryAddress: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  summaryValueLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { color: '#FFF', fontSize: 32, fontWeight: '300', letterSpacing: -1 },
  summaryMetrics: { flexDirection: 'row', marginTop: 16, gap: 12 },
  summaryMetric: { flex: 1 },
  smLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'uppercase' },
  smValue: { color: '#FFF', fontSize: 16, fontWeight: '600', marginTop: 2 },
  specsRow: { flexDirection: 'row', borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 12 },
  specItem: { flex: 1, alignItems: 'center', gap: 4 },
  specVal: { fontSize: 16, fontWeight: '700' },
  specLabel: { fontSize: 11 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metricCard: { width: '31%', borderRadius: 12, padding: 12, borderWidth: 1 },
  metricLabel: { fontSize: 11, marginBottom: 4 },
  metricValue: { fontSize: 18, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  quickActionText: { fontSize: 14, fontWeight: '600' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  tabContent: { gap: 8 },
  notesCard: { borderRadius: 12, padding: 16, borderWidth: 1 },
  notesTitle: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  notesText: { fontSize: 14, lineHeight: 20 },
  aiCard: { borderRadius: 12, padding: 16, borderWidth: 1, marginTop: 8 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  aiTitle: { fontSize: 16, fontWeight: '700' },
  aiText: { fontSize: 14, lineHeight: 22 },
  aiButtons: { flexDirection: 'row', gap: 10 },
  aiBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  aiBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  refreshAi: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  refreshText: { fontSize: 13, fontWeight: '500' },
  entryCard: { borderRadius: 12, padding: 14, borderWidth: 1 },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  entryDate: { fontSize: 12, marginBottom: 2 },
  entryType: { fontSize: 15, fontWeight: '600', textTransform: 'capitalize' },
  entryNotes: { fontSize: 13, marginTop: 2 },
  entryAmount: { fontSize: 18, fontWeight: '700' },
  entryRight: { alignItems: 'flex-end', gap: 4 },
  receiptBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  receiptBadgeText: { fontSize: 10, fontWeight: '600' },
  receiptThumbnail: { width: '100%', height: 120, borderRadius: 8, marginTop: 10 },
  emptyTab: { textAlign: 'center', paddingVertical: 40, fontSize: 14 },
});
