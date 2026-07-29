import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();
  const isDark = colorScheme === 'dark';

  if (loading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/SignUp" />;
  }
 
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        tabBarStyle: {
          display : 'flex',
          backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF'
        },
        tabBarActiveTintColor: isDark ? '#19E675' : '#19E675', 
        tabBarInactiveTintColor: isDark ? '#888888' : '#666666',
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="message.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: 'Games',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gamecontroller.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="SignUp"
        options={{
          title: 'Sign Up',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="arrow.down.circle.fill" color={color} />,
          tabBarBadge: 3,
          href: null,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="groupchat"
        options={{
          title: 'Group Chat',
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="EventDetails"
        options={{
          tabBarStyle: { display: 'none' },
          href: null,
        }}
      />
      <Tabs.Screen
        name="CreateGame"
        options={{
          title: 'Create Game',
          href: null,
        }}
      />
      <Tabs.Screen
        name="GameConfirmation"
        options={{
          title: 'Confirmation',
          href: null,
        }}
      />
      <Tabs.Screen
        name="profileSettings"
        options={{
          title: 'Settings',
          href: null,
        }}
      />
      <Tabs.Screen
        name="profileDetails"
        options={{
          title: 'Profile Details',
          href: null,
        }}
      />
      <Tabs.Screen
        name="matchVerif"
        options={{
          title: 'Game Verification',
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: 'Requests',
          href: null,
        }}
      />
      <Tabs.Screen
        name="congratsGame"
        options={{
          title: 'Congratulation on Game',
          href: null,
        }}
      />
    </Tabs>
  )
};
