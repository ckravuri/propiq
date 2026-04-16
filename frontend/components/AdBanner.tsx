import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme';

interface AdBannerProps {
  size?: 'banner' | 'large';
}

// Web version: Always shows placeholder since AdMob requires native builds
export default function AdBanner({ size = 'banner' }: AdBannerProps) {
  const { colors } = useTheme();
  const height = size === 'large' ? 100 : 60;

  return (
    <View
      testID="ad-banner"
      style={[
        styles.placeholder,
        {
          height,
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={[styles.adBadge, { backgroundColor: colors.primary + '10' }]}>
        <Text style={[styles.adBadgeText, { color: colors.primary }]}>AD</Text>
      </View>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Advertisement
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
  },
  adBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  adBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
