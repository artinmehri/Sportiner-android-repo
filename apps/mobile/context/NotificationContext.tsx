import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { supabase } from '@/lib/supabase';
import {
  disablePushTokensForCurrentDevice as disableStoredPushToken,
  getNotificationPermissionState,
  registerPushNotifications as registerStoredPushToken,
  type NotificationPermissionState,
  type RegistrationResult,
} from '@/lib/pushNotifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type NotificationContextValue = {
  isRegistering: boolean;
  lastNotification: Notifications.Notification | null;
  permissionState: NotificationPermissionState;
  requestPermissionAndRegister: () => Promise<RegistrationResult>;
  syncPushRegistration: () => Promise<RegistrationResult>;
};

type NotificationProviderProps = PropsWithChildren<{
  navigationReady: boolean;
  userId: string | null;
}>;

type SupportedNotificationType =
  | 'new_message'
  | 'player_joined'
  | 'nearby_game';

const NotificationContext = createContext<NotificationContextValue | null>(null);

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function notificationType(value: unknown): SupportedNotificationType | null {
  if (
    value === 'new_message' ||
    value === 'player_joined' ||
    value === 'nearby_game'
  ) {
    return value;
  }

  return null;
}

async function openNotificationDestination(
  notification: Notifications.Notification,
): Promise<void> {
  const data = notification.request.content.data ?? {};
  const type = notificationType(data.type);
  const chatId = stringValue(data.chatId);
  const gameId = stringValue(data.gameId);
  const chatKind =
    stringValue(data.chatKind) ??
    stringValue(data.chatType);

  // Never trust server-supplied destination/path strings for navigation.
  if (type === 'new_message' || (!type && chatId)) {
    if (!chatId) {
      router.push('/(tabs)/inbox');
      return;
    }

    let resolvedChatKind = chatKind;
    if (resolvedChatKind !== 'private' && resolvedChatKind !== 'group') {
      const { data: chat, error } = await supabase
        .from('chat')
        .select('type')
        .eq('id', chatId)
        .maybeSingle();

      if (error) {
        console.warn('Unable to resolve notification chat destination', {
          chatId,
          code: error.code,
        });
      }

      resolvedChatKind = stringValue(chat?.type);
    }

    if (resolvedChatKind !== 'private' && resolvedChatKind !== 'group') {
      router.push('/(tabs)/inbox');
      return;
    }

    router.push({
      pathname:
        resolvedChatKind === 'private' ? '/(tabs)/chat' : '/(tabs)/groupchat',
      params: { id: chatId },
    });
    return;
  }

  if (
    type === 'player_joined' ||
    type === 'nearby_game' ||
    (!type && gameId)
  ) {
    if (!gameId) {
      router.push('/(tabs)/games');
      return;
    }

    router.push({
      pathname: '/(tabs)/EventDetails',
      params: { id: gameId },
    });
    return;
  }

  router.push('/(tabs)');
}

export function NotificationProvider({
  children,
  navigationReady,
  userId,
}: NotificationProviderProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [lastNotification, setLastNotification] =
    useState<Notifications.Notification | null>(null);
  const [permissionState, setPermissionState] =
    useState<NotificationPermissionState>('undetermined');
  const registrationInFlight = useRef<Promise<RegistrationResult> | null>(null);
  const lastHandledResponseId = useRef<string | null>(null);
  const pendingResponseRef =
    useRef<Notifications.NotificationResponse | null>(null);

  const runRegistration = useCallback(
    async (requestPermission: boolean): Promise<RegistrationResult> => {
      if (registrationInFlight.current) {
        const currentResult = await registrationInFlight.current;
        if (
          !requestPermission ||
          currentResult.success ||
          currentResult.reason === 'permission-denied'
        ) {
          return currentResult;
        }
      }

      const registration = registerStoredPushToken(supabase, {
        requestPermission,
      });
      registrationInFlight.current = registration;
      setIsRegistering(true);

      try {
        const result = await registration;
        try {
          setPermissionState(await getNotificationPermissionState());
        } catch (error) {
          console.warn('Unable to refresh notification permission state', error);
        }
        return result;
      } finally {
        if (registrationInFlight.current === registration) {
          registrationInFlight.current = null;
        }
        setIsRegistering(false);
      }
    },
    [],
  );

  const requestPermissionAndRegister = useCallback(
    () => runRegistration(true),
    [runRegistration],
  );

  const syncPushRegistration = useCallback(
    () => runRegistration(false),
    [runRegistration],
  );

  const handleNotificationResponse = useCallback(
    async (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
        return;
      }

      if (!userId || !navigationReady) {
        pendingResponseRef.current = response;
        return;
      }

      const responseId = response.notification.request.identifier;
      if (lastHandledResponseId.current === responseId) {
        return;
      }

      lastHandledResponseId.current = responseId;

      try {
        await openNotificationDestination(response.notification);
        Notifications.clearLastNotificationResponse();
        if (
          pendingResponseRef.current?.notification.request.identifier ===
          responseId
        ) {
          pendingResponseRef.current = null;
        }
      } catch (error) {
        lastHandledResponseId.current = null;
        console.warn('Unable to open notification destination', error);
      }
    },
    [navigationReady, userId],
  );

  useEffect(() => {
    void getNotificationPermissionState()
      .then(setPermissionState)
      .catch((error) => {
        console.warn('Unable to read notification permission state', error);
      });
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    void syncPushRegistration();
  }, [syncPushRegistration, userId]);

  useEffect(() => {
    if (!userId || !navigationReady || !pendingResponseRef.current) {
      return;
    }

    const pending = pendingResponseRef.current;
    void handleNotificationResponse(pending);
  }, [handleNotificationResponse, navigationReady, userId]);

  useEffect(() => {
    const receivedSubscription =
      Notifications.addNotificationReceivedListener(setLastNotification);
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        void handleNotificationResponse(response);
      });
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      if (userId) {
        void syncPushRegistration();
      }
    });

    const initialResponse = Notifications.getLastNotificationResponse();
    if (initialResponse) {
      void handleNotificationResponse(initialResponse);
    }

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
      tokenSubscription.remove();
    };
  }, [handleNotificationResponse, syncPushRegistration, userId]);

  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== 'active' || !userId) {
        return;
      }

      try {
        const currentPermissionState = await getNotificationPermissionState();
        setPermissionState(currentPermissionState);

        if (
          currentPermissionState === 'granted' ||
          currentPermissionState === 'provisional' ||
          currentPermissionState === 'ephemeral'
        ) {
          await syncPushRegistration();
          return;
        }

        if (currentPermissionState === 'denied') {
          await disableStoredPushToken(supabase, 'permission_revoked');
        }
      } catch (error) {
        console.warn('Unable to synchronize notification permission', error);
      }
    };

    const subscription = AppState.addEventListener('change', (nextState) => {
      void handleAppStateChange(nextState);
    });

    return () => subscription.remove();
  }, [syncPushRegistration, userId]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      isRegistering,
      lastNotification,
      permissionState,
      requestPermissionAndRegister,
      syncPushRegistration,
    }),
    [
      isRegistering,
      lastNotification,
      permissionState,
      requestPermissionAndRegister,
      syncPushRegistration,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error('useNotifications must be used inside NotificationProvider');
  }

  return context;
}

export async function registerPushNotifications(): Promise<RegistrationResult> {
  return registerStoredPushToken(supabase, { requestPermission: true });
}

export async function disablePushTokensForCurrentDevice(): Promise<void> {
  await disableStoredPushToken(supabase, 'logout');
}
