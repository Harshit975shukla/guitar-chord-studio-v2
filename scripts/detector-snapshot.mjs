import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const gitOptions = { encoding: 'utf8', cwd: fileURLToPath(new URL('../', import.meta.url)) };

/** Keep the entire baseline detector independent of working-tree helper changes. */
export function detectorSnapshot(ref) {
  if (!/^[0-9a-f]{7,40}$/i.test(ref)) throw new Error('Baseline must be a commit hash.');
  const revision = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], gitOptions).trim();
  const paths = new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', revision, '--', 'src'], gitOptions).trim().split('\n'));
  const modules = new Map(), loading = new Set(), hashes = {};
  const load = path => {
    if (modules.has(path)) return modules.get(path);
    if (loading.has(path)) throw new Error(`Cyclic baseline import: ${path}`);
    loading.add(path);
    const source = execFileSync('git', ['show', `${revision}:${path}`], gitOptions);
    hashes[path] = createHash('sha256').update(source).digest('hex');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const file = ts.createSourceFile(path, compiled, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    const replacements = [];
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      if (!specifier.text.startsWith('.')) throw new Error(`Unsupported baseline dependency: ${specifier.text}`);
      const stem = posix.normalize(posix.join(posix.dirname(path), specifier.text));
      const resolved = [stem, `${stem}.ts`, `${stem}/index.ts`].find(candidate => paths.has(candidate));
      if (!resolved) throw new Error(`Missing baseline dependency ${specifier.text} in ${path}`);
      const js = load(resolved);
      const url = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
      replacements.push({ start: specifier.getStart(file), end: specifier.end, text: JSON.stringify(url) });
    }
    let js = compiled;
    for (const replacement of replacements.reverse()) {
      js = js.slice(0, replacement.start) + replacement.text + js.slice(replacement.end);
    }
    loading.delete(path);
    modules.set(path, js);
    return js;
  };
  return { js: load('src/detection/engine.ts'), revision, hashes };
}
