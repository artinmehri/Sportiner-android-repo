import { Tabs } from 'expo-router';
import React from 'react';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
 
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        tabBarStyle: {
          display : 'flex'
        },
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
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
        }}
      />
      <Tabs.Screen
        name="groupchat"
        options={{
          title: 'Group Chat',
          href: null,
        }}
      />
      <Tabs.Screen
        name="thirdOnbPage"
        options={{
          title: 'Playing Times',
          href: null,
        }}
      />
      <Tabs.Screen
        name="secondOnbPage"
        options={{
          title: 'Tennis Level',
          href: null,
        }}
      />
      <Tabs.Screen
        name="firstOnbPage"
        options={{
          title: 'Onboarding',
          href: null,
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
        name="fourthOnbPage"
        options={{
          title: 'Fourth Onboarding',
          href: null,
        }}
      />
      <Tabs.Screen
        name="fifthOnbPage"
        options={{
          title: 'Fifth Onboarding',
          href: null,
        }}
      />
      <Tabs.Screen
        name="GameConfirm"
        options={{
          title: 'Game Confirmation',
          href: null,
        }}
      />
      <Tabs.Screen
        name="matchVerif"
        options={{
          title: 'Game Verification',
          href: null,
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
      <Tabs.Screen
      name="login"
      options={{
        title: 'Login',
        href: null
      }}
      />
    </Tabs>
  )
};