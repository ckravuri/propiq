import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import { useTheme } from '../../lib/theme';
import { apiGet } from '../../lib/api';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import type { Property } from '../../lib/types';

const CHART_W = Dimensions.get('window').width - 56;

interface YearData {
  year: number;
  income: number;
  expenses: number;
  net_cashflow: number;
  repairs: number;
  entry_count: number;
}

interface Comparison {
  property_id: string;
  property_name: string;
  purchase_price: number;
  current_value: number;
  years: YearData[];
}

export default function ReportsScreen() {
  const { colors } = useTheme();
  const [properties, setProperties] = useState<Property[]>([]);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'export' | 'compare'>('export');
  const currentYear = new Date().getFullYear();

  useFocusEffect(useCallback(() => {
    const load = async () => {
      try {
        const props = await apiGet('/properties');
        setProperties(props);
        const comps = await Promise.all(props.map((p: Property) => apiGet(`/reports/comparison/${p.property_id}`)));
        setComparisons(comps);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []));

  const generatePDF = async (propertyId: string, propertyName: string) => {
    setGenerating(propertyId + '_pdf');
    try {
      const summary = await apiGet(`/reports/summary/${propertyId}?year=${currentYear}`);
      const p = summary.property;
      const html = `
        <html><head><style>
          body { font-family: -apple-system, sans-serif; padding: 40px; color: #1C1917; }
          h1 { color: #1C3F35; font-size: 28px; border-bottom: 2px solid #1C3F35; padding-bottom: 10px; }
          h2 { color: #1C3F35; font-size: 20px; margin-top: 30px; }
          .summary-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0; }
          .summary-item { background: #F9F8F6; padding: 12px; border-radius: 8px; flex: 1; min-width: 200px; }
          .summary-label { font-size: 12px; color: #78716C; text-transform: uppercase; }
          .summary-value { font-size: 20px; font-weight: 700; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #1C3F35; color: white; padding: 8px; text-align: left; font-size: 12px; }
          td { padding: 8px; border-bottom: 1px solid #E7E5E4; font-size: 12px; }
          .positive { color: #22C55E; } .negative { color: #EF4444; }
        </style></head><body>
        <h1>PropIQ Report - ${propertyName}</h1>
        <p>Year: ${currentYear} | Generated: ${new Date().toLocaleDateString()}</p>
        <h2>Property Summary</h2>
        <div class="summary-grid">
          <div class="summary-item"><div class="summary-label">Address</div><div>${p.address} ${p.suburb} ${p.state} ${p.postcode}</div></div>
          <div class="summary-item"><div class="summary-label">Type</div><div>${p.property_type}</div></div>
          <div class="summary-item"><div class="summary-label">Purchase Price</div><div class="summary-value">$${(p.purchase_price || 0).toLocaleString()}</div></div>
          <div class="summary-item"><div class="summary-label">Current Value</div><div class="summary-value">$${(p.current_estimated_value || 0).toLocaleString()}</div></div>
        </div>
        <h2>Financial Summary</h2>
        <div class="summary-grid">
          <div class="summary-item"><div class="summary-label">Total Income</div><div class="summary-value positive">$${summary.total_income.toLocaleString()}</div></div>
          <div class="summary-item"><div class="summary-label">Total Expenses</div><div class="summary-value negative">$${summary.total_expenses.toLocaleString()}</div></div>
          <div class="summary-item"><div class="summary-label">Net Profit/Loss</div><div class="summary-value ${summary.net_profit_loss >= 0 ? 'positive' : 'negative'}">$${summary.net_profit_loss.toLocaleString()}</div></div>
          <div class="summary-item"><div class="summary-label">Capital Growth</div><div class="summary-value">${summary.capital_growth_pct}%</div></div>
        </div>
        <h2>Expense Breakdown</h2>
        <table><tr><th>Category</th><th>Amount</th></tr>
        ${Object.entries(summary.expense_by_category || {}).map(([cat, amt]) => `<tr><td>${cat}</td><td>$${(amt as number).toLocaleString()}</td></tr>`).join('')}
        </table>
        <h2>Income Entries</h2>
        <table><tr><th>Date</th><th>Amount</th><th>Type</th><th>Notes</th></tr>
        ${(summary.income_entries || []).map((i: any) => `<tr><td>${i.date}</td><td>$${i.amount}</td><td>${i.income_type}</td><td>${i.notes}</td></tr>`).join('')}
        </table>
        <h2>Expense Entries</h2>
        <table><tr><th>Date</th><th>Amount</th><th>Category</th><th>Notes</th></tr>
        ${(summary.expense_entries || []).map((e: any) => `<tr><td>${e.date}</td><td>$${e.amount}</td><td>${e.category}</td><td>${e.notes}</td></tr>`).join('')}
        </table>
        <p style="margin-top:40px;color:#78716C;font-size:11px;">Generated by PropIQ</p>
        </body></html>`;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      }
    } catch (e: any) {
      if (Platform.OS === 'web') {
        alert('PDF generation error: ' + e.message);
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setGenerating(null);
    }
  };

  const generateCSV = async (propertyId: string, propertyName: string) => {
    setGenerating(propertyId + '_csv');
    try {
      const data = await apiGet(`/reports/csv/${propertyId}?year=${currentYear}`);
      const csvContent = atob(data.content_base64);
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        a.click();
      } else {
        const fileUri = FileSystem.documentDirectory + data.filename;
        await FileSystem.writeAsStringAsync(fileUri, csvContent);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        }
      }
    } catch (e: any) {
      if (Platform.OS === 'web') {
        alert('CSV export error: ' + e.message);
      } else {
        Alert.alert('Error', e.message);
      }
    } finally {
      setGenerating(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator testID="reports-loading" size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView testID="reports-screen" style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Reports</Text>
        <Text style={[styles.year, { color: colors.textSecondary }]}>Year {currentYear}</Text>
      </View>

      {/* Tab Switcher */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(['export', 'compare'] as const).map(tab => (
          <TouchableOpacity key={tab} testID={`reports-tab-${tab}`}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>
              {tab === 'export' ? 'Export Reports' : 'Year Comparison'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {properties.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Properties</Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>Add properties to generate reports</Text>
          </View>
        ) : (
          <>
          {activeTab === 'export' && properties.map(p => (
            <View key={p.property_id} style={[styles.reportCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.reportHeader}>
                <View>
                  <Text style={[styles.reportName, { color: colors.textPrimary }]}>{p.property_name}</Text>
                  <Text style={[styles.reportAddress, { color: colors.textSecondary }]}>
                    {[p.suburb, p.state].filter(Boolean).join(', ')}
                  </Text>
                </View>
                <View style={[styles.typeTag, { backgroundColor: colors.primary + '15' }]}>
                  <Text style={[styles.typeText, { color: colors.primary }]}>{p.property_type}</Text>
                </View>
              </View>
              <View style={styles.reportActions}>
                <TouchableOpacity testID={`pdf-btn-${p.property_id}`}
                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => generatePDF(p.property_id, p.property_name)}
                  disabled={generating !== null}>
                  {generating === p.property_id + '_pdf' ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="document" size={16} color="#FFF" />
                      <Text style={styles.actionText}>PDF Report</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity testID={`csv-btn-${p.property_id}`}
                  style={[styles.actionBtn, { backgroundColor: colors.accent }]}
                  onPress={() => generateCSV(p.property_id, p.property_name)}
                  disabled={generating !== null}>
                  {generating === p.property_id + '_csv' ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="download" size={16} color="#FFF" />
                      <Text style={styles.actionText}>CSV Export</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {activeTab === 'compare' && comparisons.map(comp => {
            const activeYears = comp.years.filter(y => y.entry_count > 0 || y.year === currentYear);
            const chartYears = activeYears.length > 0 ? activeYears : comp.years.slice(-3);
            const chartConfig = {
              backgroundGradientFrom: colors.card,
              backgroundGradientTo: colors.card,
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(28, 63, 53, ${opacity})`,
              labelColor: () => colors.textSecondary,
              propsForLabels: { fontSize: 10 },
              propsForBackgroundLines: { stroke: colors.border },
            };

            return (
              <View key={comp.property_id} testID={`comparison-${comp.property_id}`}
                style={[styles.compCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.compTitle, { color: colors.textPrimary }]}>{comp.property_name}</Text>
                <Text style={[styles.compSubtitle, { color: colors.textSecondary }]}>
                  Purchase: ${comp.purchase_price.toLocaleString()} | Current: ${comp.current_value.toLocaleString()}
                </Text>

                {/* Yearly Cashflow Bar Chart */}
                <Text style={[styles.compChartLabel, { color: colors.textSecondary }]}>Net Cashflow by Year</Text>
                <BarChart
                  data={{
                    labels: chartYears.map(y => String(y.year)),
                    datasets: [{ data: chartYears.map(y => Math.max(y.net_cashflow, 0.01)) }],
                  }}
                  width={CHART_W}
                  height={180}
                  chartConfig={chartConfig}
                  style={{ borderRadius: 12, marginLeft: -8 }}
                  showBarTops={false}
                  fromZero
                  yAxisLabel="$"
                  yAxisSuffix=""
                />

                {/* Year-by-Year Table */}
                <View style={[styles.compTable, { borderColor: colors.border }]}>
                  <View style={[styles.compRow, styles.compRowHeader, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.compCell, styles.compCellHead]}>Year</Text>
                    <Text style={[styles.compCell, styles.compCellHead]}>Income</Text>
                    <Text style={[styles.compCell, styles.compCellHead]}>Expenses</Text>
                    <Text style={[styles.compCell, styles.compCellHead]}>Net</Text>
                    <Text style={[styles.compCell, styles.compCellHead]}>Repairs</Text>
                  </View>
                  {chartYears.map(y => (
                    <View key={y.year} style={[styles.compRow, { borderBottomColor: colors.border }]}>
                      <Text style={[styles.compCell, { color: colors.textPrimary, fontWeight: '600' }]}>{y.year}</Text>
                      <Text style={[styles.compCell, { color: colors.success }]}>${y.income.toLocaleString()}</Text>
                      <Text style={[styles.compCell, { color: colors.danger }]}>${y.expenses.toLocaleString()}</Text>
                      <Text style={[styles.compCell, { color: y.net_cashflow >= 0 ? colors.success : colors.danger, fontWeight: '700' }]}>
                        ${y.net_cashflow.toLocaleString()}
                      </Text>
                      <Text style={[styles.compCell, { color: colors.textSecondary }]}>${y.repairs.toLocaleString()}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: '700' },
  year: { fontSize: 14, fontWeight: '600' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 20 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  scroll: { padding: 20, gap: 12 },
  reportCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  reportName: { fontSize: 17, fontWeight: '700' },
  reportAddress: { fontSize: 13, marginTop: 2 },
  typeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  reportActions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  actionText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  compCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
  compTitle: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  compSubtitle: { fontSize: 13, marginBottom: 16 },
  compChartLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  compTable: { borderWidth: 1, borderRadius: 10, overflow: 'hidden', marginTop: 12 },
  compRow: { flexDirection: 'row', borderBottomWidth: 0.5 },
  compRowHeader: { borderBottomWidth: 0 },
  compCell: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, fontSize: 12, textAlign: 'center' },
  compCellHead: { color: '#FFF', fontWeight: '600', fontSize: 11 },
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  emptyDesc: { fontSize: 14, marginTop: 6 },
});
