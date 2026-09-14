import { describe, expect, it } from 'vitest';
import { isMediaPlaceholder, messageMedia } from './message-media';

describe('messageMedia', () => {
  it('resolves synced image metadata', () => {
    expect(messageMedia('image', {
      attachment_url: 'https://cdn.example.com/full.jpg',
      preview_url: 'https://cdn.example.com/preview.jpg',
      file_name: 'photo.jpg',
      mime_type: 'image/jpeg',
    })).toEqual({
      kind: 'image',
      url: 'https://cdn.example.com/full.jpg',
      previewUrl: 'https://cdn.example.com/preview.jpg',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
    });
  });

  it('accepts authenticated same-origin conversation media urls', () => {
    expect(messageMedia('image', {
      attachment_url: '/api/conversations/abc/attachments?path=workspace%2Fabc%2Fphoto.jpg',
      file_name: 'photo.jpg',
      mime_type: 'image/jpeg',
    })).toMatchObject({
      kind: 'image',
      url: '/api/conversations/abc/attachments?path=workspace%2Fabc%2Fphoto.jpg',
      previewUrl: '/api/conversations/abc/attachments?path=workspace%2Fabc%2Fphoto.jpg',
    });
  });

  it('falls back to nested Meta attachment data', () => {
    expect(messageMedia('text', {
      attachments: {
        data: [{
          mime_type: 'image/png',
          image_data: { preview_url: 'https://cdn.example.com/nested-preview.png' },
        }],
      },
    })).toMatchObject({
      kind: 'image',
      previewUrl: 'https://cdn.example.com/nested-preview.png',
    });
  });

  it('rejects unsafe attachment urls', () => {
    expect(messageMedia('image', { attachment_url: 'javascript:alert(1)' })).toEqual({
      kind: 'image',
      url: null,
      previewUrl: null,
      fileName: null,
      mimeType: null,
    });
  });
});

describe('isMediaPlaceholder', () => {
  it('hides provider placeholders when real media is rendered', () => {
    expect(isMediaPlaceholder('[Photo]')).toBe(true);
    expect(isMediaPlaceholder('[Video]')).toBe(true);
    expect(isMediaPlaceholder('[File: passport.pdf]')).toBe(true);
    expect(isMediaPlaceholder('Please see this photo')).toBe(false);
  });
});
