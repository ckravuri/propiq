import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { apiGet, apiPost, exchangeSession } from './api';
import type { User } from './types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const hasProcessedCallback = useRef(false);

  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    try {
      // Check for session_id in URL hash (web only - after OAuth redirect)
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const hash = window.location.hash;
        if (hash.includes('session_id=') && !hasProcessedCallback.current) {
          hasProcessedCallback.current = true;
          const params = new URLSearchParams(hash.substring(1));
          const sessionId = params.get('session_id');
          if (sessionId) {
            try {
              const userData = await exchangeSession(sessionId);
              setUser(userData);
              // Clean URL
              window.history.replaceState(null, '', window.location.pathname);
              setLoading(false);
              return;
            } catch (e) {
              console.error('Session exchange failed:', e);
            }
          }
        }
      }

      // Check existing session
      const token = await AsyncStorage.getItem('session_token');
      if (token) {
        try {
          const userData = await apiGet('/auth/me');
          setUser(userData);
        } catch {
          await AsyncStorage.removeItem('session_token');
        }
      }
    } catch (e) {
      console.error('Auth init error:', e);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const redirectUrl = window.location.origin + '/';
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    } else {
      const redirectUrl = Linking.createURL('/');
      const result = await WebBrowser.openAuthSessionAsync(
        `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`,
        redirectUrl
      );
      if (result.type === 'success' && result.url) {
        const hash = result.url.split('#')[1];
        if (hash) {
          const params = new URLSearchParams(hash);
          const sessionId = params.get('session_id');
          if (sessionId) {
            const userData = await exchangeSession(sessionId);
            setUser(userData);
          }
        }
      }
    }
  };

  const signOut = async () => {
    try {
      await apiPost('/auth/logout');
    } catch {}
    await AsyncStorage.removeItem('session_token');
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const userData = await apiGet('/auth/me');
      setUser(userData);
    } catch {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
