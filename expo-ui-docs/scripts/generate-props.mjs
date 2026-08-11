/**
 * 컴포넌트 props 표를 라이브러리의 실제 TypeScript 타입에서 뽑아낸다.
 *
 * 손으로 쓴 props 표는 반드시 API와 어긋난다. 여기서는 tsc의 타입 체커로
 * `XxxProps`의 apparent properties를 평탄화해 읽으므로, prop을 추가·삭제·변경하면
 * 문서가 다음 빌드에서 자동으로 따라간다.
 *
 * 출력: src/component-props.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const libraryDir = path.resolve(projectDir, '../expo-ui');
const entry = path.join(libraryDir, 'src/index.shared.ts');

const catalog = JSON.parse(await readFile(path.join(projectDir, 'src/seo-catalog.json'), 'utf8'));

/** 컴포넌트 이름과 다른 props 타입 이름을 쓰는 예외. */
const PROPS_TYPE_OVERRIDES = {
  FloatingActionButton: 'FABProps',
};

const program = ts.createProgram([entry], {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
});
const checker = program.getTypeChecker();

const entrySource = program.getSourceFile(entry);
if (entrySource === undefined) throw new Error(`엔트리를 찾을 수 없습니다: ${entry}`);

const entrySymbol = checker.getSymbolAtLocation(entrySource);
if (entrySymbol === undefined) throw new Error('엔트리 모듈 심볼을 찾을 수 없습니다.');

const exported = new Map(
  checker.getExportsOfModule(entrySymbol).map((symbol) => [symbol.getName(), symbol]),
);

/** union/intersection을 포함해 props 타입에서 실제로 쓸 수 있는 prop을 모은다. */
function collectProps(typeName) {
  const symbol = exported.get(typeName);
  if (symbol === undefined) return null;

  const declared = checker.getDeclaredTypeOfSymbol(
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol,
  );
  // 판별 유니언(Chip, Link, Dialog 등)은 각 갈래의 prop을 합집합으로 보여준다.
  const branches = declared.isUnion() ? declared.types : [declared];

  const merged = new Map();
  const excludedInSomeBranch = new Set();
  let inheritsPlatformProps = false;
  for (const branch of branches) {
    for (const property of branch.getApparentProperties()) {
      const declaration = property.declarations?.[0];
      if (declaration === undefined) continue;

      // TextField는 RN TextInputProps를 상속해 178개가 딸려 온다. 라이브러리가
      // 직접 정의한 계약만 표에 싣고, 나머지는 한 줄 안내로 대체한다.
      const declaredIn = declaration.getSourceFile().fileName;
      if (!declaredIn.startsWith(libraryDir) || declaredIn.includes('node_modules')) {
        inheritsPlatformProps = true;
        continue;
      }

      const raw = checker.typeToString(
        checker.getTypeOfSymbolAtLocation(property, declaration),
        undefined,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType,
      );
      // `never` / `undefined`는 "이 갈래에서는 못 쓴다"는 표시다. `unstyled?: never`처럼
      // 모든 갈래에서 막힌 prop은 표에서 빠지고, Button의 label처럼 한 갈래에서만
      // 막힌 prop은 "필수"가 아니라 "조건부"로 표시해야 한다.
      if (raw === 'never' || raw === 'undefined') {
        excludedInSomeBranch.add(property.getName());
        continue;
      }

      const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
      const description = ts.displayPartsToString(property.getDocumentationComment(checker)).trim();
      const existing = merged.get(property.getName());
      if (existing === undefined) {
        merged.set(property.getName(), {
          name: property.getName(),
          type: normalizeType(raw),
          required: !optional,
          ...(description ? { description } : {}),
        });
        continue;
      }
      // 한 갈래에서만 필수라면 조건부이므로 선택으로 표시한다.
      if (optional) existing.required = false;
      // 갈래마다 타입이 다르면(DataTable의 presentation: 'table' | 'list' | 'auto')
      // 첫 갈래 값만 남기지 말고 합집합으로 보여준다. 제네릭·함수 시그니처 안의
      // ' | '까지 쪼개지 않도록 괄호 깊이가 0인 곳에서만 분해한다.
      existing.type = normalizeType(
        [...new Set([...splitUnion(existing.type), ...splitUnion(collapse(raw))])].join(' | '),
      );
    }
  }

  const props = [...merged.values()].map((prop) => {
    // 병합 경로와 무관하게 마지막에 한 번 더 union 멤버를 정규화·중복 제거한다.
    const type = normalizeType([...new Set(splitUnion(prop.type))].join(' | '));
    return excludedInSomeBranch.has(prop.name) && prop.required
      ? { ...prop, type, required: false, conditional: true }
      : { ...prop, type };
  });
  props.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { props, inheritsPlatformProps };
}

/** 최상위 union 멤버로만 쪼갠다. `(a: X | Y) => void`의 내부 `|`는 건드리지 않는다. */
function splitUnion(raw) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    // `=>`의 `>`는 제네릭 닫는 괄호가 아니다. 이걸 세면 depth가 음수로 내려가
    // 뒤따르는 최상위 `|`를 놓친다.
    const isArrow = char === '>' && raw[index - 1] === '=';
    if ('([{<'.includes(char)) depth += 1;
    else if (!isArrow && ')]}>'.includes(char)) depth -= 1;
    if (char === '|' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts
    .map(stripOuterParens)
    .filter((part) => part.length > 0 && part !== 'undefined');
}

/** `(() => void)`와 `() => void`가 서로 다른 union 멤버로 남지 않게 한다. */
function stripOuterParens(part) {
  if (!part.startsWith('(') || !part.endsWith(')')) return part;
  let depth = 0;
  for (let index = 0; index < part.length; index += 1) {
    if (part[index] === '(') depth += 1;
    else if (part[index] === ')') {
      depth -= 1;
      if (depth === 0 && index !== part.length - 1) return part;
    }
  }
  return part.slice(1, -1).trim();
}

/** 줄바꿈·연속 공백만 제거한다. 길이 제한은 마지막에 normalizeType에서 건다. */
function collapse(raw) {
  return raw.replace(/\s+/gu, ' ');
}

function normalizeType(raw) {
  const collapsed = collapse(raw).replace(/ \| undefined$/u, '');
  return collapsed.length > 160 ? `${collapsed.slice(0, 157)}…` : collapsed;
}

const result = {};
const missing = [];
for (const component of catalog.components) {
  const typeName = PROPS_TYPE_OVERRIDES[component.name] ?? `${component.name}Props`;
  const collected = collectProps(typeName);
  if (collected === null || collected.props.length === 0) {
    missing.push(`${component.name} (${typeName})`);
    continue;
  }
  result[component.slug] = {
    typeName,
    props: collected.props,
    ...(collected.inheritsPlatformProps ? { inheritsPlatformProps: true } : {}),
  };
}

if (missing.length > 0) {
  console.warn(`props 타입을 찾지 못한 컴포넌트: ${missing.join(', ')}`);
}

await writeFile(
  path.join(projectDir, 'src/component-props.json'),
  `${JSON.stringify(result, null, 2)}\n`,
  'utf8',
);

const total = Object.values(result).reduce((sum, entry) => sum + entry.props.length, 0);
console.log(
  `Props tables generated: ${Object.keys(result).length}/${catalog.components.length} components, ${total} props.`,
);
