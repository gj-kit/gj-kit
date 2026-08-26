import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const websiteDir = path.resolve(scriptDir, '..');
const repositoryDir = path.resolve(websiteDir, '..');
const snapshot = JSON.parse(await readFile(path.join(websiteDir, 'api-snapshots', 'published.json'), 'utf8'));
const temporaryDir = await mkdtemp(path.join(websiteDir, '.docs-check-'));

function importPath(pkg, entry) {
  return `${pkg.name}${entry.subpath === '.' ? '' : entry.subpath.slice(1)}`;
}

try {
  const exampleFiles = [];
  const paths = {};
  for (const pkg of snapshot.packages) {
    for (const entry of pkg.entries) {
      const importNames = [...new Set(entry.symbols.map((symbol) => symbol.name))];
      if (importNames.length === 0 || importNames.some((name) => name === 'default')) continue;
      const filename = path.join(temporaryDir, `${pkg.slug}-${entry.id}.ts`);
      await writeFile(
        filename,
        `// Generated from the release snapshot; matches every API-page import example.\nimport { ${importNames.join(', ')} } from '${importPath(pkg, entry)}';\nexport {};\n`,
        'utf8',
      );
      exampleFiles.push(filename);
      paths[importPath(pkg, entry)] = [path.relative(
        websiteDir,
        path.join(repositoryDir, pkg.slug, entry.declarationTarget.slice(2)),
      )];
    }
  }

  const program = ts.createProgram({
    rootNames: exampleFiles,
    options: {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
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
  console.log(`API import examples type-checked: ${exampleFiles.length} public entry points.`);
} finally {
  await rm(temporaryDir, { recursive: true, force: true });
}
