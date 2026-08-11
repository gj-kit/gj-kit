const configExamples = {
  root: {
    label: 'SYNCHRONOUS COMPOSITION',
    file: 'app.module.ts',
    title: 'config가 이미 있다면\n한 번에 조립합니다.',
    description: '앱 부팅 시 config를 고정하고, 기본 전역 모듈로 어느 서비스에서나 필요한 kit을 받습니다.',
    points: ['글로벌 기본값', '조건부 kit 타입 보존', '가장 짧은 시작점'],
    code: `@Module({\n  imports: [\n    TossPaymentsModule.forRoot(tossConfig),\n  ],\n})\nexport class AppModule {}`,
  },
  async: {
    label: 'DEPENDENCY-INJECTED COMPOSITION',
    file: 'app.module.ts',
    title: '저장소도 Nest provider라면\n자연스럽게 주입합니다.',
    description: 'Prisma 같은 앱 의존성을 store 구현으로 주입해, 모든 조립 책임을 모듈 선언에 모읍니다.',
    points: ['기존 DB provider 재사용', 'imports · inject 지원', 'const 추론 보존'],
    code: `TossPaymentsModule.forRootAsync({\n  imports: [TossStoresModule],\n  inject: [TossOrderStore],\n  useFactory: (orders) =>\n    defineTossPaymentsConfig({ secretKey, orders }),\n})`,
  },
};

const escapeHtml = (value) => value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
const toast = document.querySelector('.toast');
let toastTimer;
function showToast(message = '클립보드에 복사했어요.') { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 1800); }
async function copy(text) { try { await navigator.clipboard.writeText(text); showToast(); } catch { showToast('복사할 수 없어요. 직접 선택해 복사해 주세요.'); } }
function syntax(code) {
  return escapeHtml(code)
    .replace(/\b(export|class|const)\b/g, '<span class="c-key">$1</span>')
    .replace(/\b(Module)\b/g, '<span class="c-decorator">$1</span>')
    .replace(/\b(TossPaymentsModule|TossStoresModule|TossOrderStore|AppModule)\b/g, '<span class="c-type">$1</span>')
    .replace(/\b(forRootAsync|forRoot|defineTossPaymentsConfig)\b/g, '<span class="c-fn">$1</span>');
}
function renderConfig(name) {
  const item = configExamples[name];
  document.querySelector('[data-config-label]').textContent = item.label;
  document.querySelector('[data-config-file]').textContent = item.file;
  document.querySelector('[data-config-title]').innerHTML = item.title.replace('\n', '<br />');
  document.querySelector('[data-config-description]').textContent = item.description;
  document.querySelector('[data-config-points]').innerHTML = item.points.map((point) => `<span>${point}</span>`).join('');
  document.querySelector('[data-config-code]').innerHTML = syntax(item.code);
}
document.querySelectorAll('.config-tab').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.config-tab').forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active)); });
  renderConfig(button.dataset.config);
}));
document.querySelector('.config-tab.active').click();
document.querySelector('.copy-config').addEventListener('click', () => { const active = document.querySelector('.config-tab.active'); copy(configExamples[active.dataset.config].code); });

const rawBodyToggle = document.querySelector('.toggle input');
const labResult = document.querySelector('.lab-result');
rawBodyToggle.addEventListener('change', () => {
  const ready = rawBodyToggle.checked;
  labResult.classList.toggle('success', ready); labResult.classList.toggle('error', !ready);
  labResult.innerHTML = ready
    ? `<div class="result-title"><span class="result-dot"></span><b>Protected request path</b></div><div class="request-line"><span>POST</span><code>/webhooks/toss</code><b>200</b></div><ul><li>원문 bytes가 verifier로 전달됩니다.</li><li>검증 → dedupe → 핸들러 디스패치를 코어에 위임합니다.</li><li>검증용 secret은 이벤트 객체에 남지 않습니다.</li></ul><code class="bootstrap-code">NestFactory.create(AppModule, { rawBody: true })</code>`
    : `<div class="result-title"><span class="result-dot"></span><b>Configuration error, intentionally loud</b></div><div class="request-line"><span>POST</span><code>/webhooks/toss</code><b>500</b></div><ul><li>핸들러는 실행되지 않습니다.</li><li>서명·secret 검증이 불가능한 상태를 숨기지 않습니다.</li><li>bootstrap에서 rawBody 설정을 복구해야 합니다.</li></ul><code class="bootstrap-code">NestFactory.create(AppModule, { rawBody: true })</code>`;
});

const packageManagers = { pnpm: 'pnpm add @gj-kit/toss-payments @gj-kit/toss-payments-nestjs', npm: 'npm install @gj-kit/toss-payments @gj-kit/toss-payments-nestjs', yarn: 'yarn add @gj-kit/toss-payments @gj-kit/toss-payments-nestjs' };
document.querySelectorAll('.install-tab').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.install-tab').forEach((item) => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active)); }); document.querySelector('[data-install-command]').textContent = packageManagers[button.dataset.packageManager]; }));
document.querySelector('.copy-install').addEventListener('click', () => copy(document.querySelector('[data-install-command]').textContent));
document.querySelectorAll('.copy-quickstart').forEach((button) => button.addEventListener('click', () => {
  const code = document.querySelector(button.dataset.copyTarget);
  if (code) copy(code.textContent);
}));
const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); } }), { threshold: 0.13 });
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
