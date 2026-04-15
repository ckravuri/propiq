import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const Colors = {
  light: {
    background: '#F9F8F6',
    card: '#FFFFFF',
    primary: '#1C3F35',
    primaryLight: '#2D6A4F',
    accent: '#D36B4F',
    accentLight: '#E8957E',
    textPrimary: '#1C1917',
    textSecondary: '#78716C',
    textInverse: '#FFFFFF',
    border: '#E7E5E4',
    success: '#22C55E',
    danger: '#EF4444',
    warning: '#F2C94C',
    chartGreen: '#1C3F35',
    chartOrange: '#D36B4F',
    chartYellow: '#F2C94C',
    chartGray: '#E0E0E0',
    inputBg: '#FFFFFF',
    shadow: 'rgba(0,0,0,0.04)',
  },
  dark: {
    background: '#1C1917',
    card: '#292524',
    primary: '#2D6A4F',
    primaryLight: '#3D8B6A',
    accent: '#D36B4F',
    accentLight: '#E8957E',
    textPrimary: '#F5F5F4',
    textSecondary: '#A8A29E',
    textInverse: '#1C1917',
    border: '#44403C',
    success: '#22C55E',
    danger: '#EF4444',
    warning: '#F2C94C',
    chartGreen: '#3D8B6A',
    chartOrange: '#D36B4F',
    chartYellow: '#F2C94C',
    chartGray: '#57534E',
    inputBg: '#292524',
    shadow: 'rgba(0,0,0,0.2)',
  },
};

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  colors: typeof Colors.light;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'light',
  colors: Colors.light,
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem('theme_mode').then(val => {
      if (val === 'dark' || val === 'light') setMode(val);
    });
  }, []);

  const toggleTheme = () => {
    const next = mode === 'light' ? 'dark' : 'light';
    setMode(next);
    AsyncStorage.setItem('theme_mode', next);
  };

  return (
    <ThemeContext.Provider value={{ mode, colors: Colors[mode], toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
