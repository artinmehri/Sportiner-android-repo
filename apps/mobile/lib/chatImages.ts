import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { decode } from 'base64-arraybuffer';

import { getCurrentUserId, supabase } from '@/context/AuthContext';
import {
  PhotoAssetError,
  preparePickedPhoto,
  type UploadablePhoto,
} from '@/lib/photoAsset';

export const CHAT_IMAGE_BUCKET = 'chat-images';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
export type ChatImageAsset = UploadablePhoto;

export class ChatImageError extends Error {
  constructor(
    public readonly code:
      | 'permission'
      | 'invalid'
      | 'processing'
      | 'too-large'
      | 'upload'
      | 'not-authenticated',
  ) {
    super(code);
    this.name = 'ChatImageError';
  }
}

export async function pickChatImage(): Promise<ChatImageAsset | null> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      selectionLimit: 1,
      quality: 0.8,
      base64: true,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });

    if (result.canceled) return null;
    return preparePickedPhoto(result.assets[0]);
  } catch (error) {
    if (error instanceof ChatImageError) throw error;
    if (error instanceof PhotoAssetError) throw new ChatImageError(error.code);
    throw new ChatImageError('processing');
  }
}

export async function uploadChatImage(chatId: string, messageId: string, asset: ChatImageAsset) {
  const user = await getCurrentUserId();
  if (!user?.id) throw new ChatImageError('not-authenticated');

  const path = `${user.id}/chat/${chatId}/${messageId}.${asset.extension}`;
  const { data, error } = await supabase.storage
    .from(CHAT_IMAGE_BUCKET)
    .upload(path, decode(asset.base64), {
      contentType: asset.contentType,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    // A timed-out upload can finish server-side before the client retries.
    // The deterministic path makes that retry safe for this message.
    if (/already exists/i.test(error.message)) return { path };
    throw new ChatImageError('upload');
  }

  if (!data?.path) throw new ChatImageError('upload');

  return { path: data.path };
}

export async function removeChatImage(path: string) {
  if (!path) return;
  const { error } = await supabase.storage.from(CHAT_IMAGE_BUCKET).remove([path]);
  if (error && !/not found/i.test(error.message)) throw error;
}

export async function getChatImageUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  const { data, error } = await supabase.storage
    .from(CHAT_IMAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  return error ? null : data.signedUrl;
}

export async function hydrateChatImage<T extends { image?: string | null }>(message: T) {
  if (!message.image) return message;
  return { ...message, imageUrl: await getChatImageUrl(message.image) };
}

export function newChatMessageId() {
  return Crypto.randomUUID();
}
