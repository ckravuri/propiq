import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/theme';
import { apiGet } from '../../lib/api';
import type { Property } from '../../lib/types';

function fmt(n: number) {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function PropertiesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProperties = useCallback(async () => {
    try {
      const data = await apiGet('/properties');
      setProperties(data);
    } catch (e) {
      console.error('Fetch properties error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchProperties(); }, [fetchProperties]));

  const PropertyCard = ({ item }: { item: Property }) => (
    <TouchableOpacity testID={`property-item-${item.property_id}`}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/property/${item.property_id}`)} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={[styles.typeTag, { backgroundColor: colors.primary + '15' }]}>
          <Ionicons name={item.property_type === 'house' ? 'home' : item.property_type === 'unit' ? 'business' : 'layers'} size={14} color={colors.primary} />
          <Text style={[styles.typeText, { color: colors.primary }]}>{item.property_type}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
      </View>
      <Text style={[styles.cardName, { color: colors.textPrimary }]}>{item.property_name}</Text>
      <Text style={[styles.cardAddress, { color: colors.textSecondary }]}>
        {[item.address, item.suburb, item.state, item.postcode].filter(Boolean).join(', ')}
      </Text>
      <View style={styles.cardMetrics}>
        <View style={styles.cardMetric}>
          <Text style={[styles.cardMetricLabel, { color: colors.textSecondary }]}>Purchase</Text>
          <Text style={[styles.cardMetricValue, { color: colors.textPrimary }]}>{fmt(item.purchase_price)}</Text>
        </View>
        <View style={styles.cardMetric}>
          <Text style={[styles.cardMetricLabel, { color: colors.textSecondary }]}>Current</Text>
          <Text style={[styles.cardMetricValue, { color: colors.primary }]}>{fmt(item.current_estimated_value)}</Text>
        </View>
        <View style={styles.cardMetric}>
          <Text style={[styles.cardMetricLabel, { color: colors.textSecondary }]}>Loan</Text>
          <Text style={[styles.cardMetricValue, { color: colors.textPrimary }]}>{fmt(item.loan_amount)}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <View style={styles.specRow}>
          <Ionicons name="bed-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.specText, { color: colors.textSecondary }]}>{item.bedrooms}</Text>
          <Ionicons name="water-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.specText, { color: colors.textSecondary }]}>{item.bathrooms}</Text>
          <Ionicons name="car-outline" size={14} color={colors.textSecondary} />
          <Text style={[styles.specText, { color: colors.textSecondary }]}>{item.parking}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator testID="properties-loading" size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView testID="properties-screen" style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Properties</Text>
        <TouchableOpacity testID="add-property-btn" style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/property/add')}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {properties.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="home-outline" size={56} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No properties yet</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>Tap "Add" to add your first property</Text>
        </View>
      ) : (
        <FlatList
          data={properties}
          keyExtractor={item => item.property_id}
          renderItem={({ item }) => <PropertyCard item={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchProperties(); }} tintColor={colors.primary} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  list: { padding: 20, gap: 12 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  typeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  cardName: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  cardAddress: { fontSize: 13, marginBottom: 14 },
  cardMetrics: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  cardMetric: { flex: 1 },
  cardMetricLabel: { fontSize: 11, fontWeight: '500', marginBottom: 2 },
  cardMetricValue: { fontSize: 16, fontWeight: '700' },
  cardFooter: { borderTopWidth: 0.5, borderTopColor: '#E7E5E4', paddingTop: 10 },
  specRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  specText: { fontSize: 13, marginRight: 8 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  emptyDesc: { fontSize: 14, marginTop: 6, textAlign: 'center' },
});
