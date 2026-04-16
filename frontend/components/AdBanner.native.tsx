import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../lib/theme';

interface AdBannerProps {
  size?: 'banner' | 'large';
}

// Your real AdMob Ad Unit IDs
const AD_UNIT_IDS = {
  banner: Platform.select({
    ios: 'ca-app-pub-9480363771925708/1516626218',
    android: 'ca-app-pub-9480363771925708/9307473013',
    default: '',
  }),
};

export default function AdBanner({ size = 'banner' }: AdBannerProps) {
  const { colors } = useTheme();
  const height = size === 'large' ? 100 : 60;
  const [adError, setAdError] = useState(false);

  // Try to load real AdMob (only works in development/production builds, not Expo Go)
  if (!adError) {
    try {
      const { BannerAd, BannerAdSize, TestIds } = require('react-native-google-mobile-ads');
      // Use test ads in development, real ads in production
      const adUnitId = __DEV__ ? TestIds.BANNER : (AD_UNIT_IDS.banner || '');

      return (
        <View style={[styles.container, { minHeight: height, backgroundColor: colors.card, borderColor: colors.border }]}>
          <BannerAd
            unitId={adUnitId}
            size={size === 'large' ? BannerAdSize.MEDIUM_RECTANGLE : BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
            onAdLoaded={() => console.log('AdMob: Banner loaded')}
            onAdFailedToLoad={(error: any) => {
              console.log('AdMob: Banner failed to load:', error);
              setAdError(true);
            }}
          />
        </View>
      );
    } catch (e) {
      // Native module not available (Expo Go) — fall through to placeholder
    }
  }

  // Fallback placeholder for Expo Go or ad load failure
  return (
    <View
      testID="ad-banner"
      style={[styles.placeholder, { height, backgroundColor: colors.card, borderColor: colors.border }]}
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
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    overflow: 'hidden',
  },
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
