import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem('session_token');
  } catch {
    return null;
  }
}

async function getHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function apiGet(path: string) {
  const headers = await getHeaders();
  const resp = await fetch(`${API_URL}/api${path}`, {
    headers,
    credentials: 'include',
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function apiPost(path: string, body?: any) {
  const headers = await getHeaders();
  const resp = await fetch(`${API_URL}/api${path}`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function apiPut(path: string, body: any) {
  const headers = await getHeaders();
  const resp = await fetch(`${API_URL}/api${path}`, {
    method: 'PUT',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function apiDelete(path: string) {
  const headers = await getHeaders();
  const resp = await fetch(`${API_URL}/api${path}`, {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function exchangeSession(sessionId: string) {
  const resp = await fetch(`${API_URL}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!resp.ok) {
    throw new Error('Session exchange failed');
  }
  const data = await resp.json();
  // Extract session token from cookie or response
  if (data.session_token) {
    await AsyncStorage.setItem('session_token', data.session_token);
  }
  return data;
}
