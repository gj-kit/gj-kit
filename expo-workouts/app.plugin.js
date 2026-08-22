// 순수 CJS. 루트 package.json에 `"type": "module"`이 **없다**는 것이 이 파일의 전제다
// (설계 §2.4-A — T9가 Phase 0에서 실행되지 않았으므로 미측정 위험을 안고 가지 않는다).
// `t9-plugin-loader` 가드가 이 파일을 실제로 require해서 함수가 나오는지 단언한다.
module.exports = require('./plugin/build');
