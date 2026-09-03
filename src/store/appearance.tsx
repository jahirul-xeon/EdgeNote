/**
 * Appearance preference (§42). Supports System / Light / Dark, persisted in
 * AsyncStorage. `scheme` is the effective light/dark value the theme uses.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

export type AppearancePreference = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';

type AppearanceContextValue = {
  preference: AppearancePreference;
  scheme: Scheme;
  setPreference: (preference: AppearancePreference) => void;
};

const STORAGE_KEY = 'appearance_preference';
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<AppearancePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === 'light' || value === 'dark' || value === 'system') {
          setPreferenceState(value);
        }
      })
      .catch(() => {});
  }, []);

  const value = useMemo<AppearanceContextValue>(() => {
    const resolvedSystem: Scheme = systemScheme === 'dark' ? 'dark' : 'light';
    const scheme: Scheme = preference === 'system' ? resolvedSystem : preference;
    return {
      preference,
      scheme,
      setPreference: (next) => {
        setPreferenceState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      },
    };
  }, [preference, systemScheme]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

/** Effective appearance. Falls back to system when used outside the provider. */
export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  const systemScheme = useColorScheme();
  if (context) return context;
  const scheme: Scheme = systemScheme === 'dark' ? 'dark' : 'light';
  return { preference: 'system', scheme, setPreference: () => {} };
}
