/**
 * Stable per-install device id, persisted in AsyncStorage. Used as the final
 * tiebreaker in conflict resolution (§12).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createId } from '@/utils/id';

const KEY = 'device_id';
let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
  } catch {
    // Storage unavailable — fall through to an ephemeral id for this session.
  }
  const id = createId('device');
  cached = id;
  try {
    await AsyncStorage.setItem(KEY, id);
  } catch {
    // Ignore; a non-persisted id still works for this session.
  }
  return id;
}
