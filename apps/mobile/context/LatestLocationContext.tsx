import { type PropsWithChildren, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { refreshLatestLocation } from "@/lib/latestLocation";

type LatestLocationProviderProps = PropsWithChildren<{
  userId: string | null;
}>;

export function LatestLocationProvider({
  children,
  userId,
}: LatestLocationProviderProps) {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!userId) {
      return;
    }

    void refreshLatestLocation("app_open");
  }, [userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appState.current;
      appState.current = nextState;

      if (userId && nextState === "active" && previousState !== "active") {
        void refreshLatestLocation("app_foreground");
      }
    });

    return () => subscription.remove();
  }, [userId]);

  return children;
}
