/**
 * Produce one image per catalogued message.
 *
 * The captures in screens/ are the raw frames, and several messages routinely
 * share one frame — a toast's title and description are two catalogue entries
 * but a single popup, and the startup blocking screen carries three. That is
 * accurate but it makes a reviewer cross-reference a table to find a given
 * number.
 *
 * This writes by-message/, where every message number has its own file named
 * after the message. Where a frame carries several numbers the same image is
 * written under each, so looking up a number always lands on a picture of it.
 *
 * Usage: node scripts/build-per-message-evidence.mjs
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'docs/submission/evidence/v1.1.7-error-list';
const SRC = join(ROOT, 'screens');
const OUT = join(ROOT, 'by-message');
const LIST = join(ROOT, 'SI-07-오류메시지-전수목록.md');
const RES = join(ROOT, 'capture-results.json');

/* ── the catalogue ───────────────────────────────────────────────────────── */

const doc = readFileSync(LIST, 'utf8');
const messages = new Map();
for (const m of doc.matchAll(/^\|\s*(~~)?(\d+)(~~)?\s*\|\s*(.+?)\s*\|/gm)) {
  if (m[1]) continue; // struck through = retired
  const text = m[4].replace(/\*\*/g, '').replace(/`/g, '').trim();
  if (text && !text.startsWith('메시지')) messages.set(Number(m[2]), text);
}

const squash = (t) => t.replace(/[·\s.,()[\]…:]+/g, '');
const matcher = (t) =>
  new RegExp(
    t
      .split(/\{[^}]*\}/)
      .map((p) => squash(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.{0,12}'),
  );

/* ── what each frame shows ───────────────────────────────────────────────── */

// Device frames were photographed from the emulator; their on-screen text is
// recorded here because they do not go through the browser harness.
const DEVICE = {
  'M001_암호화_키_오류_실기기.png':
    '암호화 키 오류 저장된 암호화 키를 복구할 수 없습니다. 환자 데이터를 복호화할 수 없으므로 앱을 시작할 수 없습니다. 관리자에게 문의하십시오.',
  'M003_무결성_검사_실패_파일변조_실기기.png':
    '무결성 검사 실패 앱 파일의 무결성을 확인할 수 없습니다. 파일이 변조되었을 수 있습니다. 무결성 검사 실패 (파일 변조 감지): /assets/index.js',
  'M011_무결성_매니페스트_로드불가_실기기.png':
    '무결성 검사 실패 앱 파일의 무결성을 확인할 수 없습니다. 파일이 변조되었을 수 있습니다. 무결성 매니페스트를 로드할 수 없습니다 (integrity.json)',
  'M012_무결성_검사_파일_로드_실패_실기기.png':
    '무결성 검사 실패 앱 파일의 무결성을 확인할 수 없습니다. 파일이 변조되었을 수 있습니다. 무결성 검사 파일 로드 실패: /assets/web.js',
};
const RENAMED = {
  'M025_비밀번호_정책_오류_5건.png': 'M025b_비밀번호_정책_오류_전체_(제출_후).png',
  'M040_감사_로그_저장_공간_경고_(UC-05).png': 'M040c_감사_로그_저장_공간_경고_(UC-05).png',
};

// Four catalogued strings exist in the source but cannot reach a user's screen;
// the reasons are recorded in the catalogue. They are listed apart from genuine
// capture gaps so "not captured" keeps meaning "we could and did not".
const UNDISPLAYABLE = {
  35: '삭제 버튼이 본인 계정에는 렌더링되지 않아 조작 자체가 불가능',
  36: '`UserStore.delete` 가 던지는 오류는 #35 뿐이라 폴백 문구에 도달할 경로 없음',
  69: '`Patient.delete` 에 던질 수 있는 경로가 없음',
  79: '업로드 화면의 catch 가 `safeMsg`(#50)로 치환하여 표시',
};

const onDisk = readdirSync(SRC).filter((f) => f.endsWith('.png'));
const frameText = new Map();
for (const r of JSON.parse(readFileSync(RES, 'utf8'))) {
  if (r.verified && r.file && r.screenText) frameText.set(r.file, { text: r.screenText, method: r.method || 'user-action' });
}
for (const [now, before] of Object.entries(RENAMED)) {
  if (frameText.has(before)) frameText.set(now, frameText.get(before));
}
for (const [f, text] of Object.entries(DEVICE)) frameText.set(f, { text, method: '실기기 캡처' });

/* ── pick one frame per message ──────────────────────────────────────────── */

const shows = new Map(); // frame -> Set(numbers)
for (const f of onDisk) {
  const entry = frameText.get(f);
  if (!entry) continue;
  const hay = squash(entry.text);
  const nums = new Set();
  for (const [n, t] of messages) {
    if (squash(t).length >= 4 && matcher(t).test(hay)) nums.add(n);
  }
  shows.set(f, nums);
}

const chosen = new Map(); // number -> frame
for (const [n] of messages) {
  const candidates = onDisk.filter((f) => shows.get(f)?.has(n));
  if (!candidates.length) continue;
  // Prefer the frame captured *for* this message (its id carries the number),
  // then the most focused frame — fewest other messages competing for attention.
  candidates.sort((a, b) => {
    const aOwn = a.startsWith(`M${String(n).padStart(3, '0')}`) ? 0 : 1;
    const bOwn = b.startsWith(`M${String(n).padStart(3, '0')}`) ? 0 : 1;
    if (aOwn !== bOwn) return aOwn - bOwn;
    return shows.get(a).size - shows.get(b).size;
  });
  chosen.set(n, candidates[0]);
}

/* ── write by-message/ ───────────────────────────────────────────────────── */

// Empty the directory rather than removing it — on Windows a shell sitting in
// the folder makes rmdir fail, and re-running the build should not need that.
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(join(OUT, f), { force: true });

const safe = (t) =>
  t
    .replace(/\{[^}]*\}/g, 'N')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60)
    .replace(/_+$/, '');

const rows = [];
for (const [n, text] of [...messages].sort((a, b) => a[0] - b[0])) {
  const frame = chosen.get(n);
  const num = String(n).padStart(3, '0');
  if (!frame) {
    rows.push({ n, file: null, text, method: null, shared: null, blocked: UNDISPLAYABLE[n] ?? null });
    continue;
  }
  const name = `${num}_${safe(text)}.png`;
  copyFileSync(join(SRC, frame), join(OUT, name));
  const also = [...shows.get(frame)].filter((x) => x !== n).sort((a, b) => a - b);
  rows.push({ n, file: name, text, method: frameText.get(frame)?.method ?? '—', shared: also, blocked: null });
}

const done = rows.filter((r) => r.file);
const blocked = rows.filter((r) => !r.file && r.blocked);
const missing = rows.filter((r) => !r.file && !r.blocked);

const md = [
  '# 메시지별 화면 캡처 (1 메시지 = 1 파일)',
  '',
  `- 등재 문구 ${messages.size}건 중 **표시 가능 ${messages.size - blocked.length}건**`,
  `- 파일 수: **${done.length}** (메시지 번호당 1장)`,
  `- 표시 불가로 확인된 문구: ${blocked.length}건 — ${blocked.map((r) => '#' + r.n).join(', ') || '없음'} (아래 표에 사유 기재)`,
  `- 표시 가능하나 미확보: ${missing.length}건 — ${missing.map((r) => '#' + r.n).join(', ') || '없음'}`,
  '',
  '파일명은 `번호_메시지.png` 이므로 번호만 알면 바로 찾을 수 있습니다.',
  '',
  '> 토스트의 제목과 설명, 시작 차단 화면의 제목·본문·상세처럼 **한 화면에 함께 나타나는**',
  '> 메시지들은 같은 이미지가 각 번호로 저장되어 있습니다. 원본 프레임은 `../screens/` 에',
  '> 있습니다.',
  '',
  '| # | 메시지 | 파일 | 같은 화면에 함께 보이는 번호 | 획득 방식 |',
  '|---|---|---|---|---|',
  ...rows.map((r) =>
    r.file
      ? `| ${r.n} | ${r.text} | \`${r.file}\` | ${r.shared.length ? r.shared.map((x) => '#' + x).join(', ') : '—'} | ${r.method} |`
      : r.blocked
        ? `| ${r.n} | ${r.text} | *표시 불가* | — | ${r.blocked} |`
        : `| ${r.n} | ${r.text} | **미확보** | — | — |`,
  ),
  '',
].join('\n');
writeFileSync(join(OUT, 'README.md'), md, 'utf8');

console.log(
  `by-message/: ${done.length} files written, ${blocked.length} undisplayable, ${missing.length} displayable but uncaptured`,
);
if (missing.length) console.log('uncaptured:', missing.map((r) => '#' + r.n).join(', '));
