/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import "@/global.css";

import { Platform } from "react-native";

/**
 * Edge Note palette — a modern indigo/violet system on iOS-style grouped
 * surfaces: a soft canvas (`background`) with white/near-black cards
 * (`backgroundElement`). Accent is a calm indigo that reads as premium in both
 * light and dark.
 */
export const Colors = {
  light: {
    text: "#000000",
    background: "#F2F2F7",
    backgroundElement: "#FFFFFF",
    backgroundSelected: "#E5E5EA",
    textSecondary: "#8A8A8E",
    accent: "#5B5BD6",
    accentContrast: "#FFFFFF",
    separator: "#D6D6DB",
    danger: "#E5484D",
  },
  dark: {
    text: "#FFFFFF",
    background: "#000000",
    backgroundElement: "#1C1C1E",
    backgroundSelected: "#2C2C2E",
    textSecondary: "#8E8E93",
    accent: "#8B8BF5",
    accentContrast: "#FFFFFF",
    separator: "#38383A",
    danger: "#FF6369",
  },
} as const;

/** Brand color for icons/splash (matches `accent`). */
export const BrandColor = "#5B5BD6";
export const BrandColorDark = "#4B45B8";

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
