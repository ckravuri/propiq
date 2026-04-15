import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';

export default function LoginScreen() {
  const { user, loading, signIn } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (user && !loading) {
      router.replace('/(tabs)/dashboard');
    }
  }, [user, loading]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.primary }]}>
        <ActivityIndicator size="large" color={colors.textInverse} />
      </View>
    );
  }

  if (user) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.primary }]}>
      <View style={styles.topSection}>
        <View style={[styles.logoCircle, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
          <Ionicons name="business" size={48} color="#FFFFFF" />
        </View>
        <Text style={styles.appName}>PropIQ</Text>
        <Text style={styles.tagline}>Smart Property Investment Tracking</Text>
      </View>

      <View style={[styles.bottomSection, { backgroundColor: colors.background }]}>
        <Text style={[styles.welcomeTitle, { color: colors.textPrimary }]}>
          Welcome to PropIQ
        </Text>
        <Text style={[styles.welcomeDesc, { color: colors.textSecondary }]}>
          Track your property portfolio, rental income, expenses, and get AI-powered investment insights.
        </Text>

        <View style={styles.features}>
          {[
            { icon: 'trending-up', text: 'Portfolio Analytics' },
            { icon: 'cash-outline', text: 'Income & Expense Tracking' },
            { icon: 'document-text', text: 'Tax-Ready Reports' },
            { icon: 'sparkles', text: 'AI Investment Insights' },
          ].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: colors.primary + '15' }]}>
                <Ionicons name={f.icon as any} size={18} color={colors.primary} />
              </View>
              <Text style={[styles.featureText, { color: colors.textPrimary }]}>{f.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          testID="google-sign-in-btn"
          style={[styles.signInBtn, { backgroundColor: colors.primary }]}
          onPress={signIn}
          activeOpacity={0.8}
        >
          <Ionicons name="logo-google" size={20} color="#FFFFFF" />
          <Text style={styles.signInText}>Continue with Google</Text>
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
          By signing in, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1 },
  topSection: {
    flex: 0.35,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 6,
  },
  bottomSection: {
    flex: 0.65,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 28,
    paddingTop: 32,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  welcomeDesc: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  features: { marginBottom: 32, gap: 14 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: { fontSize: 15, fontWeight: '500' },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
  },
  signInText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
