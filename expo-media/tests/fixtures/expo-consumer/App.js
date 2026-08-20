import { createMediaKit } from '@gj-kit/expo-media';
import { expoPicker } from '@gj-kit/expo-media/picker';
import { createExpoImageProcessor } from '@gj-kit/expo-media/image';
import { expoDeviceSave } from '@gj-kit/expo-media/save';
import { createExpoDocumentFileStore } from '@gj-kit/expo-media/storage';
import React from 'react';
import { View } from 'react-native';

// Every public native Expo entry used by real consumers is intentionally
// imported here. Metro therefore resolves the *packed* package's export map,
// not this repository's source tree, for web/iOS/Android release exports.
// Constructing adapters is side-effect-free: no permission, filesystem, or
// upload operation is started. Calling them prevents Metro from pruning the
// native export branches before this fixture can verify them.
const media = createMediaKit({
  api: {
    createUploadIntent: () => Promise.reject(new Error('release smoke never uploads')),
    completeUpload: () => Promise.reject(new Error('release smoke never uploads')),
  },
  limits: { image: { maxBytes: 1 }, video: { maxBytes: 1 } },
});
const picker = expoPicker();
const imageProcessor = createExpoImageProcessor();
const saver = expoDeviceSave();
const store = createExpoDocumentFileStore({ root: 'smoke' });

export default function App() {
  return React.createElement(View, {
    onTouchEnd() {
      // Keep every constructed adapter observable to Metro without running a
      // native operation during static export.
      void media;
      void picker;
      void imageProcessor.normalizeOrientation;
      void saver.saveToLibrary;
      void store;
    },
  });
}
