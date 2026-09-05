/**
 * Animated splash overlay. Sits on top of the native splash, then plays a short
 * branded entrance (logo springs in + fades) and fades the whole overlay away,
 * revealing the app. Background matches the native splash canvas so the
 * hand-off is seamless.
 */
import * as SplashScreen from 'expo-splash-screen';
import { useRef, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function AnimatedSplashOverlay() {
  const theme = useTheme();
  const [visible, setVisible] = useState(true);
  const started = useRef(false);

  const iconScale = useSharedValue(0.72);
  const iconOpacity = useSharedValue(0);
  const nameOpacity = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  const start = () => {
    if (started.current) return;
    started.current = true;
    SplashScreen.hideAsync().finally(() => {
      iconOpacity.value = withTiming(1, { duration: 240 });
      iconScale.value = withSpring(1, { damping: 11, stiffness: 150, mass: 0.9 });
      nameOpacity.value = withDelay(220, withTiming(1, { duration: 300 }));
      overlayOpacity.value = withDelay(
        980,
        withTiming(0, { duration: 420 }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(setVisible, false);
        }),
      );
    });
  };

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));
  const nameStyle = useAnimatedStyle(() => ({ opacity: nameOpacity.value }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  if (!visible) return null;

  return (
    <Animated.View
      onLayout={start}
      style={[styles.overlay, { backgroundColor: theme.background }, overlayStyle]}>
      <Animated.View style={iconStyle}>
        <Image source={require('@/assets/images/splash-icon.png')} style={styles.icon} />
      </Animated.View>
      <Animated.Text style={[styles.name, { color: theme.text, fontFamily: Fonts?.rounded }, nameStyle]}>
        Edge Note
      </Animated.Text>
    </Animated.View>
  );
}

/** Standalone animated logo (kept for API parity with the web variant). */
export function AnimatedIcon() {
  return <Image source={require('@/assets/images/splash-icon.png')} style={styles.icon} />;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    zIndex: 1000,
  },
  icon: {
    width: 112,
    height: 112,
    borderRadius: 26,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
