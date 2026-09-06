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
  Easing,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppearance } from '@/store/appearance';

const APP_NAME = 'Edge Note';
/** Each letter reveals over this slice of the shared 0→1 progress; the leftover
 * before 1 is the stagger between consecutive letters (last letter lands at 1). */
const LETTER_WINDOW = 0.42;

export function AnimatedSplashOverlay() {
  const theme = useTheme();
  const [visible, setVisible] = useState(true);
  const started = useRef(false);
  const { scheme } = useAppearance();

  const iconScale = useSharedValue(0.72);
  const iconOpacity = useSharedValue(0);
  const nameProgress = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  const start = () => {
    if (started.current) return;
    started.current = true;
    SplashScreen.hideAsync().finally(() => {
      iconOpacity.value = withTiming(1, { duration: 240 });
      iconScale.value = withSpring(1, { damping: 11, stiffness: 150, mass: 0.9 });
      // Drives the staggered per-letter reveal of the app name.
      nameProgress.value = withDelay(
        200,
        withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) }),
      );
      overlayOpacity.value = withDelay(
        1120,
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
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  if (!visible) return null;

  const letters = APP_NAME.split('');
  const step = letters.length > 1 ? (1 - LETTER_WINDOW) / (letters.length - 1) : 0;

  return (
    <Animated.View
      onLayout={start}
      style={[styles.overlay, { backgroundColor: theme.background }, overlayStyle]}>
      <Animated.View style={iconStyle}>
        <Image source={require('@/assets/images/splash-icon.png')} style={styles.icon} />
      </Animated.View>
      <Animated.View style={styles.name}>
        {letters.map((char, i) => (
          <AnimatedLetter
            key={`${char}-${i}`}
            char={char}
            start={i * step}
            progress={nameProgress}
            color={scheme === 'dark' ? theme.text : theme.accent}
          />
        ))}
      </Animated.View>
    </Animated.View>
  );
}

/** A single glyph of the app name: fades in, rises and settles as the shared
 * name progress sweeps through this letter's [start, start + window] slice. */
function AnimatedLetter({
  char,
  start,
  progress,
  color,
}: {
  char: string;
  start: number;
  progress: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const t = interpolate(progress.value, [start, start + LETTER_WINDOW], [0, 1], 'clamp');
    return {
      opacity: t,
      transform: [
        { translateY: interpolate(t, [0, 1], [16, 0]) },
        { scale: interpolate(t, [0, 1], [0.86, 1]) },
      ],
    };
  });

  // Spaces have no glyph, but keep them in flow for correct word spacing.
  if (char === ' ') return <Animated.Text style={[styles.letter, { color }]}> </Animated.Text>;

  return (
    <Animated.Text style={[styles.letter, { color, fontFamily: Fonts?.rounded }, style]}>
      {char}
    </Animated.Text>
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
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  letter: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
