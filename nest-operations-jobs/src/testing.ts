/**
 * `@gj-kit/nest-operations-jobs/testing` — 인메모리 저장소·가짜 시계·적합성 케이스.
 * 프로덕션 번들에 들어가면 안 되는 표면이라 서브패스로 분리한다(형제 관행).
 */
export { memoryJobRunStore } from './testing/memory-store';
export type {
  MemoryJobRunStore,
  MemoryJobRunStoreOptions,
  StoredJobRun,
} from './testing/memory-store';

export { fakeJobClock } from './testing/fake-clock';
export type { FakeJobClock } from './testing/fake-clock';

export { recordingJobLogger } from './testing/recording-logger';
export type { RecordedLogEntry, RecordingJobLogger } from './testing/recording-logger';

export { jobRunStoreContractCases } from './testing/store-contract';
export type {
  JobRunStoreContractCase,
  JobRunStoreContractOptions,
  JobRunStoreObligation,
} from './testing/store-contract';
