import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';

interface AdBannerProps {
  size?: 'banner' | 'large';
}

// Mock AdMob Banner - Replace with react-native-google-mobile-ads in production
// Test ad unit IDs would go here:
// Banner: ca-app-pub-3940256099942544/6300978111
// Interstitial: ca-app-pub-3940256099942544/1033173712
// Rewarded: ca-app-pub-3940256099942544/5224354917
export default function AdBanner({ size = 'banner' }: AdBannerProps) {
  const { colors } = useTheme();
  const height = size === 'large' ? 100 : 50;

  return (
    <View
      testID="ad-banner"
      style={[
        styles.container,
        {
          height,
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Ad Space
      </Text>
      <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
        AdMob Integration Ready
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subLabel: {
    fontSize: 9,
    marginTop: 2,
  },
});
