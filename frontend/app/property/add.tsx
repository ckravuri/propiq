import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, KeyboardAvoidingView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../lib/theme';
import { apiPost, apiPut, apiGet } from '../../lib/api';
import { PROPERTY_TYPES, STATES } from '../../lib/types';

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
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.5,
      base64: true,
    };

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        const mimeType = asset.mimeType || 'image/jpeg';
        setImageBase64(`data:${mimeType};base64,${asset.base64}`);
      }
    }
  };

  const update = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

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

  const Field = ({ label, value, onChangeText, keyboardType, placeholder, multiline }: any) => (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput testID={`input-${label.toLowerCase().replace(/\s/g, '-')}`}
        style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.textPrimary }, multiline && styles.multilineInput]}
        value={value} onChangeText={onChangeText} keyboardType={keyboardType || 'default'}
        placeholder={placeholder || ''} placeholderTextColor={colors.textSecondary + '80'}
        multiline={multiline} numberOfLines={multiline ? 3 : 1} />
    </View>
  );

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

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>BASIC INFO</Text>
          <Field label="Property Name" value={form.property_name} onChangeText={(v: string) => update('property_name', v)} placeholder="e.g. Sydney Investment #1" />
          
          {/* Property Type Selector */}
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

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>LOCATION</Text>
          <Field label="Address" value={form.address} onChangeText={(v: string) => update('address', v)} placeholder="Street address" />
          <View style={styles.row}>
            <View style={{ flex: 2 }}><Field label="Suburb" value={form.suburb} onChangeText={(v: string) => update('suburb', v)} /></View>
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
          <Field label="Postcode" value={form.postcode} onChangeText={(v: string) => update('postcode', v)} keyboardType="numeric" />

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>FINANCIALS</Text>
          <Field label="Purchase Price ($)" value={form.purchase_price} onChangeText={(v: string) => update('purchase_price', v)} keyboardType="numeric" />
          <Field label="Purchase Date" value={form.purchase_date} onChangeText={(v: string) => update('purchase_date', v)} placeholder="YYYY-MM-DD" />
          <Field label="Loan Amount ($)" value={form.loan_amount} onChangeText={(v: string) => update('loan_amount', v)} keyboardType="numeric" />
          <Field label="Interest Rate (%)" value={form.interest_rate} onChangeText={(v: string) => update('interest_rate', v)} keyboardType="numeric" />
          <Field label="Current Estimated Value ($)" value={form.current_estimated_value} onChangeText={(v: string) => update('current_estimated_value', v)} keyboardType="numeric" />

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>SPECIFICATIONS</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Field label="Bedrooms" value={form.bedrooms} onChangeText={(v: string) => update('bedrooms', v)} keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}><Field label="Bathrooms" value={form.bathrooms} onChangeText={(v: string) => update('bathrooms', v)} keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}><Field label="Parking" value={form.parking} onChangeText={(v: string) => update('parking', v)} keyboardType="numeric" /></View>
          </View>
          <Field label="Land Size (m²)" value={form.land_size} onChangeText={(v: string) => update('land_size', v)} keyboardType="numeric" />

          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>NOTES</Text>
          <Field label="Notes" value={form.notes} onChangeText={(v: string) => update('notes', v)} multiline placeholder="Any additional notes..." />

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
});
