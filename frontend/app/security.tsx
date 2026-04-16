import React from 'react';
import { ScrollView, Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';

export default function SecurityPolicyScreen() {
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
        <Text style={[styles.title, { color: colors.textPrimary }]}>Security Policy</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.lastUpdated, { color: colors.textSecondary }]}>Last Updated: April 2026</Text>

        <Section title="1. Security Overview">
PropIQ implements industry-standard cybersecurity measures to protect your investment property data. Our security framework is designed to ensure confidentiality, integrity, and availability of all user data.</Section>

        <Section title="2. Authentication & Access Control">
- OAuth 2.0 authentication via Google Sign-In{"\n"}- Session tokens with automatic expiration (24-hour validity){"\n"}- No passwords stored — delegated to Google's secure infrastructure{"\n"}- Server-side session validation on every API request{"\n"}- Automatic session invalidation on sign-out</Section>

        <Section title="3. Data Encryption">
In Transit:{"\n"}- All API communications use TLS 1.2+ encryption{"\n"}- HTTPS enforced for all endpoints{"\n"}- Certificate pinning for API connections{"\n\n"}At Rest:{"\n"}- Database encryption using AES-256{"\n"}- Encrypted storage for uploaded images and documents{"\n"}- Secure key management practices</Section>

        <Section title="4. Infrastructure Security">
- Cloud-hosted on enterprise-grade infrastructure{"\n"}- Network isolation and firewall rules{"\n"}- Regular security patches and updates{"\n"}- DDoS protection{"\n"}- Automated backup with encrypted storage{"\n"}- 99.9% uptime SLA</Section>

        <Section title="5. Application Security">
- Input validation and sanitization on all user inputs{"\n"}- Protection against SQL injection, XSS, and CSRF attacks{"\n"}- Rate limiting on API endpoints{"\n"}- Secure file upload handling with type validation{"\n"}- Content Security Policy headers{"\n"}- Regular dependency vulnerability scanning</Section>

        <Section title="6. Data Protection Practices">
- Principle of least privilege for data access{"\n"}- No logging of sensitive financial data{"\n"}- Automated data purge on account deletion{"\n"}- Regular data integrity checks{"\n"}- Secure data export (encrypted PDF/CSV generation)</Section>

        <Section title="7. Incident Response">
In the event of a security incident:{"\n"}- Immediate containment and investigation{"\n"}- User notification within 72 hours of confirmed breach{"\n"}- Root cause analysis and remediation{"\n"}- Post-incident review and security improvements{"\n"}- Compliance with applicable data breach notification laws</Section>

        <Section title="8. Compliance">
PropIQ adheres to:{"\n"}- Australian Privacy Act 1988 and Australian Privacy Principles (APPs){"\n"}- OWASP Top 10 security guidelines{"\n"}- Google Play and Apple App Store security requirements{"\n"}- Industry best practices for financial data handling</Section>

        <Section title="9. User Responsibilities">
To maintain security, we recommend:{"\n"}- Keep your Google account secure with a strong password and 2FA{"\n"}- Don't share your device or PropIQ session with others{"\n"}- Keep the PropIQ app updated to the latest version{"\n"}- Report any suspicious activity to security@propiq.app</Section>

        <Section title="10. Security Contact">
To report security vulnerabilities or concerns:{"\n"}Email: security@propiq.app{"\n\n"}We take all security reports seriously and will respond within 48 hours.</Section>

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
