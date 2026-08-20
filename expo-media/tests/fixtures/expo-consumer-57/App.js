import { createMediaKit } from '@gj-kit/expo-media';
import { expoPicker } from '@gj-kit/expo-media/picker';
import { expoDeviceSave } from '@gj-kit/expo-media/save';
import { createExpoDocumentFileStore } from '@gj-kit/expo-media/storage';
import React from 'react';
import { View } from 'react-native';

// Exercise every public native Expo entry through the packed artifact so SDK
// 57 Metro resolves the same export graph that a consuming app will load.
const media = createMediaKit({
  api: {
    createUploadIntent: () => Promise.reject(new Error('release smoke never uploads')),
    completeUpload: () => Promise.reject(new Error('release smoke never uploads')),
  },
  limits: { image: { maxBytes: 1 }, video: { maxBytes: 1 } },
});
const picker = expoPicker();
const saver = expoDeviceSave();
const store = createExpoDocumentFileStore({ root: 'smoke' });

export default function App() {
  return React.createElement(View, {
    onTouchEnd() {
      void media;
      void picker;
      void saver.saveToLibrary;
      void store;
    },
  });
}
