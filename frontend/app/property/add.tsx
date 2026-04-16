import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, KeyboardAvoidingView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../lib/theme';
import { apiPost, apiPut, apiGet } from '../../lib/api';
import { PROPERTY_TYPES, STATES } from '../../lib/types';

const AU_STATE_MAP: Record<string, string> = {
  'New South Wales': 'NSW', 'Victoria': 'VIC', 'Queensland': 'QLD',
  'South Australia': 'SA', 'Western Australia': 'WA', 'Tasmania': 'TAS',
  'Northern Territory': 'NT', 'Australian Capital Territory': 'ACT',
};

interface AddressSuggestion {
  display: string;
  street: string;
  suburb: string;
  state: string;
  postcode: string;
}

export default function AddPropertyScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEdit = !!editId;

  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEdit);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [form, setForm] = useState({
    property_name: '', address: '', suburb: '', state: '', postcode: '',
    purchase_price: '', purchase_date: '', loan_amount: '', interest_rate: '',
    current_estimated_value: '', property_type: 'house', bedrooms: '0',
    bathrooms: '0', parking: '0', land_size: '', notes: '',
  });

  // Address autocomplete
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingAddr, setSearchingAddr] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Property detail lookup
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [detailSource, setDetailSource] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit) {
      apiGet(`/properties/${editId}`).then(p => {
        setForm({
          property_name: p.property_name || '',
          address: p.address || '',
          suburb: p.suburb || '',
          state: p.state || '',
          postcode: p.postcode || '',
          purchase_price: String(p.purchase_price || ''),
          purchase_date: p.purchase_date || '',
          loan_amount: String(p.loan_amount || ''),
          interest_rate: String(p.interest_rate || ''),
          current_estimated_value: String(p.current_estimated_value || ''),
          property_type: p.property_type || 'house',
          bedrooms: String(p.bedrooms || 0),
          bathrooms: String(p.bathrooms || 0),
          parking: String(p.parking || 0),
          land_size: String(p.land_size || ''),
          notes: p.notes || '',
        });
        if (p.image_base64) setImageBase64(p.image_base64);
      }).catch(console.error).finally(() => setLoadingEdit(false));
    }
  }, [editId]);

  const update = useCallback((key: string, val: string) => {
    setForm(prev => ({ ...prev, [key]: val }));
  }, []);

  // Debounced address search
  const onAddressChange = useCallback((text: string) => {
    update('address', text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearchingAddr(true);
      try {
        const results = await apiGet(`/address/search?q=${encodeURIComponent(text)}`);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setSearchingAddr(false);
      }
    }, 400);
  }, [update]);

  const selectAddress = useCallback(async (addr: AddressSuggestion) => {
    const stateAbbr = AU_STATE_MAP[addr.state] || addr.state;
    setForm(prev => ({
      ...prev,
      address: addr.street,
      suburb: addr.suburb,
      state: stateAbbr,
      postcode: addr.postcode,
    }));
    setSuggestions([]);
    setShowSuggestions(false);
    setDetailSource(null);
  }, []);

  // Separate function to suggest property details — user-triggered
  const suggestPropertyDetails = useCallback(async () => {
    if (!form.suburb && !form.address) return;
    setFetchingDetails(true);
    setDetailSource(null);
    try {
      const stateAbbr = form.state;
      const params = new URLSearchParams({
        street: form.address || '',
        suburb: form.suburb || '',
        state: stateAbbr || '',
        postcode: form.postcode || '',
      });
      const details = await apiGet(`/property/lookup?${params.toString()}`);
      if (details && details.source !== 'default') {
        setForm(prev => ({
          ...prev,
          bedrooms: String(details.bedrooms || prev.bedrooms),
          bathrooms: String(details.bathrooms || prev.bathrooms),
          parking: String(details.parking || prev.parking),
          land_size: details.land_size ? String(Math.round(details.land_size)) : prev.land_size,
          property_type: details.property_type || prev.property_type,
        }));
        setDetailSource('AI Suggestion');
      }
    } catch (e) {
      console.log('Property lookup failed:', e);
    } finally {
      setFetchingDetails(false);
    }
  }, [form.address, form.suburb, form.state, form.postcode]);

  const pickImage = async (source: 'library' | 'camera') => {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        const msg = 'Camera permission is required to take photos';
        Platform.OS === 'web' ? alert(msg) : Alert.alert('Permission needed', msg);
        return;
      }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const msg = 'Photo library permission is required to select images';
        Platform.OS === 'web' ? alert(msg) : Alert.alert('Permission needed', msg);
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = {
      allowsEditing: true, aspect: [16, 9], quality: 0.5, base64: true,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled && result.assets[0]?.base64) {
      const asset = result.assets[0];
      setImageBase64(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
    }
  };

  const handleSave = async () => {
    if (!form.property_name.trim()) {
      const msg = 'Property name is required';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Validation', msg);
      return;
    }
    setSaving(true);
    try {
      const body = {
        property_name: form.property_name.trim(),
        address: form.address.trim(),
        suburb: form.suburb.trim(),
        state: form.state.trim(),
        postcode: form.postcode.trim(),
        purchase_price: parseFloat(form.purchase_price) || 0,
        purchase_date: form.purchase_date.trim(),
        loan_amount: parseFloat(form.loan_amount) || 0,
        interest_rate: parseFloat(form.interest_rate) || 0,
        current_estimated_value: parseFloat(form.current_estimated_value) || 0,
        property_type: form.property_type,
        bedrooms: parseInt(form.bedrooms) || 0,
        bathrooms: parseInt(form.bathrooms) || 0,
        parking: parseInt(form.parking) || 0,
        land_size: parseFloat(form.land_size) || 0,
        notes: form.notes.trim(),
        image_base64: imageBase64,
      };
      if (isEdit) {
        await apiPut(`/properties/${editId}`, body);
      } else {
        await apiPost('/properties', body);
      }
      router.back();
    } catch (e: any) {
      const msg = e.message || 'Failed to save';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  if (loadingEdit) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView testID="add-property-screen" style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity testID="cancel-btn" onPress={() => router.back()} style={styles.cancelBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{isEdit ? 'Edit Property' : 'Add Property'}</Text>
          <TouchableOpacity testID="save-property-btn" style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#FFF" /> :
              <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* PROPERTY IMAGE */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PROPERTY IMAGE</Text>
          <View style={[styles.imageSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {imageBase64 ? (
              <View>
                <Image testID="property-image-preview" source={{ uri: imageBase64 }} style={styles.imagePreview} resizeMode="cover" />
                <View style={styles.imageActions}>
                  <TouchableOpacity testID="change-image-btn" style={[styles.imageBtn, { backgroundColor: colors.primary }]} onPress={() => pickImage('library')}>
                    <Ionicons name="images" size={16} color="#FFF" />
                    <Text style={styles.imageBtnText}>Change</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID="remove-image-btn" style={[styles.imageBtn, { backgroundColor: colors.danger }]} onPress={() => setImageBase64(null)}>
                    <Ionicons name="trash" size={16} color="#FFF" />
                    <Text style={styles.imageBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.imagePlaceholder}>
                <Ionicons name="image-outline" size={40} color={colors.textSecondary} />
                <Text style={[styles.imagePlaceholderText, { color: colors.textSecondary }]}>Add a property photo</Text>
                <View style={styles.imageActions}>
                  <TouchableOpacity testID="pick-photo-btn" style={[styles.imageBtn, { backgroundColor: colors.primary }]} onPress={() => pickImage('library')}>
                    <Ionicons name="images" size={16} color="#FFF" />
                    <Text style={styles.imageBtnText}>Gallery</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID="take-photo-btn" style={[styles.imageBtn, { backgroundColor: colors.accent }]} onPress={() => pickImage('camera')}>
                    <Ionicons name="camera" size={16} color="#FFF" />
                    <Text style={styles.imageBtnText}>Camera</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* BASIC INFO */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>BASIC INFO</Text>
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Property Name</Text>
            <TextInput testID="input-property-name" style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
              value={form.property_name} onChangeText={v => update('property_name', v)} placeholder="e.g. Sydney Investment #1" placeholderTextColor={colors.textSecondary + '80'} />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Property Type</Text>
            <View style={styles.chipRow}>
              {PROPERTY_TYPES.map(t => (
                <TouchableOpacity key={t} testID={`type-${t}`}
                  style={[styles.chip, { borderColor: colors.border }, form.property_type === t && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => update('property_type', t)}>
                  <Text style={[styles.chipText, { color: colors.textPrimary }, form.property_type === t && { color: '#FFF' }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* LOCATION - Address with autocomplete */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>LOCATION</Text>
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Address</Text>
            <View>
              <TextInput testID="input-address" style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                value={form.address} onChangeText={onAddressChange} placeholder="Start typing an Australian address..."
                placeholderTextColor={colors.textSecondary + '80'} />
              {searchingAddr && (
                <View style={[styles.searchingRow]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.searchingText, { color: colors.textSecondary }]}>Searching addresses...</Text>
                </View>
              )}
              {showSuggestions && suggestions.length > 0 && (
                <View style={[styles.suggestionsBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {suggestions.map((s, i) => (
                    <TouchableOpacity key={i} testID={`address-suggestion-${i}`}
                      style={[styles.suggestionRow, i < suggestions.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: 0.5 }]}
                      onPress={() => selectAddress(s)}>
                      <Ionicons name="location" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.suggestionStreet, { color: colors.textPrimary }]} numberOfLines={1}>
                          {s.street || s.display.split(',')[0]}
                        </Text>
                        <Text style={[styles.suggestionDetail, { color: colors.textSecondary }]} numberOfLines={2}>
                          {s.display}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 2 }}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Suburb</Text>
                <TextInput testID="input-suburb" style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                  value={form.suburb} onChangeText={v => update('suburb', v)} placeholderTextColor={colors.textSecondary + '80'} />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>State</Text>
                <View style={styles.chipRow}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {STATES.map(s => (
                      <TouchableOpacity key={s} style={[styles.stateChip, { borderColor: colors.border }, form.state === s && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                        onPress={() => update('state', s)}>
                        <Text style={[styles.stateChipText, { color: colors.textPrimary }, form.state === s && { color: '#FFF' }]}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Postcode</Text>
            <TextInput testID="input-postcode" style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
              value={form.postcode} onChangeText={v => update('postcode', v)} keyboardType="numeric" placeholderTextColor={colors.textSecondary + '80'} />
          </View>

          {/* FINANCIALS */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>FINANCIALS</Text>
          {[
            { label: 'Purchase Price ($)', key: 'purchase_price', kb: 'numeric' as const },
            { label: 'Purchase Date', key: 'purchase_date', ph: 'YYYY-MM-DD' },
            { label: 'Loan Amount ($)', key: 'loan_amount', kb: 'numeric' as const },
            { label: 'Interest Rate (%)', key: 'interest_rate', kb: 'numeric' as const },
            { label: 'Current Estimated Value ($)', key: 'current_estimated_value', kb: 'numeric' as const },
          ].map(f => (
            <View key={f.key} style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{f.label}</Text>
              <TextInput testID={`input-${f.key}`} style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                value={(form as any)[f.key]} onChangeText={v => update(f.key, v)}
                keyboardType={f.kb || 'default'} placeholder={f.ph || ''} placeholderTextColor={colors.textSecondary + '80'} />
            </View>
          ))}

          {/* SPECIFICATIONS */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>SPECIFICATIONS</Text>
          
          {/* Suggest details button - only shown when address is filled */}
          {(form.suburb || form.address) && !fetchingDetails && !detailSource && (
            <TouchableOpacity
              testID="suggest-details-btn"
              style={[styles.suggestBtn, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}
              onPress={suggestPropertyDetails}
            >
              <Ionicons name="sparkles" size={16} color={colors.primary} />
              <Text style={[styles.suggestBtnText, { color: colors.primary }]}>
                Suggest details for this address
              </Text>
            </TouchableOpacity>
          )}
          {fetchingDetails && (
            <View style={[styles.detailBanner, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.detailBannerText, { color: colors.primary }]}>
                Looking up property details...
              </Text>
            </View>
          )}
          {detailSource && !fetchingDetails && (
            <View style={[styles.detailBanner, { backgroundColor: '#FFF3E0', borderColor: '#FFE0B2' }]}>
              <Ionicons name="information-circle" size={16} color="#E65100" />
              <Text style={[styles.detailBannerText, { color: '#E65100' }]}>
                Suggested values — please verify and edit as needed
              </Text>
            </View>
          )}
          <View style={styles.row}>
            {[
              { label: 'Bedrooms', key: 'bedrooms' },
              { label: 'Bathrooms', key: 'bathrooms' },
              { label: 'Parking', key: 'parking' },
            ].map(f => (
              <View key={f.key} style={{ flex: 1 }}>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{f.label}</Text>
                  <TextInput testID={`input-${f.key}`} style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
                    value={(form as any)[f.key]} onChangeText={v => update(f.key, v)} keyboardType="numeric" placeholderTextColor={colors.textSecondary + '80'} />
                </View>
              </View>
            ))}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Land Size (m²)</Text>
            <TextInput testID="input-land-size" style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
              value={form.land_size} onChangeText={v => update('land_size', v)} keyboardType="numeric" placeholderTextColor={colors.textSecondary + '80'} />
          </View>

          {/* NOTES */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>NOTES</Text>
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Notes</Text>
            <TextInput testID="input-notes" style={[styles.input, styles.multilineInput, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }]}
              value={form.notes} onChangeText={v => update('notes', v)} multiline numberOfLines={3} placeholder="Any additional notes..."
              placeholderTextColor={colors.textSecondary + '80'} />
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
  cancelBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  saveBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  scroll: { padding: 20 },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  fieldGroup: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  multilineInput: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '500', textTransform: 'capitalize' },
  stateChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, marginRight: 6 },
  stateChipText: { fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 10 },
  imageSection: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
  imagePreview: { width: '100%', height: 200, borderRadius: 14 },
  imagePlaceholder: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  imagePlaceholderText: { fontSize: 14 },
  imageActions: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16 },
  imageBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  imageBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  // Address autocomplete
  searchingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 4 },
  searchingText: { fontSize: 13 },
  suggestionsBox: { borderWidth: 1, borderRadius: 12, marginTop: 4, overflow: 'hidden' },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  suggestionStreet: { fontSize: 14, fontWeight: '600' },
  suggestionDetail: { fontSize: 12, marginTop: 1 },
  // Property detail banner
  detailBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  detailBannerText: { fontSize: 13, fontWeight: '500', flex: 1 },
  suggestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  suggestBtnText: { fontSize: 14, fontWeight: '600' },
});
