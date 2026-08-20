---
'@gj-kit/toss-payments': minor
---

Fetch/Node 웹훅 어댑터에 `maxBodyBytes`와 기본 256 KiB 수신 상한을 추가했습니다.
선언된 Content-Length가 상한을 넘거나 실제 stream/body가 상한을 넘으면 검증·dedupe·핸들러
실행 전에 413을 반환합니다. Express 사용자는 `express.raw({ limit })`를 같은 값으로 맞춰
라이브러리 진입 전 Buffer 할당도 제한하세요.
