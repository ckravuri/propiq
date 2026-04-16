import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PieChart, BarChart, LineChart } from 'react-native-chart-kit';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { apiGet, apiPost } from '../../lib/api';
import AdBanner from '../../components/AdBanner';
import type { DashboardData } from '../../lib/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 56;

function fmt(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portfolioHistory, setPortfolioHistory] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [d, history] = await Promise.all([
        apiGet('/dashboard'),
        apiGet('/portfolio/history'),
      ]);
      setData(d);
      setPortfolioHistory(history || []);
      // Auto-snapshot
      try { await apiPost('/portfolio/snapshot'); } catch {}
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator testID="dashboard-loading" size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const p = data?.portfolio;
  const pieData = Object.entries(data?.expense_by_category || {}).map(([name, val], i) => ({
    name: name.length > 12 ? name.substring(0, 12) + '..' : name,
    value: val,
    color: ['#1C3F35', '#D36B4F', '#F2C94C', '#78716C', '#22C55E', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16', '#EF4444'][i % 12],
    legendFontColor: colors.textSecondary,
    legendFontSize: 11,
  }));

  const trendData = data?.monthly_trend || [];
  const barLabels = trendData.slice(-6).map(t => t.month.substring(5));
  const barIncome = trendData.slice(-6).map(t => t.income);
  const barExpenses = trendData.slice(-6).map(t => t.expenses);
  const lineData = trendData.map(t => t.income - t.expenses);

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
    <SafeAreaView testID="dashboard-screen" style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.greeting, { color: colors.textSecondary }]}>Welcome back,</Text>
          <Text style={[styles.userName, { color: colors.textPrimary }]}>{user?.name || 'Investor'}</Text>
        </View>
        <TouchableOpacity testID="add-property-shortcut" onPress={() => router.push('/property/add')}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}>
          <Ionicons name="add" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.primary} />}>

        {/* Portfolio Summary */}
        <View testID="portfolio-summary" style={[styles.summaryCard, { backgroundColor: colors.primary }]}>
          <Text style={styles.summaryLabel}>Total Portfolio Value</Text>
          <Text style={styles.summaryValue}>{fmt(p?.total_market_value || 0)}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Properties</Text>
              <Text style={styles.summaryItemValue}>{p?.total_properties || 0}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>Total Equity</Text>
              <Text style={styles.summaryItemValue}>{fmt(p?.total_equity || 0)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemLabel}>ROI</Text>
              <Text style={styles.summaryItemValue}>{p?.yearly_roi?.toFixed(1) || '0'}%</Text>
            </View>
          </View>
        </View>

        {/* Metrics Grid */}
        <View style={styles.metricsGrid}>
          {[
            { label: 'Yearly Income', value: fmt(p?.total_yearly_income || 0), icon: 'trending-up', color: colors.success },
            { label: 'Yearly Expenses', value: fmt(p?.total_yearly_expenses || 0), icon: 'trending-down', color: colors.danger },
            { label: 'Net Cashflow', value: fmt(p?.net_yearly_cashflow || 0), icon: 'cash-outline', color: (p?.net_yearly_cashflow || 0) >= 0 ? colors.success : colors.danger },
            { label: 'Monthly Avg', value: fmt(p?.monthly_avg_income || 0), icon: 'calendar', color: colors.primary },
          ].map((m, i) => (
            <View key={i} testID={`metric-${m.label.toLowerCase().replace(/\s/g, '-')}`}
              style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.metricIcon, { backgroundColor: m.color + '15' }]}>
                <Ionicons name={m.icon as any} size={18} color={m.color} />
              </View>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{m.label}</Text>
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{m.value}</Text>
            </View>
          ))}
        </View>

        {/* Property Cards */}
        {(data?.property_metrics || []).length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Property Performance</Text>
            {data?.property_metrics.map((pm) => (
              <TouchableOpacity key={pm.property_id} testID={`property-card-${pm.property_id}`}
                style={[styles.propertyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(`/property/${pm.property_id}`)}>
                <View style={styles.propCardHeader}>
                  <View style={[styles.propTypeTag, { backgroundColor: colors.primary + '15' }]}>
                    <Text style={[styles.propTypeText, { color: colors.primary }]}>{pm.property_type}</Text>
                  </View>
                  <Text style={[styles.propName, { color: colors.textPrimary }]}>{pm.property_name}</Text>
                </View>
                <View style={styles.propMetrics}>
                  <View style={styles.propMetric}>
                    <Text style={[styles.propMetricLabel, { color: colors.textSecondary }]}>Value</Text>
                    <Text style={[styles.propMetricVal, { color: colors.textPrimary }]}>{fmt(pm.current_value)}</Text>
                  </View>
                  <View style={styles.propMetric}>
                    <Text style={[styles.propMetricLabel, { color: colors.textSecondary }]}>Cashflow</Text>
                    <Text style={[styles.propMetricVal, { color: pm.net_cashflow >= 0 ? colors.success : colors.danger }]}>{fmt(pm.net_cashflow)}</Text>
                  </View>
                  <View style={styles.propMetric}>
                    <Text style={[styles.propMetricLabel, { color: colors.textSecondary }]}>Growth</Text>
                    <Text style={[styles.propMetricVal, { color: pm.capital_growth >= 0 ? colors.success : colors.danger }]}>{pm.capital_growth.toFixed(1)}%</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Portfolio Growth Chart */}
        {portfolioHistory.length > 2 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Portfolio Growth</Text>
            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <LineChart
                data={{
                  labels: portfolioHistory.filter((_, i) => i % Math.max(1, Math.floor(portfolioHistory.length / 6)) === 0).map(s => s.date?.substring(5) || ''),
                  datasets: [{
                    data: portfolioHistory.map(s => s.total_market_value || 0),
                    color: (o = 1) => `rgba(28, 63, 53, ${o})`,
                    strokeWidth: 2,
                  }, {
                    data: portfolioHistory.map(s => s.total_equity || 0),
                    color: (o = 1) => `rgba(211, 107, 79, ${o})`,
                    strokeWidth: 2,
                  }],
                }}
                width={CHART_WIDTH}
                height={220}
                chartConfig={{ ...chartConfig, color: (o = 1) => `rgba(28, 63, 53, ${o})` }}
                style={styles.chart}
                bezier
                yAxisLabel="$"
                yAxisSuffix=""
                formatYLabel={(v) => { const n = parseInt(v); return n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : v; }}
              />
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#1C3F35' }]} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>Market Value</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#D36B4F' }]} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>Equity</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Income vs Expenses Bar Chart */}
        {barLabels.length > 0 && barIncome.some(v => v > 0) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Income vs Expenses</Text>
            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <BarChart
                data={{
                  labels: barLabels,
                  datasets: [
                    { data: barIncome.length > 0 ? barIncome : [0] },
                    { data: barExpenses.length > 0 ? barExpenses : [0] },
                  ],
                }}
                width={CHART_WIDTH}
                height={200}
                chartConfig={chartConfig}
                style={styles.chart}
                showBarTops={false}
                fromZero
                yAxisLabel="$"
                yAxisSuffix=""
              />
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#1C3F35' }]} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>Income</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#D36B4F' }]} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>Expenses</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Net Cashflow Trend */}
        {lineData.length > 1 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Cashflow Trend</Text>
            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <LineChart
                data={{
                  labels: trendData.map(t => t.month.substring(5)),
                  datasets: [{ data: lineData.length > 0 ? lineData : [0] }],
                }}
                width={CHART_WIDTH}
                height={200}
                chartConfig={{ ...chartConfig, color: (o = 1) => `rgba(28, 63, 53, ${o})` }}
                style={styles.chart}
                bezier
                fromZero
                yAxisLabel="$"
                yAxisSuffix=""
              />
            </View>
          </View>
        )}

        {/* Expense Categories Pie */}
        {pieData.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Expense Breakdown</Text>
            <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <PieChart
                data={pieData}
                width={CHART_WIDTH}
                height={200}
                chartConfig={chartConfig}
                accessor="value"
                backgroundColor="transparent"
                paddingLeft="0"
                absolute
              />
            </View>
          </View>
        )}

        {/* Empty State */}
        {(!data?.property_metrics || data.property_metrics.length === 0) && (
          <View testID="empty-dashboard" style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="home-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Properties Yet</Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>Add your first investment property to start tracking your portfolio.</Text>
            <TouchableOpacity testID="add-first-property-btn" style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/property/add')}>
              <Text style={styles.emptyBtnText}>Add Property</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 70 }} />
      </ScrollView>
      <AdBanner />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  greeting: { fontSize: 13, fontWeight: '500' },
  userName: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 20, paddingTop: 16 },
  summaryCard: { borderRadius: 20, padding: 24, marginBottom: 16 },
  summaryLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 },
  summaryValue: { color: '#FFF', fontSize: 36, fontWeight: '300', letterSpacing: -1, marginVertical: 4 },
  summaryRow: { flexDirection: 'row', marginTop: 16, gap: 16 },
  summaryItem: { flex: 1 },
  summaryItemLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryItemValue: { color: '#FFF', fontSize: 18, fontWeight: '600', marginTop: 2 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  metricCard: { width: (SCREEN_WIDTH - 50) / 2, borderRadius: 16, padding: 16, borderWidth: 1 },
  metricIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  metricLabel: { fontSize: 12, fontWeight: '500', marginBottom: 4 },
  metricValue: { fontSize: 20, fontWeight: '700' },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  chartCard: { borderRadius: 16, padding: 16, borderWidth: 1, overflow: 'hidden' },
  chart: { borderRadius: 12, marginLeft: -8 },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12 },
  propertyCard: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 10 },
  propCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  propTypeTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  propTypeText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  propName: { fontSize: 16, fontWeight: '600', flex: 1 },
  propMetrics: { flexDirection: 'row', gap: 8 },
  propMetric: { flex: 1 },
  propMetricLabel: { fontSize: 11, fontWeight: '500', marginBottom: 2 },
  propMetricVal: { fontSize: 16, fontWeight: '700' },
  emptyState: { borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 1, marginTop: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  emptyDesc: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 20 },
  emptyBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
