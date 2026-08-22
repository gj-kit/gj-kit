// Smoke harness for @gj-kit/expo-workouts — deliberately plain.
//
// Phase 2 expectation: every button below RESOLVES or REJECTS, and nothing throws at import time.
// The twelve functions are honest stubs at this stage, so the interesting output is the
// `WorkoutsError` `code` each one reports. The screen prints the CODE rather than the message on
// purpose: codes are the contract, messages are not.
//
// That makes the harness a contract check as well as a boot check. A line that reads
// `rejected non-WorkoutsError` means a native exception escaped without a `Workouts*Exception`
// class name, so `mapNativeError` could not turn it into a public `code` — which is a real defect
// in the native layer, not a cosmetic one, and this screen is where it shows up first.
import {
  getAuthorizationState,
  getAvailability,
  getRoute,
  isWorkoutsError,
  listWorkouts,
  openSettings,
  readHeartRate,
  readSteps,
  requestAuthorization,
  saveWorkout,
  syncWorkouts,
  WORKOUT_TOTALS_SCOPES,
  type Availability,
  type AuthorizationState,
} from '@gj-kit/expo-workouts';
import { useCallback, useEffect, useState } from 'react';

import { deleteVisibleWorkout, runSelfCheck, saveVisibleWorkout } from './SelfCheck';
// `SafeAreaView` from `react-native` is deprecated in 0.86 and warns on every render; the harness
// pads by hand instead of taking a dependency on `react-native-safe-area-context` for one inset.
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Never render a health value — only shapes and error codes (design §9.2 privacy rule). */
function describe(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().join(',')}}`;
  }
  return String(value);
}

function outcome(error: unknown): string {
  const code = isWorkoutsError(error) ? error.code : null;
  if (code !== null) return `rejected code=${code}`;
  return `rejected non-WorkoutsError ${String(error)}`;
}

export default function App() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [authState, setAuthState] = useState<AuthorizationState | null>(null);
  const [lines, setLines] = useState<readonly string[]>([]);

  const log = useCallback((line: string) => {
    setLines((previous) => [...previous, line].slice(-40));
  }, []);

  const run = useCallback(
    (label: string, action: () => Promise<unknown>) => async () => {
      try {
        const value = await action();
        log(`${label}: resolved ${describe(value)}`);
      } catch (error) {
        log(`${label}: ${outcome(error)}`);
      }
    },
    [log],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const value = await getAvailability();
        if (!cancelled) setAvailability(value);
      } catch (error) {
        if (!cancelled) log(`getAvailability: ${outcome(error)}`);
      }
      try {
        const value = await getAuthorizationState();
        if (!cancelled) setAuthState(value);
      } catch (error) {
        if (!cancelled) log(`getAuthorizationState: ${outcome(error)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [log]);

  const availabilityText =
    availability === null
      ? 'pending'
      : availability.status === 'unavailable'
        ? `unavailable/${availability.reason}`
        : availability.status;

  const authText =
    authState === null
      ? 'pending'
      : authState.availability === 'available'
        ? `available read.workouts=${authState.read.workouts} routeAccess=${authState.routeAccess}`
        : authState.availability === 'unavailable'
          ? `unavailable/${authState.reason}`
          : authState.availability;

  const onRequestAuthorization = run('requestAuthorization', async () => {
    const result = await requestAuthorization({
      read: [...WORKOUT_TOTALS_SCOPES, 'routes', 'heartRate', 'steps'],
      // The write list matches what the harness can actually WRITE, including the self-verifying
      // loop's step samples. A narrower request is not a smaller ask — it is a `notAuthorized` at
      // `saveWorkout`, because the §8.5-0 pre-flight refuses a payload whose scopes were never
      // granted. Measured here: a loop that wrote `steps` while the request omitted `'steps'`
      // failed with exactly that code, which is the pre-flight doing its job.
      write: [...WORKOUT_TOTALS_SCOPES, 'routes', 'heartRate', 'steps'],
    });
    setAuthState(result);
    return result;
  });

  const now = Date.now();

  const actions: readonly { readonly id: string; readonly label: string; readonly onPress: () => Promise<void> }[] = [
    { id: 'request-authorization', label: 'Request authorization', onPress: onRequestAuthorization },
    {
      id: 'refresh-state',
      label: 'Refresh authorization state',
      onPress: run('getAuthorizationState', async () => {
        const value = await getAuthorizationState();
        setAuthState(value);
        return value;
      }),
    },
    {
      id: 'list-workouts',
      label: 'List workouts (30d)',
      onPress: run('listWorkouts', () =>
        listWorkouts({ fromMs: now - 30 * DAY_MS, toMs: now }),
      ),
    },
    {
      id: 'sync-workouts',
      label: 'Sync workouts (initial)',
      onPress: run('syncWorkouts', () => syncWorkouts(null)),
    },
    {
      id: 'get-route',
      label: 'Get route (fake id)',
      onPress: run('getRoute', async () => {
        // `getRoute` is lazy: the rejection lands on the FIRST iteration, not on the call.
        let chunks = 0;
        for await (const chunk of getRoute('00000000-0000-4000-8000-000000000000')) {
          chunks += chunk.length > 0 ? 1 : 0;
        }
        return { chunks };
      }),
    },
    {
      id: 'read-heart-rate',
      label: 'Read heart rate (1h)',
      onPress: run('readHeartRate', () =>
        readHeartRate({ fromMs: now - 60 * 60 * 1000, toMs: now }),
      ),
    },
    {
      id: 'read-steps',
      label: 'Read steps (1d)',
      onPress: run('readSteps', () => readSteps({ fromMs: now - DAY_MS, toMs: now })),
    },
    {
      id: 'save-workout',
      label: 'Save workout (demo)',
      onPress: run('saveWorkout', () =>
        saveWorkout({
          id: 'example-smoke-1',
          version: 1,
          kind: 'running',
          startMs: now - 30 * 60 * 1000,
          endMs: now - 20 * 60 * 1000,
          distanceM: 1500,
          activeEnergyKcal: 90,
          route: [
            { t: now - 30 * 60 * 1000, lat: 37.5665, lon: 126.978, altM: 38 },
            { t: now - 29 * 60 * 1000, lat: 37.5666, lon: 126.9781, altM: 39 },
          ],
        }),
      ),
    },
    {
      id: 'open-settings',
      label: 'Open health settings',
      onPress: run('openSettings', () => openSettings()),
    },
    // The Health.app half of design §9.5-1: the loop below deletes its own artefact, so these two
    // are what put one workout on screen in Health and then take it away again.
    //
    // iOS ONLY, deliberately: they exist for the Health.app screenshots, and adding two rows on
    // Android would push the log below the fold and break `12-android-self-verify.yaml`'s
    // `assertVisible` on the log text — a Maestro assertion needs the element ON SCREEN.
    ...(Platform.OS === 'ios'
      ? ([
          {
            id: 'save-visible',
            label: 'Save 3600-point workout (keep it)',
            onPress: run('saveVisibleWorkout', () => saveVisibleWorkout()),
          },
          {
            id: 'delete-visible',
            label: 'Delete that workout',
            onPress: run('deleteVisibleWorkout', () => deleteVisibleWorkout()),
          },
        ] as const)
      : []),
    {
      // Design §9.5-1, end to end: save a 3 600-point route -> list -> sync own -> getRoute round
      // trip -> re-save v2 -> sync replaced -> delete -> sync removed. It writes to the real health
      // store and cleans up after itself; every line it prints is a boolean, a count or an error
      // code, never a health value.
      id: 'self-check',
      label: 'Self-verifying loop (3600-point route)',
      onPress: async () => {
        log('selfCheck: started');
        try {
          for (const step of await runSelfCheck()) {
            const line = `selfCheck ${step.ok ? 'PASS' : 'FAIL'} ${step.step}: ${step.detail}`;
            log(line);
            // Also to the Metro console: the on-screen log holds 40 short lines in a 12 pt font,
            // which is fine for a smoke check and useless for reading nine step results off a
            // screenshot. Every line is booleans, counts and codes — never a health value.
            console.log(line);
          }
        } catch (error) {
          log(`selfCheck: ${outcome(error)}`);
        }
      },
    },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} testID="title" accessibilityLabel="gj-kit workouts example">
          gj-kit workouts example
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Availability</Text>
          <Text style={styles.value} testID="availability" accessibilityLabel={`availability ${availabilityText}`}>
            {availabilityText}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Authorization</Text>
          <Text style={styles.value} testID="authorization" accessibilityLabel={`authorization ${authText}`}>
            {authText}
          </Text>
        </View>

        {actions.map((action) => (
          <Pressable
            key={action.id}
            testID={action.id}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => {
              void action.onPress();
            }}>
            <Text style={styles.buttonLabel}>{action.label}</Text>
          </Pressable>
        ))}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Log</Text>
          <Text style={styles.log} testID="log">
            {lines.length === 0 ? '(empty)' : lines.join('\n')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f2f5' },
  content: { padding: 16, paddingTop: Platform.OS === 'ios' ? 64 : 40, paddingBottom: 48, gap: 10 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, gap: 4 },
  cardTitle: { fontSize: 12, textTransform: 'uppercase', color: '#666', letterSpacing: 1 },
  value: { fontSize: 15, fontVariant: ['tabular-nums'] },
  button: { backgroundColor: '#1d4ed8', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14 },
  buttonPressed: { opacity: 0.7 },
  buttonLabel: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  log: { fontSize: 12, fontFamily: 'Courier', color: '#222' },
});
