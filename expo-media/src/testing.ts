// ═══════════════════════════════════════════════════════════════════════════
// `"./testing"` 엔트리 — 설계 문서 §2.2 · §5.6 · §10.1.
//
// **peer 0 · DOM 0.** 이 엔트리의 존재 이유가 그것이다 — `pnpm test`가 네이티브 peer를
// 한 줄도 모킹하지 않고(§10.3 `test-purity-guard`가 강제한다) 전 파이프라인
// (pick → stat → hash → intent → PUT → complete → cleanup)을 돈다.
//
// 전신에서 이 자리에 있던 것은 `jest.mock("…/packages/photo-kit/src/hashFile")` 같은
// **딥 경로 모듈 모킹 4중첩**이었다(§11.4 `uploadPhoto.test.ts`). 그런 테스트는 구현을 조금만
// 옮겨도 통째로 무너지고, 무너진 자리에서 무엇이 검증되고 있었는지도 알 수 없다.
// 인메모리 어댑터는 **계약**에 붙으므로 구현이 움직여도 살아남는다.
//
// ⚠ 여기 있는 것들은 **실제로 동작하는 페이크**다. throw 스텁이 아니다 —
//   페이크의 충실도가 곧 테스트의 강도이고, 부실한 페이크는 통과하는 테스트를 만들 뿐이다.
//   각 모듈 머리말에 "이 페이크가 어떤 하드닝의 직접 증거를 만드는가"를 적어 두었다.
// ═══════════════════════════════════════════════════════════════════════════

// ─── 바이트 유틸 — DOM Blob 없이 웹 경로를 태우는 수단 ──────────────────────
export { bytesToBase64, toArrayBuffer, fakeBytes, createBinarySource } from './testing/bytes';

// ─── 인메모리 파일시스템 (FileSystemAdapter + FileDownloadAdapter) ──────────
export type { FakeCallLog, MemoryFileSystem, MemoryFileSystemOptions } from './testing/memoryFileSystem';
export { createMemoryFileSystem } from './testing/memoryFileSystem';

// ─── 전송 기록부 (LocalFileTransport + BinaryTransport) ─────────────────────
export type { RecordedPut, RecordingTransport, RecordingTransportOptions } from './testing/transport';
export { createRecordingTransport } from './testing/transport';

// ─── 피커 ───────────────────────────────────────────────────────────────────
export type { FakePicker, FakePickerOptions } from './testing/picker';
export { createFakePicker } from './testing/picker';

// ─── 기기 라이브러리 ────────────────────────────────────────────────────────
export type { FakeDeviceLibrary, FakeDeviceLibraryOptions } from './testing/deviceLibrary';
export { createFakeDeviceLibrary } from './testing/deviceLibrary';

// ─── 백엔드 계약 ────────────────────────────────────────────────────────────
export type { FakeUploadApi, FakeUploadApiOptions } from './testing/uploadApi';
export { createFakeUploadApi } from './testing/uploadApi';

// ─── 플랫폼 ─────────────────────────────────────────────────────────────────
export { fakePlatform, createFakePlatform } from './testing/platform';

// ─── 텔레메트리 기록부 (§7.2 unit 2·3) ──────────────────────────────────────
export type { RecordedSpan, RecordingTelemetry } from './testing/telemetry';
export { createRecordingTelemetry } from './testing/telemetry';

// ─── 픽스처 — EXIF · 서명 URL ───────────────────────────────────────────────
export {
  SIGNED_UPLOAD_URL,
  signedUploadUrl,
  signedUrlErrorMessage,
  EXIF_CAPTURED_AT,
  EXIF_GEO_POINT,
  EXIF_FIXTURE,
  exifCapturedAtIso,
  jpegWithExif,
  jpegWithoutExif,
  truncatedJpegWithExif,
} from './testing/fixtures';
