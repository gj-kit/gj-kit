import { access, copyFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * scripts/og-card.html을 public/og.png(1200x630)로 굽는다.
 *
 * 1200x630은 og:image의 사실상 표준이고 Twitter summary_large_image의 1.91:1과
 * 맞는다. 이전 이미지는 1659x948(1.75:1)이라 카드에서 잘렸고, 1.4MB라 링크
 * 미리보기를 만드는 쪽이 매번 그만큼 내려받아야 했다.
 *
 * 새 의존성은 두지 않는다 — 이미 깔려 있는 헤드리스 Chrome과 ImageMagick을
 * 쓰고, 둘 다 없으면 무엇을 설치해야 하는지 알려주고 멈춘다. OG 이미지는
 * 어쩌다 한 번 다시 굽는 정적 자산이라 verify·CI에는 넣지 않는다.
 *
 *   node scripts/generate-og.mjs
 */

const run = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const source = path.join(scriptDir, 'og-card.html');
const target = path.join(projectDir, 'public/og.png');

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // 다음 후보로.
    }
  }
  return null;
}

async function hasCommand(name) {
  try {
    await run('command', ['-v', name], { shell: '/bin/sh' });
    return true;
  } catch {
    return false;
  }
}

const chrome = await firstExisting(CHROME_CANDIDATES);
if (chrome === null) {
  console.error(
    'Chrome을 찾지 못했습니다. CHROME_BIN에 실행 파일 경로를 지정하거나 Google Chrome을 설치하세요.',
  );
  process.exit(1);
}

const work = await mkdtemp(path.join(tmpdir(), 'gj-og-'));
try {
  // 2배로 렌더한 뒤 줄이면 텍스트 가장자리가 살아난다.
  await run(chrome, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    `--window-size=${OG_WIDTH},${OG_HEIGHT}`,
    `--screenshot=${path.join(work, 'og-2x.png')}`,
    pathToFileURL(source).href,
  ]);

  if (await hasCommand('magick')) {
    // 카드는 평면 색 위주라 256색 팔레트에서 눈에 띄는 손실이 없다.
    // dither는 꺼야 한다 — 어두운 톤을 줄일 때 넓은 평면에 얼룩이 생기고,
    // 그 얼룩 때문에 오히려 파일이 커진다.
    await run('magick', [
      path.join(work, 'og-2x.png'),
      '-resize', `${OG_WIDTH}x${OG_HEIGHT}`,
      '-strip',
      '-dither', 'None',
      '-colors', '256',
      '-define', 'png:compression-level=9',
      '-define', 'png:compression-filter=5',
      target,
    ]);
  } else {
    console.warn('ImageMagick(magick)이 없어 2배 원본을 그대로 씁니다 — 파일이 커집니다.');
    await copyFile(path.join(work, 'og-2x.png'), target);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}

const { size } = await stat(target);
console.log(`OG image generated: ${OG_WIDTH}x${OG_HEIGHT}, ${(size / 1024).toFixed(1)} kB.`);
