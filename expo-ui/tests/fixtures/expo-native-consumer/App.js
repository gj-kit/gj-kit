import { Button, UiProvider } from '@gj-kit/expo-ui';
import { nativeBottomPadding } from '@gj-kit/expo-ui/insets';
import React from 'react';
import { View } from 'react-native';

// This fixture intentionally omits react-native-web. Importing both the root
// and the optional safe-area entry makes Metro resolve the packed native
// artifact and its peer boundary for iOS and Android.
const bottomPadding = nativeBottomPadding(12, 4);

export default function App() {
  return React.createElement(
    UiProvider,
    null,
    React.createElement(
      View,
      { style: { paddingBottom: bottomPadding } },
      React.createElement(Button, { label: 'Release smoke', onPress: () => {} }),
    ),
  );
}
