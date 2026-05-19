import { router } from 'expo-router';

export type GameChatParams = {
  gameId?: string;
  gameTitle?: string;
  peerName?: string;
  peerUserId?: string;
};

export function openGameChat(params: GameChatParams = {}) {
  router.push({
    pathname: '/(tabs)/chat',
    params: {
      gameId: params.gameId ?? '',
      gameTitle: params.gameTitle ?? '',
      peerName: params.peerName ?? '',
      peerUserId: params.peerUserId ?? '',
    },
  });
}
