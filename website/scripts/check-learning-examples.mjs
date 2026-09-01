import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { learningBySlug, packageBySlug } from '../src/data/catalog.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const websiteDir = path.resolve(scriptDir, '..');
const repositoryDir = path.resolve(websiteDir, '..');
const snapshot = JSON.parse(await readFile(path.join(websiteDir, 'api-snapshots', 'published.json'), 'utf8'));
const temporaryDir = await mkdtemp(path.join(websiteDir, '.learning-examples-'));

function fail(message) {
  throw new Error(`Learning example check failed: ${message}`);
}

function importPath(pkg, entry) {
  return `${pkg.name}${entry.subpath === '.' ? '' : entry.subpath.slice(1)}`;
}

function sourceFor(product, recipe) {
  if (recipe.source === 'quick-start') return { language: product.slug === 'expo-ui' ? 'tsx' : 'ts', code: product.code };
  if (recipe.source === 'showcase' && product.showcase) return product.showcase;
  fail(`${product.name} recipe ${recipe.slug} has no ${recipe.source} source`);
}

try {
  const paths = {};
  for (const pkg of snapshot.packages) {
    for (const entry of pkg.entries) {
      paths[importPath(pkg, entry)] = [path.relative(
        websiteDir,
        path.join(repositoryDir, pkg.slug, entry.declarationTarget.slice(2)),
      )];
    }
  }
  // A few existing README snippets intentionally demonstrate host framework
  // boundaries. Map their type-only peers just as the package-owned README
  // checkers do; this validates public GJ Kit imports without adding peers to
  // the docs package itself.
  paths.react = [path.relative(websiteDir, path.join(repositoryDir, 'expo-ui', 'node_modules', '@types', 'react', 'index.d.ts'))];
  paths['react/jsx-runtime'] = [path.relative(websiteDir, path.join(repositoryDir, 'expo-ui', 'node_modules', '@types', 'react', 'jsx-runtime.d.ts'))];
  paths['@nestjs/common'] = [path.relative(websiteDir, path.join(repositoryDir, 'toss-payments-nestjs', 'node_modules', '@nestjs', 'common', 'index.d.ts'))];
  paths.pg = [path.relative(websiteDir, path.join(repositoryDir, 'toss-payments-postgresql', 'node_modules', '@types', 'pg', 'index.d.ts'))];

  const examples = [];
  for (const pkg of snapshot.packages) {
    const product = packageBySlug.get(pkg.slug);
    const learning = learningBySlug[pkg.slug];
    if (!product || !learning) fail(`missing catalog entry for ${pkg.name}`);
    for (const recipe of learning.recipes) {
      const example = sourceFor(product, recipe);
      const extension = example.language === 'tsx' ? 'tsx' : 'ts';
      const filename = path.join(temporaryDir, `${pkg.slug}-${recipe.slug}.${extension}`);
      await writeFile(filename, `${example.code}\n`, 'utf8');
      examples.push(filename);
    }
  }
  const globals = path.join(temporaryDir, 'globals.d.ts');
  await writeFile(globals, 'declare const it: (name: string, run: () => unknown) => void;\n', 'utf8');

  const program = ts.createProgram({
    rootNames: [...examples, globals],
    options: {
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      experimentalDecorators: true,
      baseUrl: websiteDir,
      paths,
      ignoreDeprecations: '6.0',
      skipLibCheck: true,
      noEmit: true,
    },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length > 0) {
    const formatHost = {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => websiteDir,
      getNewLine: () => '\n',
    };
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
  }
  console.log(`Learning examples type-checked: ${examples.length} recipe snippets from ${snapshot.packages.length} packages.`);
} finally {
  await rm(temporaryDir, { recursive: true, force: true });
}
