/**
 * SI-07 — exhaustive, parser-based audit of user-facing Korean messages.
 *
 * Uses Babel's parser so string boundaries are exact (an apostrophe inside Korean text
 * broke the earlier regex scan) and so each literal can be classified by its real position
 * in the syntax tree rather than by the characters that happen to precede it.
 *
 * Output separates:
 *   ERROR/WARNING  - what SI-07 calls 오류·경고 메시지
 *   INFO           - success/confirmation messages shown the same way
 *   CHROME         - labels, headings, placeholders, button text (not messages)
 *   DEV            - secDbg/console, debug builds only, never shown to an operator
 *   AUDIT          - audit-log detail strings, written to the log, not displayed
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';

const traverse = _traverse.default ?? _traverse;
const ROOT = process.cwd();

function files(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === 'debug') continue;
      files(p, acc);
    } else if (/\.(jsx|js)$/.test(e) && !/\.test\.jsx?$/.test(e)) acc.push(p);
  }
  return acc;
}
const hasKorean = (s) => /[가-힣]/.test(s);

/** Reconstruct a template literal as text, with ${...} left as a visible placeholder. */
function templateText(node, code) {
  return node.quasis
    .map((q, i) => q.value.cooked + (node.expressions[i] ? '${…}' : ''))
    .join('');
}

/** Nearest enclosing call/property/variable that explains how the string reaches the user. */
function classify(path) {
  // secDbg(...) and console.* — debug only
  for (let p = path; p; p = p.parentPath) {
    if (p.isCallExpression()) {
      const c = p.node.callee;
      const name = c.type === 'Identifier' ? c.name
        : c.type === 'MemberExpression' && c.object.type === 'Identifier' ? `${c.object.name}.${c.property.name ?? ''}`
        : '';
      if (name === 'secDbg') return ['DEV', 'secDbg'];
      if (/^console\./.test(name)) return ['DEV', 'console'];
      if (name === 'tryWriteAuditLog' || name === 'writeAuditLog') return ['AUDIT', 'audit log'];
    }
  }

  const parent = path.parentPath;

  // Direct calls that surface a message
  if (parent?.isCallExpression() && parent.node.arguments.includes(path.node)) {
    const c = parent.node.callee;
    const name = c.type === 'Identifier' ? c.name
      : c.type === 'MemberExpression' ? (c.property?.name ?? '') : '';
    if (name === 'Error') return ['ERROR', 'throw new Error'];
    if (name === 'alert') return ['ERROR', 'alert()'];
    if (name === 'renderBlockingError') return ['ERROR', 'blocking screen'];
    if (/^set(Error|FormErrors|Errors|ErrorMsg|DeleteError)/.test(name)) return ['ERROR', name];
    if (name === 'push') return ['ERROR', 'errors.push'];
    if (/^(min|max|regex|refine|email|nonempty|length)$/.test(name)) return ['ERROR', 'validator'];
  }
  if (parent?.isNewExpression() && parent.node.callee?.name === 'Error') return ['ERROR', 'throw new Error'];

  // Inside an array passed to setFormErrors/setErrors
  if (parent?.isArrayExpression() && parent.parentPath?.isCallExpression()) {
    const n = parent.parentPath.node.callee?.name ?? '';
    if (/^set(FormErrors|Errors)/.test(n)) return ['ERROR', n];
  }

  // Object properties
  if (parent?.isObjectProperty() && parent.node.value === path.node) {
    const key = parent.node.key.name ?? parent.node.key.value;
    if (key === 'error') return ['ERROR', 'error:'];
    if (key === 'message') {
      // setStatus({ type: 'success'|'error', message }) — the sibling decides severity,
      // so a completed backup is not counted as an error.
      const sib = parent.parentPath?.node?.properties?.find(
        (pr) => pr.type === 'ObjectProperty' && (pr.key.name ?? pr.key.value) === 'type',
      );
      const t = sib?.value?.value;
      if (t === 'success') return ['INFO', 'status message (success)'];
      return ['ERROR', `message:${t ? ` (${t})` : ''}`];
    }
    if (key === 'detail' || key === 'action') return ['AUDIT', 'audit detail'];
    if (key === 'title' || key === 'description') {
      // toast({...}) — severity comes from the sibling `variant`
      const obj = parent.parentPath;
      const variant = obj?.node?.properties?.find(
        (pr) => pr.type === 'ObjectProperty' && (pr.key.name ?? pr.key.value) === 'variant',
      );
      const v = variant?.value?.value;
      return [v === 'destructive' ? 'ERROR' : 'INFO', `toast ${key}${v ? ` (${v})` : ''}`];
    }
    if (key === '설명' || key === 'description_ko') return ['DEV', 'secDbg field'];
  }

  // const GENERIC_ERROR = '...'
  if (parent?.isVariableDeclarator() && parent.node.init === path.node) {
    const id = parent.node.id.name ?? '';
    if (/error|ERROR|실패/i.test(id)) return ['ERROR', `const ${id}`];
    return ['CHROME', `const ${id}`];
  }

  // JSX
  if (path.isJSXText?.()) return ['CHROME', 'JSX text'];
  if (parent?.isJSXAttribute?.()) return ['CHROME', `attr ${parent.node.name?.name ?? ''}`];
  if (parent?.isJSXExpressionContainer?.()) return ['CHROME', 'JSX expression'];

  return ['UNCLASSIFIED', ''];
}

const rows = [];
for (const f of files(join(ROOT, 'src'))) {
  const code = readFileSync(f, 'utf8');
  const rel = relative(ROOT, f).replace(/\\/g, '/');
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  } catch (e) {
    console.error(`PARSE FAILED ${rel}: ${e.message}`);
    continue;
  }
  traverse(ast, {
    StringLiteral(path) {
      if (!hasKorean(path.node.value)) return;
      const [kind, how] = classify(path);
      rows.push({ file: rel, line: path.node.loc.start.line, kind, how, dynamic: false, text: path.node.value });
    },
    TemplateLiteral(path) {
      const text = templateText(path.node, code);
      if (!hasKorean(text)) return;
      const [kind, how] = classify(path);
      rows.push({ file: rel, line: path.node.loc.start.line, kind, how, dynamic: path.node.expressions.length > 0, text });
    },
    JSXText(path) {
      const text = path.node.value.trim();
      if (!hasKorean(text)) return;
      rows.push({ file: rel, line: path.node.loc.start.line, kind: 'CHROME', how: 'JSX text', dynamic: false, text });
    },
  });
}

const norm = (t) => t.replace(/\s+/g, ' ').trim();
const by = (k) => rows.filter((r) => r.kind === k);
const distinct = (list) => [...new Set(list.map((r) => norm(r.text)))];

console.log('total Korean literals:', rows.length, '\n');
for (const k of ['ERROR', 'INFO', 'CHROME', 'DEV', 'AUDIT', 'UNCLASSIFIED']) {
  console.log(`${k.padEnd(14)} occurrences ${String(by(k).length).padStart(4)}   distinct ${String(distinct(by(k)).length).padStart(4)}`);
}

console.log('\n=== ERROR / WARNING messages (distinct) ===');
distinct(by('ERROR')).sort((a, b) => a.localeCompare(b, 'ko')).forEach((t, i) =>
  console.log(`${String(i + 1).padStart(3)}. ${t}`),
);

console.log('\n=== INFO / success messages (distinct) ===');
distinct(by('INFO')).sort((a, b) => a.localeCompare(b, 'ko')).forEach((t, i) =>
  console.log(`${String(i + 1).padStart(3)}. ${t}`),
);

console.log('\n=== ERROR rows with location (manual audit) ===');
by('ERROR')
  .sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line))
  .forEach((r) => console.log(`  ${(r.file + ':' + r.line).padEnd(44)} [${r.how}] ${norm(r.text).slice(0, 70)}`));

// Anything in UNCLASSIFIED that reads like a message must be looked at by hand rather
// than dropped — a missed message is exactly the failure mode SI-07 cares about.
const MSGY = /(실패|오류|없습니다|없음|할 수 없|주세요|하십시오|초과|잠금|불가|다시 시도|입력하세요|아닙니다)/;
console.log('\n=== UNCLASSIFIED that read like messages (manual review) ===');
by('UNCLASSIFIED')
  .filter((r) => MSGY.test(r.text))
  .forEach((r) => console.log(`  ${(r.file + ':' + r.line).padEnd(44)} ${norm(r.text).slice(0, 84)}`));

writeFileSync(join(ROOT, 'docs/submission/evidence/si07-message-audit.json'), JSON.stringify(rows, null, 2), 'utf8');
