import { decode } from 'base64-arraybuffer';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export type UploadablePhoto = {
  uri: string;
  base64: string;
  contentType: 'image/jpeg' | 'image/png';
  extension: 'jpg' | 'png';
  byteLength: number;
};

type PickedPhotoAsset = {
  uri?: string | null;
  base64?: string | null;
  type?: string | null;
};

export class PhotoAssetError extends Error {
  constructor(public readonly code: 'invalid' | 'processing' | 'too-large') {
    super(code);
    this.name = 'PhotoAssetError';
  }
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function preparePickedPhoto(
  asset: PickedPhotoAsset | undefined,
  maxBytes = MAX_PHOTO_BYTES,
): UploadablePhoto {
  if (!asset?.uri || !asset.base64) throw new PhotoAssetError('processing');
  if (asset.type && asset.type !== 'image') throw new PhotoAssetError('invalid');

  const base64 = asset.base64;
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new PhotoAssetError('processing');
  }

  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const byteLength = (base64.length / 4) * 3 - padding;
  if (byteLength > maxBytes) throw new PhotoAssetError('too-large');

  const bytes = new Uint8Array(decode(base64));
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { uri: asset.uri, base64, contentType: 'image/jpeg', extension: 'jpg', byteLength };
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { uri: asset.uri, base64, contentType: 'image/png', extension: 'png', byteLength };
  }

  throw new PhotoAssetError('invalid');
}
