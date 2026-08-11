const scenarios = {
  widget: {
    label: 'confirm.ts',
    title: '인증 완료와 승인을\n혼동하지 않습니다.',
    description: 'successUrl의 값은 브라우저를 통과합니다. 저장한 주문과 대조를 마친 값만 <code>confirm</code>에 전달할 수 있습니다.',
    steps: ['서버 주문 생성', '위젯 요청', '검증 후 승인'],
    code: `const parsed = parseSuccessCallback(req.url);\nif (isErr(parsed)) return badRequest();\n\nconst verified = await toss.confirm.verify(parsed.value);\nif (isErr(verified)) return reject(verified.error);\n\nreturn toss.confirm.confirm(verified.value);`,
  },
  billing: {
    label: 'subscription.ts',
    title: '같은 요청을 두 번\n승인하지 않습니다.',
    description: '빌링 승인은 멱등키를 필수로 받습니다. API 키와 위젯 키의 교차 사용도 컴파일 시점에 차단합니다.',
    steps: ['빌링 프로필 로드', '멱등키 봉인', '안전한 승인'],
    code: `const result = await toss.billing.approve(profile, order, {\n  idempotencyKey: orThrow(\n    idempotencyKey('sub:2026-08:customer-1'),\n  ),\n});\n\nif (isErr(result)) return recover(result.error);\nreturn result.value;`,
  },
  webhook: {
    label: 'webhooks/toss.ts',
    title: '신뢰할 수 없는 이벤트는\n그대로 믿지 않습니다.',
    description: '서명·입금 secret·미검증 이벤트를 구분합니다. 상태 변경 이벤트는 자동 재조회 결과로만 동기화할 수 있습니다.',
    steps: ['raw body 검증', '원자적 dedupe', '조회 후 반영'],
    code: `export const POST = toss.webhook.fetchHandler({\n  onPaymentStatusChanged: async ({ prefetched }) => {\n    if (prefetched?.ok) {\n      await syncStatus(prefetched.value);\n    }\n  },\n});`,
  },
};

const keyDetails = {
  'api-client': ['브라우저 · 빌링 인증창', 'parseApiClientKey · root entry'],
  'api-secret': ['서버 · 조회·취소·빌링 API', 'parseApiSecretKey · /server only'],
  'widget-client': ['브라우저 · 결제위젯', 'parseWidgetClientKey · root entry'],
  'widget-secret': ['서버 · 위젯 결제 승인', 'parseWidgetSecretKey · /server only'],
};

const escapeHtml = (value) => value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
const toast = document.querySelector('.toast');
let toastTimer;
function showToast(message = '클립보드에 복사했어요.') {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast();
  } catch {
    showToast('복사할 수 없어요. 직접 선택해 복사해 주세요.');
  }
}

document.querySelectorAll('.scenario').forEach((button) => {
  button.addEventListener('click', () => {
    const scenario = scenarios[button.dataset.scenario];
    document.querySelectorAll('.scenario').forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
    });
    document.querySelector('[data-code-label]').textContent = scenario.label;
    document.querySelector('[data-scenario-title]').innerHTML = scenario.title.replace('\n', '<br />');
    document.querySelector('[data-scenario-description]').innerHTML = scenario.description;
    document.querySelector('[data-scenario-steps]').innerHTML = scenario.steps
      .map((step, index) => `${index ? '<i></i>' : ''}<span class="${index === scenario.steps.length - 1 ? 'current' : ''}">${step}</span>`)
      .join('');
    document.querySelector('[data-scenario-code]').innerHTML = escapeHtml(scenario.code)
      .replace(/\b(const|await|if|return|async|export)\b/g, '<span class="c-key">$1</span>')
      .replace(/\b(parseSuccessCallback|isErr|verify|confirm|approve|orThrow|idempotencyKey|recover|fetchHandler|syncStatus)\b/g, '<span class="c-fn">$1</span>');
    document.querySelector('.copy-code').dataset.copy = button.dataset.scenario;
  });
});
document.querySelector('.scenario.active').click();

document.querySelectorAll('.copy-code').forEach((button) => button.addEventListener('click', () => copy(scenarios[button.dataset.copy].code)));
document.querySelectorAll('.key-choice').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.key-choice').forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
    });
    const [title, detail] = keyDetails[button.dataset.key];
    document.querySelector('.key-detail').innerHTML = `<b>${title}</b><span><code>${detail}</code></span>`;
  });
});

const packageManagers = { pnpm: 'pnpm add @gj-kit/toss-payments', npm: 'npm install @gj-kit/toss-payments', yarn: 'yarn add @gj-kit/toss-payments' };
document.querySelectorAll('.install-tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.install-tab').forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
    });
    document.querySelector('[data-install-command]').textContent = packageManagers[button.dataset.packageManager];
  });
});
document.querySelector('.copy-install').addEventListener('click', () => copy(document.querySelector('[data-install-command]').textContent));

const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
  if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
}), { threshold: 0.13 });
document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
