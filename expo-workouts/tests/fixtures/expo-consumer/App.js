import { getAvailability, workouts } from '@gj-kit/expo-workouts';
import { WORKOUT_TOTALS_SCOPES, WORKOUTS_ERROR_CODES } from '@gj-kit/expo-workouts/core';
import { createFakeWorkouts } from '@gj-kit/expo-workouts/testing';
import React from 'react';
import { View } from 'react-native';

// Every public subpath a real consumer touches is imported here, so Metro
// resolves the *packed* export map — including the `browser` fork that must
// keep the native branch out of a web bundle — rather than this repository's
// source tree. Nothing here starts a health-store operation: constructing the
// fake and reading the two constants is side-effect-free.
const fake = createFakeWorkouts();
const scopes = [...WORKOUT_TOTALS_SCOPES, 'routes'];

export default function App() {
  return React.createElement(View, {
    onTouchEnd() {
      // Keep each import observable to Metro without invoking a native call
      // during static export.
      void getAvailability;
      void workouts.listWorkouts;
      void fake.api;
      void scopes;
      void WORKOUTS_ERROR_CODES;
    },
  });
}
