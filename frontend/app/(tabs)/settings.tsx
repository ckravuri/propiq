import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const { mode, colors, toggleTheme } = useTheme();
  const router = useRouter();

  const SettingRow = ({ icon, label, value, onPress, rightComponent }: any) => (
    <TouchableOpacity style={[styles.settingRow, { borderBottomColor: colors.border }]}
      onPress={onPress} disabled={!onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={[styles.settingIcon, { backgroundColor: colors.primary + '15' }]}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{label}</Text>
        {value && <Text style={[styles.settingValue, { color: colors.textSecondary }]}>{value}</Text>}
      </View>
      {rightComponent || (onPress && <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />)}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView testID="settings-screen" style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View testID="user-profile-card" style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{(user?.name || 'U')[0].toUpperCase()}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.textPrimary }]}>{user?.name || 'User'}</Text>
            <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>{user?.email || ''}</Text>
          </View>
        </View>

        {/* Appearance */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>APPEARANCE</Text>
        <View style={[styles.settingGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="moon" label="Dark Mode"
            rightComponent={
              <Switch testID="dark-mode-toggle" value={mode === 'dark'} onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF" />
            } />
        </View>

        {/* General */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>GENERAL</Text>
        <View style={[styles.settingGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="alarm" label="Bill Reminders" value="Manage recurring bills" onPress={() => router.push('/reminders')} />
          <SettingRow icon="notifications" label="Notifications" value="Enabled" />
          <SettingRow icon="shield-checkmark" label="Privacy" value="Standard" />
          <SettingRow icon="help-circle" label="Help & Support" />
          <SettingRow icon="information-circle" label="About PropIQ" value="Version 1.0.0" />
        </View>

        {/* Account */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ACCOUNT</Text>
        <View style={[styles.settingGroup, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity testID="sign-out-btn" style={styles.signOutBtn} onPress={signOut}>
            <Ionicons name="log-out" size={18} color={colors.danger} />
            <Text style={[styles.signOutText, { color: colors.danger }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: '700' },
  scroll: { padding: 20 },
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 24, gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '700' },
  profileEmail: { fontSize: 13, marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 8, marginTop: 8, paddingHorizontal: 4 },
  settingGroup: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, gap: 12 },
  settingIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  settingContent: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: '500' },
  settingValue: { fontSize: 13, marginTop: 1 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
  signOutText: { fontSize: 15, fontWeight: '600' },
});
