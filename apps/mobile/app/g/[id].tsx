import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

export default function GameDeepLink() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  useEffect(() => {
    if (id) {
      // Redirect to the EventDetails screen with the game ID
      router.replace(`/EventDetails?id=${id}`);
    } else {
      // If no ID provided, go to home
      router.replace('/');
    }
  }, [id, router]);

  return null;
}
