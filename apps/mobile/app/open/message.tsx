import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { supabase } from '@/lib/supabase';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function OpenMessage() {
  const params = useLocalSearchParams<{
    chatId?: string | string[];
    messageId?: string | string[];
  }>();
  const chatId = firstParam(params.chatId);
  const messageId = firstParam(params.messageId);

  useEffect(() => {
    async function openMessage() {
      if (!chatId || !messageId) {
        router.replace('/(tabs)/inbox');
        return;
      }

      const { data: chat, error } = await supabase
        .from('chat')
        .select('type')
        .eq('id', chatId)
        .single();

      if (error || !chat) {
        router.replace('/(tabs)/inbox');
        return;
      }

      if (chat.type === 'private') {
        router.replace({
          pathname: '/chat/[id]',
          params: {
            id: chatId,
            messageId,
          },
        });
        return;
      }

      if (chat.type === 'group') {
        router.replace({
          pathname: '/groupchat/[id]',
          params: {
            id: chatId,
            messageId,
          },
        });
        return;
      }

      router.replace('/(tabs)/inbox');
    }

    void openMessage();
  }, [chatId, messageId]);

  return null;
}
