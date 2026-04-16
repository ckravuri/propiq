import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Polygon, Path } from 'react-native-svg';

interface PropIQLogoProps {
  size?: number;
  showText?: boolean;
  color?: string;
  textColor?: string;
}

export default function PropIQLogo({ size = 64, showText = false, color = '#FFFFFF', textColor }: PropIQLogoProps) {
  const iconSize = size;
  const padding = iconSize * 0.12;
  const buildingW = iconSize * 0.6;
  const buildingH = iconSize * 0.55;
  const roofH = iconSize * 0.18;
  const cx = iconSize / 2;

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { width: iconSize, height: iconSize, borderRadius: iconSize * 0.22, backgroundColor: 'rgba(255,255,255,0.15)' }]}>
        <Svg width={iconSize * 0.7} height={iconSize * 0.7} viewBox="0 0 100 100">
          {/* Roof */}
          <Polygon
            points="50,8 10,38 90,38"
            fill={color}
            strokeWidth={0}
          />
          {/* Main building */}
          <Rect x="16" y="38" width="68" height="52" rx="3" fill={color} />
          {/* Windows row 1 */}
          <Rect x="24" y="44" width="14" height="10" rx="2" fill="#1C3F35" opacity={0.85} />
          <Rect x="43" y="44" width="14" height="10" rx="2" fill="#1C3F35" opacity={0.85} />
          <Rect x="62" y="44" width="14" height="10" rx="2" fill="#1C3F35" opacity={0.85} />
          {/* Windows row 2 */}
          <Rect x="24" y="60" width="14" height="10" rx="2" fill="#1C3F35" opacity={0.85} />
          <Rect x="43" y="60" width="14" height="10" rx="2" fill="#1C3F35" opacity={0.85} />
          <Rect x="62" y="60" width="14" height="10" rx="2" fill="#1C3F35" opacity={0.85} />
          {/* Door */}
          <Rect x="40" y="76" width="20" height="16" rx="3" fill="#1C3F35" opacity={0.85} />
          {/* Door handle */}
          <Rect x="55" y="83" width="3" height="3" rx="1.5" fill={color} />
          {/* Chimney */}
          <Rect x="70" y="16" width="10" height="22" rx="2" fill={color} />
        </Svg>
      </View>
      {showText && (
        <Text style={[styles.brandText, { color: textColor || color }]}>PropIQ</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  iconWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 14,
  },
});
