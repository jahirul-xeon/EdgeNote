import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppearanceProvider, useAppearance } from '@/store/appearance';
import { AuthProvider } from '@/store/auth';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { scheme } = useAppearance();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AuthProvider>
        <AnimatedSplashOverlay />
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="folder/[id]" options={{ headerBackTitle: 'Folders' }} />
          <Stack.Screen
            name="note/[id]"
            options={{ title: '', headerBackTitle: 'Notes', headerShadowVisible: false }}
          />
          <Stack.Screen name="trash" options={{ headerBackTitle: 'Folders' }} />
          <Stack.Screen name="settings" options={{ headerBackTitle: 'Folders' }} />
          <Stack.Screen name="search" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="move/[id]" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="folder-edit" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="auth" options={{ headerShown: false, presentation: 'modal' }} />
        </Stack>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppearanceProvider>
          <RootNavigator />
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
