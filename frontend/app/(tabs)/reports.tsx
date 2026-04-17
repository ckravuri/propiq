import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../lib/theme';
import { apiGet } from '../../lib/api';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
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
      
      // SVG logo for PropIQ (building icon)
      const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="36" height="36"><rect x="0" y="0" width="40" height="40" rx="8" fill="#1C3F35"/><rect x="8" y="14" width="6" height="4" rx="1" fill="white"/><rect x="17" y="14" width="6" height="4" rx="1" fill="white"/><rect x="26" y="14" width="6" height="4" rx="1" fill="white"/><rect x="8" y="21" width="6" height="4" rx="1" fill="white"/><rect x="17" y="21" width="6" height="4" rx="1" fill="white"/><rect x="26" y="21" width="6" height="4" rx="1" fill="white"/><rect x="16" y="28" width="8" height="7" rx="1" fill="white"/><rect x="6" y="10" width="28" height="2" rx="1" fill="white"/><polygon points="20,4 4,10 36,10" fill="white"/></svg>`;
      
      const html = `
        <html><head><style>
          @page {
            margin: 60px 40px 60px 40px;
            size: A4;
          }
          body { font-family: -apple-system, Helvetica Neue, sans-serif; padding: 0; color: #1C1917; margin: 0; }
          
          /* Page header with logo - repeats on every printed page */
          .page-header {
            display: flex;
            align-items: center;
            gap: 12px;
            padding-bottom: 14px;
            border-bottom: 2px solid #1C3F35;
            margin-bottom: 24px;
          }
          .page-header .brand-name {
            font-size: 22px;
            font-weight: 800;
            color: #1C3F35;
            letter-spacing: -0.5px;
          }
          .page-header .brand-tagline {
            font-size: 11px;
            color: #78716C;
            margin-left: auto;
          }
          
          h1 { color: #1C3F35; font-size: 24px; margin: 0 0 4px 0; }
          h2 { color: #1C3F35; font-size: 18px; margin-top: 28px; margin-bottom: 10px; border-bottom: 1px solid #E7E5E4; padding-bottom: 6px; }
          .report-meta { font-size: 12px; color: #78716C; margin-bottom: 20px; }
          .summary-grid { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0; }
          .summary-item { background: #F9F8F6; padding: 12px 14px; border-radius: 8px; flex: 1; min-width: 180px; border: 1px solid #E7E5E4; }
          .summary-label { font-size: 10px; color: #78716C; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
          .summary-value { font-size: 18px; font-weight: 700; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th { background: #1C3F35; color: white; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
          td { padding: 8px 10px; border-bottom: 1px solid #E7E5E4; font-size: 12px; }
          tr:nth-child(even) { background: #FAFAF9; }
          .positive { color: #16A34A; } .negative { color: #DC2626; }
          
          /* Footer on every page */
          .page-footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            text-align: center;
            font-size: 9px;
            color: #A8A29E;
            padding: 10px 40px;
            border-top: 1px solid #E7E5E4;
          }
          
          /* Running header for print pages */
          @media print {
            thead { display: table-header-group; }
            .page-break { page-break-before: always; }
          }
        </style></head><body>
        
        <!-- Page Header with Logo -->
        <div class="page-header">
          ${logoSvg}
          <span class="brand-name">PropIQ Track</span>
          <span class="brand-tagline">Smart Property Investment Tracking</span>
        </div>

        <h1>${propertyName}</h1>
        <div class="report-meta">Financial Year ${currentYear} &nbsp;|&nbsp; Generated ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        
        <h2>Property Details</h2>
        <div class="summary-grid">
          <div class="summary-item"><div class="summary-label">Address</div><div style="font-size:14px;margin-top:4px;">${p.address} ${p.suburb} ${p.state} ${p.postcode}</div></div>
          <div class="summary-item"><div class="summary-label">Type</div><div style="font-size:14px;margin-top:4px;text-transform:capitalize;">${p.property_type}</div></div>
          <div class="summary-item"><div class="summary-label">Bedrooms / Bathrooms / Parking</div><div style="font-size:14px;margin-top:4px;">${p.bedrooms || 0} / ${p.bathrooms || 0} / ${p.parking || 0}</div></div>
        </div>
        <div class="summary-grid">
          <div class="summary-item"><div class="summary-label">Purchase Price</div><div class="summary-value">$${(p.purchase_price || 0).toLocaleString()}</div></div>
          <div class="summary-item"><div class="summary-label">Current Value</div><div class="summary-value">$${(p.current_estimated_value || 0).toLocaleString()}</div></div>
          <div class="summary-item"><div class="summary-label">Loan Amount</div><div class="summary-value">$${(p.loan_amount || 0).toLocaleString()}</div></div>
          <div class="summary-item"><div class="summary-label">Interest Rate</div><div class="summary-value">${p.interest_rate || 0}%</div></div>
        </div>
        
        <h2>Financial Summary</h2>
        <div class="summary-grid">
          <div class="summary-item"><div class="summary-label">Total Income</div><div class="summary-value positive">$${summary.total_income.toLocaleString()}</div></div>
          <div class="summary-item"><div class="summary-label">Total Expenses</div><div class="summary-value negative">$${summary.total_expenses.toLocaleString()}</div></div>
          <div class="summary-item"><div class="summary-label">Net Profit / Loss</div><div class="summary-value ${summary.net_profit_loss >= 0 ? 'positive' : 'negative'}">$${summary.net_profit_loss.toLocaleString()}</div></div>
          <div class="summary-item"><div class="summary-label">Capital Growth</div><div class="summary-value">${summary.capital_growth_pct}%</div></div>
        </div>
        
        <h2>Expense Breakdown</h2>
        <table><tr><th>Category</th><th style="text-align:right">Amount</th></tr>
        ${Object.entries(summary.expense_by_category || {}).map(([cat, amt]) => `<tr><td style="text-transform:capitalize">${cat}</td><td style="text-align:right">$${(amt as number).toLocaleString()}</td></tr>`).join('')}
        ${Object.keys(summary.expense_by_category || {}).length === 0 ? '<tr><td colspan="2" style="text-align:center;color:#A8A29E;padding:16px;">No expenses recorded</td></tr>' : ''}
        </table>
        
        <h2>Income Entries</h2>
        <table><tr><th>Date</th><th>Amount</th><th>Type</th><th>Frequency</th><th>Notes</th></tr>
        ${(summary.income_entries || []).map((i: any) => `<tr><td>${i.date}</td><td>$${(i.amount || 0).toLocaleString()}</td><td style="text-transform:capitalize">${i.income_type || ''}</td><td style="text-transform:capitalize">${i.frequency || ''}</td><td>${i.notes || ''}</td></tr>`).join('')}
        ${(summary.income_entries || []).length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#A8A29E;padding:16px;">No income entries</td></tr>' : ''}
        </table>
        
        <h2>Expense Entries</h2>
        <table><tr><th>Date</th><th>Amount</th><th>Category</th><th>Recurring</th><th>Notes</th></tr>
        ${(summary.expense_entries || []).map((e: any) => `<tr><td>${e.date}</td><td>$${(e.amount || 0).toLocaleString()}</td><td style="text-transform:capitalize">${e.category || ''}</td><td>${e.recurring ? 'Yes (' + (e.frequency || 'monthly') + ')' : 'No'}</td><td>${e.notes || ''}</td></tr>`).join('')}
        ${(summary.expense_entries || []).length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#A8A29E;padding:16px;">No expense entries</td></tr>' : ''}
        </table>

        <!-- Footer -->
        <div class="page-footer">
          PropIQ Track — Smart Property Investment Tracking &nbsp;|&nbsp; Report generated on ${new Date().toLocaleDateString('en-AU')} &nbsp;|&nbsp; Page content is for informational purposes only
        </div>
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
      if (Platform.OS === 'web') {
        // Web: use the base64 endpoint and create a download link
        const data = await apiGet(`/reports/csv/${propertyId}?year=${currentYear}`);
        const csvContent = atob(data.content_base64);
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Mobile: get CSV data via authenticated API, then save to file and share
        const data = await apiGet(`/reports/csv/${propertyId}?year=${currentYear}`);
        const fileUri = FileSystem.documentDirectory + data.filename;
        await FileSystem.writeAsStringAsync(fileUri, data.content_base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: `Export ${propertyName} Report`,
            UTI: 'public.comma-separated-values-text',
          });
        } else {
          Alert.alert('Success', `CSV saved to ${fileUri}`);
        }
      }
    } catch (e: any) {
      const msg = 'CSV export error: ' + (e.message || 'Unknown error');
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert('Error', msg);
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
