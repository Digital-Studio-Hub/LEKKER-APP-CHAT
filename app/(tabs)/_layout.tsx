import { Tabs, useFocusEffect } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { useAgeGate } from "@/lib/age-gate-context";
import { getCachedPersonalCare, fetchPersonalCare } from "@/lib/personal-settings";
import * as Haptics from "expo-haptics";

export default function TabLayout() {
  const isWeb = Platform.OS === "web";
  const isIOS = Platform.OS === "ios";
  const { user } = useAuth();
  const { socialMediaAllowed } = useAgeGate();
  const [companionMode, setCompanionMode] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const cached = await getCachedPersonalCare();
        if (!cancelled) setCompanionMode(!!cached.companionEnabled);
        try {
          const remote = await fetchPersonalCare();
          if (!cancelled) setCompanionMode(!!remote.companionEnabled);
        } catch {
          /* keep cache */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const isLekkerpreneur = !!user?.isVerifiedLekkerpreneur;
  const showMail = isLekkerpreneur && !!user?.workspaceEmailActive;
  const showFeed = socialMediaAllowed && !companionMode;

  function blockIfCompanion(label: string) {
    return {
      tabPress: (e: { preventDefault: () => void }) => {
        if (!companionMode) return;
        e.preventDefault();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          "Companion mode",
          `${label} is turned off while Companion mode is on. Family can change this in Personal Settings (PIN).`,
        );
      },
    };
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : Colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: Colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.background }]} />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: "Poppins_500Medium",
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cledwyn"
        options={{
          title: "Cledwyn",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="directory"
        options={{
          title: "Directory",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="people-outline"
              size={size}
              color={color}
              style={{ opacity: companionMode ? 0.35 : 1 }}
            />
          ),
          tabBarLabelStyle: {
            fontFamily: "Poppins_500Medium",
            fontSize: 11,
            opacity: companionMode ? 0.35 : 1,
          },
        }}
        listeners={blockIfCompanion("Directory")}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: "Newsfeed",
          href: showFeed ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="layers-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="compass-outline"
              size={size}
              color={color}
              style={{ opacity: companionMode ? 0.35 : 1 }}
            />
          ),
          tabBarLabelStyle: {
            fontFamily: "Poppins_500Medium",
            fontSize: 11,
            opacity: companionMode ? 0.35 : 1,
          },
        }}
        listeners={blockIfCompanion("Browse")}
      />
      <Tabs.Screen
        name="software"
        options={{
          title: "Software",
          href: isLekkerpreneur && !companionMode ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mail"
        options={{
          title: "Mail",
          href: showMail && !companionMode ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="mail-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="network"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
