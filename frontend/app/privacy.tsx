import React from 'react';
import { ScrollView, Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';

export default function PrivacyPolicyScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const Section = ({ title, children }: { title: string; children: string }) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>{children}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Privacy Policy</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.lastUpdated, { color: colors.textSecondary }]}>Last Updated: April 2026</Text>

        <Section title="1. Introduction">
PropIQ Track ("we", "our", "us") is committed to protecting the privacy and security of your personal information. This Privacy Policy explains how we collect, use, store, and protect your data when you use the PropIQ Track mobile application ("App"). By using PropIQ Track, you consent to the practices described in this policy.</Section>

        <Section title="2. Information We Collect">
Account Information: When you sign in via Google, we receive your name and email address.{"\n\n"}Property Data: Property addresses, purchase prices, valuations, specifications (bedrooms, bathrooms, land size), and photos you upload.{"\n\n"}Financial Data: Income entries, expense records, receipt images, and bill reminders you create within the App.{"\n\n"}Usage Data: App interaction logs, device type, operating system version, and crash reports for improving the App.{"\n\n"}We do NOT collect: passwords (Google handles authentication), location data, contacts, or any data from other apps on your device.</Section>

        <Section title="3. How We Use Your Data">
Your data is used solely to:{"\n"}- Provide property tracking, financial calculations, and reporting features{"\n"}- Generate PDF and CSV reports at your request{"\n"}- Display personalized dashboard metrics{"\n"}- Improve app performance and fix bugs{"\n"}- Send bill reminders you have configured{"\n\n"}We do NOT sell, rent, or share your personal data with third parties for marketing purposes.</Section>

        <Section title="4. Data Storage & Security">
All data is stored in encrypted databases hosted on secure cloud infrastructure.{"\n\n"}Security measures include:{"\n"}- TLS/SSL encryption for all data in transit{"\n"}- Encrypted database storage for data at rest{"\n"}- Session-based authentication with secure token management{"\n"}- Regular security audits and vulnerability assessments{"\n"}- Access controls limiting data access to authorized services only{"\n\n"}Property images and receipt attachments are stored as encrypted data within our secure database infrastructure.</Section>

        <Section title="5. Third-Party Services">
We use the following third-party services:{"\n"}- Google Sign-In: For secure authentication (governed by Google's Privacy Policy){"\n"}- Google AdMob: For displaying advertisements (governed by Google's Ad Policy){"\n"}- OpenStreetMap/Photon: For address autocomplete (no personal data shared){"\n\n"}These services operate under their own privacy policies and we recommend reviewing them.</Section>

        <Section title="6. Data Retention">
Your data is retained for as long as your account is active. Upon account deletion request, all personal data, property records, financial entries, and uploaded images will be permanently deleted within 30 days.</Section>

        <Section title="7. Your Rights">
You have the right to:{"\n"}- Access all data we hold about you{"\n"}- Export your data via CSV/PDF reports{"\n"}- Request correction of inaccurate data{"\n"}- Request deletion of your account and all associated data{"\n"}- Withdraw consent for data processing{"\n\n"}To exercise these rights, contact us at privacy@propiq.app</Section>

        <Section title="8. Children's Privacy">
PropIQ is not intended for use by individuals under 18 years of age. We do not knowingly collect personal information from children.</Section>

        <Section title="9. Advertising">
PropIQ displays advertisements via Google AdMob. AdMob may use device identifiers and usage data to serve relevant ads. You can opt out of personalized advertising through your device settings. We do not share your property or financial data with advertisers.</Section>

        <Section title="10. Changes to This Policy">
We may update this Privacy Policy from time to time. Changes will be posted within the App, and continued use after changes constitutes acceptance of the updated policy.</Section>

        <Section title="11. Contact Us">
For privacy-related inquiries:{"\n"}Email: privacy@propiq.app{"\n\n"}For data deletion requests:{"\n"}Email: delete@propiq.app</Section>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: '700' },
  scroll: { padding: 20 },
  lastUpdated: { fontSize: 12, marginBottom: 20, fontStyle: 'italic' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  sectionBody: { fontSize: 14, lineHeight: 22 },
});
