import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { I18nManager, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/lib/auth-context";
import { AgeGateProvider } from "@/lib/age-gate-context";
import { SocialAgeGateModal } from "@/components/SocialAgeGateModal";
import { NotificationRouter } from "@/components/NotificationRouter";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

SplashScreen.preventAutoHideAsync();

// Force LTR app-wide (Cledwyn + chat rows mirror under device RTL otherwise).
// Android may need one app restart after first install of this change.
if (I18nManager.isRTL) {
  I18nManager.allowRTL(false);
  I18nManager.forceRTL(false);
}

const iosFormSheet = (detents: number[]) => ({
  presentation: "formSheet" as const,
  sheetAllowedDetents: detents,
  sheetGrabberVisible: true,
});

const androidModal = {
  presentation: "modal" as const,
  animation: "slide_from_bottom" as const,
};

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="enquiry/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="events/index" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="events/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="user-profile/[id]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="settings" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="personal-settings" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="open-business/[workspaceId]" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="schedule" options={{ animation: "slide_from_right" }} />
      <Stack.Screen name="profile" options={{ animation: "slide_from_right" }} />
      <Stack.Screen
        name="new-chat"
        options={Platform.OS === "ios" ? iosFormSheet([0.85]) : androidModal}
      />
      <Stack.Screen
        name="new-group"
        options={Platform.OS === "ios" ? iosFormSheet([0.85]) : androidModal}
      />
      <Stack.Screen
        name="new-post"
        options={Platform.OS === "ios" ? iosFormSheet([0.5]) : androidModal}
      />
      <Stack.Screen
        name="post-comments"
        options={Platform.OS === "ios" ? iosFormSheet([0.75, 1]) : androidModal}
      />
      <Stack.Screen name="in-app-browser" options={{ animation: "slide_from_bottom" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView>
          <KeyboardProvider>
            <AuthProvider>
              <NotificationRouter />
              <AgeGateProvider>
                <StatusBar style="light" />
                <RootLayoutNav />
                <SocialAgeGateModal />
              </AgeGateProvider>
            </AuthProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
