// The self-verifying loop of design §9.5-1, as a button.
//
// save a 3 600-point route → listWorkouts finds it → syncWorkouts reports it as own → getRoute
// streams every point back within float precision → re-save at version 2 → sync reports REPLACED →
// delete → sync reports REMOVED.
//
// It is one flow rather than eight buttons because the interesting failures are all in the seams
// between the steps: a cursor taken at the wrong moment, a native id that changes on re-save, a
// route that silently loses its tail. Each step returns a line, and the caller prints the lines.
//
// ⚠ It writes to the user's real health store. Everything it writes carries the sync identifier
//   below and step 7 deletes it again; if the flow dies half way, press the button again — the
//   whole point of the design is that a re-run at the same version is idempotent.
//
// ⚠ NO HEALTH VALUE IS EVER PRINTED. The lines carry booleans, counts and error codes, which is the
//   same rule the rest of this harness follows: a screenshot of a smoke app must never become a
//   screenshot of somebody's health data.

import {
  collectRoute,
  deleteWorkout,
  getRoute,
  isWorkoutsError,
  listWorkouts,
  saveWorkout,
  syncWorkouts,
  type RoutePoint,
  type WorkoutsSyncCursor,
} from '@gj-kit/expo-workouts';

/** The sync identifier every artefact of this flow carries, so a half-finished run is recoverable. */
const CLIENT_ID = 'gjkit-selfcheck-1';
/**
 * A SECOND identifier, for the workout the Health.app gate looks at. The loop above deletes its own
 * artefact in step 7, which is exactly what makes it repeatable — and exactly why it cannot leave
 * anything on screen for design §9.5-1's "one workout in Health at each step" check. These two
 * functions do that half: write one 3 600-point route and leave it, then remove it again.
 */
const VISIBLE_CLIENT_ID = 'gjkit-visible-1';
/** Design §9.5-1 says 3 600 points. At one point a second that is exactly one hour of route. */
const POINTS = 3600;

export interface SelfCheckStep {
  readonly step: string;
  readonly ok: boolean;
  readonly detail: string;
}

function code(error: unknown): string {
  if (!isWorkoutsError(error)) return `non-WorkoutsError ${String(error)}`;
  // `nativeMessage` is the native layer's own bounded diagnostic — a class name, a platform code and
  // a template token, never a health value — and it is the difference between "notAuthorized" and
  // knowing WHICH call refused.
  return `code=${error.code} native=${error.nativeMessage ?? '-'}`;
}

function buildRoute(startMs: number): readonly RoutePoint[] {
  // A gentle spiral so consecutive points are never identical and the polyline is visible in
  // Health.app. Accuracy is stated (12 m) so the §8.2 hygiene pass keeps every point: anything
  // above 50 m would be dropped and the count assertion would then be measuring the hygiene rule
  // instead of the round trip.
  return Array.from({ length: POINTS }, (_, index) => ({
    t: startMs + index * 1000,
    lat: 37.5665 + index * 0.00002,
    lon: 126.978 + Math.sin(index / 120) * 0.0004,
    altM: 38 + (index % 60) * 0.1,
    hAccM: 12,
    vAccM: 6,
  }));
}

/** Same point within float precision — the loop's whole claim about `getRoute`. */
function samePoint(written: RoutePoint, read: RoutePoint): boolean {
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
  return near(written.lat, read.lat) && near(written.lon, read.lon) && written.t === read.t;
}

/** Writes one workout with a real 3 600-point route and LEAVES it, for the Health.app gate. */
export async function saveVisibleWorkout(): Promise<{ readonly nativeId: string; readonly points: number }> {
  const endMs = Date.now() - 60_000;
  const startMs = endMs - POINTS * 1000;
  const route = buildRoute(startMs);
  const saved = await saveWorkout({
    id: VISIBLE_CLIENT_ID,
    version: 1,
    kind: 'running',
    startMs,
    endMs,
    distanceM: 8000,
    activeEnergyKcal: 420,
    steps: 7200,
    elevationGainM: 30,
    route,
  });
  return {
    nativeId: saved.status === 'saved' ? saved.nativeId : '',
    points: saved.routePointsWritten,
  };
}

/** Removes it again, so the Health.app gate can check the empty state too. */
export async function deleteVisibleWorkout(): Promise<boolean> {
  const result = await deleteWorkout({ clientId: VISIBLE_CLIENT_ID });
  return result.deleted;
}

export async function runSelfCheck(): Promise<readonly SelfCheckStep[]> {
  const out: SelfCheckStep[] = [];
  const push = (step: string, ok: boolean, detail: string): void => {
    out.push({ step, ok, detail });
  };

  const endMs = Date.now() - 60_000;
  const startMs = endMs - POINTS * 1000;
  const route = buildRoute(startMs);

  // A previous run that died half way leaves a workout under the same sync identifier, and the
  // resume rule then takes over: re-saving at an EQUAL version does not rewrite the workout (idx
  // f26), so step 1 would "succeed" while pointing at the PREVIOUS run's window and every later step
  // would measure the wrong record. Clearing first is what makes the loop repeatable.
  try {
    const cleared = await deleteWorkout({ clientId: CLIENT_ID });
    push('-1 clean slate', true, `hadLeftover=${String(cleared.deleted)}`);
  } catch (error) {
    push('-1 clean slate', false, code(error));
  }

  // The cursor has to be taken BEFORE the write, or the checkpoint already includes it and the
  // drain has nothing to report. That is design §4.4's gap-freedom argument, exercised.
  let cursor: WorkoutsSyncCursor | null = null;
  try {
    const initial = await syncWorkouts(null);
    cursor = initial.cursor;
    // `resetReason` only exists on the `reset: true` arm — the union is discriminated on purpose so
    // a caller cannot read a reason that is not there.
    push(
      '0 checkpoint',
      initial.reset,
      `reset=${String(initial.reset)} reason=${initial.reset ? initial.resetReason : '-'}`,
    );
  } catch (error) {
    push('0 checkpoint', false, code(error));
    return out;
  }

  let nativeId = '';
  try {
    const saved = await saveWorkout({
      id: CLIENT_ID,
      version: 1,
      kind: 'running',
      startMs,
      endMs,
      distanceM: 8000,
      activeEnergyKcal: 420,
      steps: 7200,
      elevationGainM: 30,
      route,
    });
    nativeId = saved.status === 'saved' ? saved.nativeId : '';
    push(
      '1 save v1',
      saved.status === 'saved' && saved.route === 'stored' && saved.routePointsWritten === POINTS,
      `status=${saved.status} route=${saved.route} points=${String(saved.routePointsWritten)}`,
    );
  } catch (error) {
    push('1 save v1', false, code(error));
    return out;
  }

  try {
    const page = await listWorkouts({ fromMs: startMs - 1000, toMs: Date.now() });
    const mine = page.items.filter((workout) => workout.clientId === CLIENT_ID);
    const one = mine[0];
    push(
      '2 listWorkouts',
      mine.length === 1 && one !== undefined && one.isOwn && one.id === nativeId,
      `matches=${String(mine.length)} isOwn=${String(one?.isOwn)} idMatchesSave=${String(one?.id === nativeId)} routeState=${String(one?.routeState)} kind=${String(one?.kind)}`,
    );
    if (one !== undefined) {
      push(
        '2b totals',
        one.distanceM !== undefined && one.activeEnergyKcal !== undefined,
        `distance=${one.distanceProvenance ?? 'absent'} energy=${one.activeEnergyProvenance ?? 'absent'} indoor=${String(one.indoor)} steps=${one.steps === undefined ? 'absent' : 'present'}`,
      );
    }
  } catch (error) {
    push('2 listWorkouts', false, code(error));
  }

  try {
    const page = await syncWorkouts(cursor);
    cursor = page.cursor;
    const mine = page.added.filter((workout) => workout.clientId === CLIENT_ID);
    push(
      '3 sync sees it as own',
      mine.length === 1 && mine[0]?.isOwn === true && page.removed.length === 0,
      `added=${String(page.added.length)} mine=${String(mine.length)} removed=${String(page.removed.length)} reset=${String(page.reset)}`,
    );
  } catch (error) {
    push('3 sync sees it as own', false, code(error));
  }

  try {
    const read = await collectRoute(getRoute(nativeId));
    const sameCount = read.length === route.length;
    let mismatches = 0;
    for (let index = 0; index < Math.min(read.length, route.length); index += 1) {
      const written = route[index];
      const back = read[index];
      if (written === undefined || back === undefined || !samePoint(written, back)) mismatches += 1;
    }
    push(
      '4 getRoute round trip',
      sameCount && mismatches === 0,
      `wrote=${String(route.length)} read=${String(read.length)} mismatches=${String(mismatches)}`,
    );
  } catch (error) {
    push('4 getRoute round trip', false, code(error));
  }

  let replacedId = '';
  try {
    const saved = await saveWorkout({
      id: CLIENT_ID,
      version: 2,
      kind: 'running',
      startMs,
      endMs,
      distanceM: 8100,
      activeEnergyKcal: 430,
      steps: 7300,
      elevationGainM: 31,
      route,
    });
    replacedId = saved.status === 'saved' ? saved.nativeId : '';
    push(
      '5 save v2',
      saved.status === 'saved' && saved.route === 'stored',
      `status=${saved.status} route=${saved.route} newNativeId=${String(replacedId !== nativeId)}`,
    );
  } catch (error) {
    push('5 save v2', false, code(error));
  }

  try {
    const page = await syncWorkouts(cursor);
    cursor = page.cursor;
    const replaced = page.removed.filter((entry) => entry.replaced);
    const added = page.added.filter((workout) => workout.clientId === CLIENT_ID);
    // iOS mints a new uuid for a replacement, so the batch is one removal (replaced) plus one
    // addition. Android reuses the uuid and emits no removal at all — both are correct, and this
    // line prints which one happened rather than asserting one of them.
    push(
      '6 sync reports replaced',
      added.length === 1 && (replaced.length === 1 || page.removed.length === 0),
      `added=${String(added.length)} removed=${String(page.removed.length)} replaced=${String(replaced.length)}`,
    );
  } catch (error) {
    push('6 sync reports replaced', false, code(error));
  }

  try {
    const result = await deleteWorkout({ clientId: CLIENT_ID });
    push('7 delete', result.deleted, `deleted=${String(result.deleted)}`);
  } catch (error) {
    push('7 delete', false, code(error));
  }

  try {
    const page = await syncWorkouts(cursor);
    cursor = page.cursor;
    const gone = page.removed.filter((entry) => !entry.replaced);
    push(
      '8 sync reports removed',
      gone.length >= 1 && page.added.length === 0,
      `removed=${String(page.removed.length)} genuinelyGone=${String(gone.length)} added=${String(page.added.length)}`,
    );
  } catch (error) {
    push('8 sync reports removed', false, code(error));
  }

  try {
    const page = await listWorkouts({ fromMs: startMs - 1000, toMs: Date.now() });
    const left = page.items.filter((workout) => workout.clientId === CLIENT_ID);
    push('9 nothing left behind', left.length === 0, `remaining=${String(left.length)}`);
  } catch (error) {
    push('9 nothing left behind', false, code(error));
  }

  return out;
}
