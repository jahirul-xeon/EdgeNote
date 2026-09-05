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
    text: "#1A1A24",
    background: "#F4F4F8",
    backgroundElement: "#FFFFFF",
    backgroundSelected: "#ECECF3",
    textSecondary: "#6C6C7A",
    accent: "#5B5BD6",
    accentContrast: "#FFFFFF",
    separator: "#E6E6EE",
    danger: "#E5484D",
  },
  dark: {
    text: "#F4F4F8",
    background: "#0C0C12",
    backgroundElement: "#17171F",
    backgroundSelected: "#23232E",
    textSecondary: "#9A9AAC",
    accent: "#8B8BF5",
    accentContrast: "#FFFFFF",
    separator: "#26262F",
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
