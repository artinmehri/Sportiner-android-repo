import { describe, expect, it } from 'vitest';

import { PhotoAssetError, preparePickedPhoto } from './photoAsset';

describe('preparePickedPhoto', () => {
  it('uses the encoded bytes for JPEG and PNG metadata', () => {
    expect(
      preparePickedPhoto({ uri: 'file:///photo.heic', base64: '/9j/4A==', type: 'image' }),
    ).toMatchObject({ contentType: 'image/jpeg', extension: 'jpg', byteLength: 4 });
    expect(
      preparePickedPhoto({ uri: 'file:///screenshot.jpg', base64: 'iVBORw0KGgo=', type: 'image' }),
    ).toMatchObject({ contentType: 'image/png', extension: 'png', byteLength: 8 });
  });

  it('rejects HEIC bytes that were not converted by the picker', () => {
    expect(() =>
      preparePickedPhoto({ uri: 'file:///photo.heic', base64: 'AAAAGGZ0eXBoZWlj', type: 'image' }),
    ).toThrowError(expect.objectContaining<Partial<PhotoAssetError>>({ code: 'invalid' }));
  });

  it('separates invalid picker data from an oversized processed photo', () => {
    expect(() => preparePickedPhoto({ uri: 'file:///photo.jpg', base64: '%%%' })).toThrowError(
      expect.objectContaining<Partial<PhotoAssetError>>({ code: 'processing' }),
    );
    expect(() =>
      preparePickedPhoto({ uri: 'file:///photo.jpg', base64: '/9j/4A==', type: 'image' }, 3),
    ).toThrowError(expect.objectContaining<Partial<PhotoAssetError>>({ code: 'too-large' }));
  });
});
