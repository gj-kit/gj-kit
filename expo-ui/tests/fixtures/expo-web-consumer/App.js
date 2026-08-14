import { Button, DataTable, Pagination, UiProvider } from '@gj-kit/expo-ui';
import React from 'react';
import { View } from 'react-native';

const rows = [{ id: 'release', label: 'Release smoke' }];
const columns = [
  {
    id: 'label',
    header: 'Name',
    getTextValue: (row) => row.label,
  },
];

// DataTable and Pagination force the web root build through a semantic web
// consumer while the accompanying Node checks exercise the same packed export
// without DOM globals.
export default function App() {
  return React.createElement(
    UiProvider,
    null,
    React.createElement(
      View,
      null,
      React.createElement(Button, { label: 'Release smoke', onPress: () => {} }),
      React.createElement(DataTable, {
        accessibilityLabel: 'Release smoke table',
        columns,
        state: { status: 'ready', rows },
        getRowKey: (row) => row.id,
        rowHeaderColumnId: 'label',
      }),
      React.createElement(Pagination, {
        accessibilityLabel: 'Release smoke pages',
        mode: 'numbered',
        countMode: 'pages',
        page: 1,
        pageCount: 1,
        onPageChange: () => {},
      }),
    ),
  );
}
