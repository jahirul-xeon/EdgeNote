/**
 * Liquid Glass surface (§23, §24, §44).
 *
 * On iOS 26 with Liquid Glass available, renders a native `GlassView`.
 * Everywhere else — older iOS, Android, web — it falls back to a themed
 * translucent surface so the app is never unusable without glass. If the user
 * has "Reduce Transparency" enabled, we render an opaque surface (§43).
 */
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppearance } from '@/store/appearance';

type GlassSurfaceProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 'regular' is more opaque/legible; 'clear' is lighter. */
  glassStyle?: 'regular' | 'clear';
};

function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((value) => active && setReduce(value))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

export function GlassSurface({ children, style, glassStyle = 'regular' }: GlassSurfaceProps) {
  const { scheme } = useAppearance();
  const reduceTransparency = useReduceTransparency();
  const useNativeGlass = isLiquidGlassAvailable() && !reduceTransparency;

  if (useNativeGlass) {
    return (
      <GlassView style={style} glassEffectStyle={glassStyle}>
        {children}
      </GlassView>
    );
  }

  // Fallback: translucent (or opaque under reduce-transparency) themed surface.
  const dark = scheme === 'dark';
  const backgroundColor = reduceTransparency
    ? dark
      ? '#1C1C1E'
      : '#F2F2F5'
    : dark
      ? 'rgba(28,28,30,0.82)'
      : 'rgba(248,248,250,0.82)';
  const borderColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  return <View style={[styles.fallback, { backgroundColor, borderColor }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  fallback: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
