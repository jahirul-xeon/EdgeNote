import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/store/auth';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
