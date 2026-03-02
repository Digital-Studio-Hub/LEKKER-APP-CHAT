import { Dimensions, PixelRatio, Platform } from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const BASE_WIDTH = 375;

export function scale(size: number): number {
  const ratio = SCREEN_WIDTH / BASE_WIDTH;
  const scaled = size * ratio;
  return Math.round(PixelRatio.roundToNearestPixel(scaled));
}

export function moderateScale(size: number, factor: number = 0.5): number {
  const ratio = SCREEN_WIDTH / BASE_WIDTH;
  return Math.round(PixelRatio.roundToNearestPixel(size + (size * (ratio - 1)) * factor));
}

export function fontScale(size: number): number {
  const ratio = SCREEN_WIDTH / BASE_WIDTH;
  const newSize = size * Math.min(ratio, 1.3);
  return Math.round(PixelRatio.roundToNearestPixel(newSize));
}

export const isSmallScreen = SCREEN_WIDTH < 350;
export const isMediumScreen = SCREEN_WIDTH >= 350 && SCREEN_WIDTH < 400;
export const isLargeScreen = SCREEN_WIDTH >= 400;

export const screenWidth = SCREEN_WIDTH;
export const screenHeight = SCREEN_HEIGHT;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function responsivePadding(): number {
  if (isSmallScreen) return 12;
  if (isMediumScreen) return 16;
  return 20;
}

export function responsiveAvatarSize(base: number): number {
  if (isSmallScreen) return Math.round(base * 0.85);
  return base;
}

export function responsiveMaxBubbleWidth(): string {
  if (isSmallScreen) return "85%";
  return "78%";
}
