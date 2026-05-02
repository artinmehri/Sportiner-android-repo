<<<<<<< HEAD
import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
=======
import { Tabs, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
>>>>>>> 9b8c7f1e84da425159ef2248069f713aa8930bd6
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';

const publicScreens = ['(tabs)/SignUp', '(tabs)/firstOnbPage', '(tabs)/secondOnbPage', '(tabs)/thirdOnbPage', '(tabs)/fourthOnbPage', '(tabs)/fifthOnbPage'];

const AUTH_ONBOARDING_ROUTES = [
  'SignUp',
  'firstOnbPage',
  'secondOnbPage',
  'thirdOnbPage',
  'fourthOnbPage',
  'fifthOnbPage',
];

function isAuthOnboardingPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return AUTH_ONBOARDING_ROUTES.some((r) => pathname.includes(r));
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
<<<<<<< HEAD
 
=======
  const pathname = usePathname();
  const { session, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!session) {
      if (!isAuthOnboardingPath(pathname)) {
        router.replace('/SignUp');
      }
      return;
    }

    if (pathname.includes('SignUp') && !pathname.includes('OnbPage')) {
      router.replace('/');
    }
  }, [isLoading, session, pathname, router]);

  const showNav = !isLoading && Boolean(session) && !isAuthOnboardingPath(pathname);

>>>>>>> 9b8c7f1e84da425159ef2248069f713aa8930bd6
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        tabBarStyle: {
<<<<<<< HEAD
          display : 'flex'
=======
          display: showNav ? 'flex' : 'none',
>>>>>>> 9b8c7f1e84da425159ef2248069f713aa8930bd6
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