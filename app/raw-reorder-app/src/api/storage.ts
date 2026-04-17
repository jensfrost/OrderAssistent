// api/storage.ts
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (!isWeb && typeof SecureStore.getItemAsync === 'function') {
      return SecureStore.getItemAsync(key);
    }
    try { return window.localStorage.getItem(key); } catch { return null; }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!isWeb && typeof SecureStore.setItemAsync === 'function') {
      return SecureStore.setItemAsync(key, value);
    }
    try { window.localStorage.setItem(key, value); } catch {}
  },

  async deleteItem(key: string): Promise<void> {
    if (!isWeb && typeof SecureStore.deleteItemAsync === 'function') {
      return SecureStore.deleteItemAsync(key);
    }
    try { window.localStorage.removeItem(key); } catch {}
  },
};
