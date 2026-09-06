/**
 * Animated splash overlay. Sits on top of the native splash, then plays a short
 * branded entrance — the logo springs in over a soft halo and the "Edge Note"
 * gradient wordmark inks in left→right — before the whole overlay fades to
 * reveal the app. The canvas is a fixed branded dark that matches app.json's
 * native splash backgroundColor so the hand-off is seamless.
 */
import * as SplashScreen from 'expo-splash-screen';
import { useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

const APP_NAME = 'Edge Note';

// Branded splash canvas — fixed dark regardless of theme. Accent (#6366F1) at
// ~15% opacity baked over near-black, giving a deep indigo tint.
const SPLASH_BG = '#171634';

// Soft halo behind the logo.
const GLOW = 240;
const ICON = 112;

// Wordmark canvas (SVG user space, also the on-screen px size).
const W = 280;
const H = 54;
const FONT_SIZE = 34;
const BASELINE = 37;

// Brand indigo → violet, kept regardless of theme so the mark reads on the dark.
const GRADIENT = ['#818CF8', '#6366F1', '#8B5CF6', '#A855F7'] as const;

export function AnimatedSplashOverlay({ onFinish }: { onFinish?: () => void }) {
  const [visible, setVisible] = useState(true);
  const started = useRef(false);

  // Hand the status bar back to the app once the splash fades out. Its
  // hidden/style state is driven declaratively by the root layout (see
  // _layout.tsx) from this callback and the active colour scheme, so
  // native-stack and expo-status-bar agree — setting it imperatively here lost
  // the race with iOS native-stack, which left the icons stuck light.
  const finishSplash = () => {
    setVisible(false);
    onFinish?.();
  };

  const iconScale = useSharedValue(0.72);
  const iconOpacity = useSharedValue(0);
  const wordScale = useSharedValue(0.9);
  const wordOpacity = useSharedValue(0);
  const reveal = useSharedValue(0); // 0→1 left→right ink wipe
  const overlayOpacity = useSharedValue(1);

  const start = () => {
    if (started.current) return;
    started.current = true;
    SplashScreen.hideAsync().finally(() => {
      iconOpacity.value = withTiming(1, { duration: 260 });
      iconScale.value = withSpring(1, { damping: 11, stiffness: 150, mass: 0.9 });

      wordOpacity.value = withDelay(180, withTiming(1, { duration: 220 }));
      wordScale.value = withDelay(180, withSpring(1, { damping: 13, stiffness: 130 }));
      reveal.value = withDelay(220, withTiming(1, { duration: 780, easing: Easing.out(Easing.cubic) }));

      overlayOpacity.value = withDelay(
        1420,
        withTiming(0, { duration: 460 }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(finishSplash);
        }),
      );
    });
  };

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
    transform: [{ scale: wordScale.value }],
  }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  if (!visible) return null;

  return (
    <Animated.View onLayout={start} style={[styles.overlay, overlayStyle]}>
      <Animated.View style={[styles.iconWrap, iconStyle]}>
        <Svg width={GLOW} height={GLOW} style={styles.glow}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#818CF8" stopOpacity="0.55" />
              <Stop offset="0.45" stopColor="#6366F1" stopOpacity="0.25" />
              <Stop offset="1" stopColor="#6366F1" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={GLOW / 2} cy={GLOW / 2} r={GLOW / 2} fill="url(#halo)" />
        </Svg>
        <Image source={require('@/assets/images/splash-icon.png')} style={styles.icon} />
      </Animated.View>

      <Animated.View style={wordStyle}>
        <Wordmark reveal={reveal} />
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The "Edge Note" wordmark: a gradient-filled SVG text that is always rendered,
 * revealed left→right by a solid cover in the splash colour that retracts to the
 * right (a reliable RN layout animation — no animated SVG clip-paths, which
 * reanimated can't drive inside <Defs>).
 */
function Wordmark({ reveal }: { reveal: SharedValue<number> }) {
  const coverStyle = useAnimatedStyle(() => ({ width: (1 - reveal.value) * W }));

  return (
    <View style={styles.word}>
      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
            {GRADIENT.map((c, i) => (
              <Stop key={c} offset={i / (GRADIENT.length - 1)} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <SvgText
          x={W / 2}
          y={BASELINE}
          fontSize={FONT_SIZE}
          fontWeight="bold"
          textAnchor="middle"
          letterSpacing={0.5}
          fill="url(#brand)">
          {APP_NAME}
        </SvgText>
      </Svg>
      <Animated.View style={[styles.cover, coverStyle]} />
    </View>
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
    gap: 22,
    backgroundColor: SPLASH_BG,
    zIndex: 1000,
  },
  iconWrap: {
    width: ICON,
    height: ICON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    left: (ICON - GLOW) / 2,
    top: (ICON - GLOW) / 2,
  },
  icon: {
    width: ICON,
    height: ICON,
    borderRadius: 26,
  },
  word: {
    width: W,
    height: H,
  },
  cover: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: SPLASH_BG,
  },
});
