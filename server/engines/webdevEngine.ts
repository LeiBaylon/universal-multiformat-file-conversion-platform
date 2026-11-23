import * as sass from 'sass';
import less from 'less';
import { transform as esbuildTransform } from 'esbuild';
import CleanCSS from 'clean-css';
import { minify as terserMinify } from 'terser';
import { marked } from 'marked';

export async function transpileWebAsset(
  source: string,
  sourceExt: string,
  targetExt: string,
  options: { minify?: boolean } = {}
): Promise<{ output: string; operationKind: 'transpilation' | 'conversion'; note: string }> {
  const src = sourceExt.toLowerCase();
  const dst = targetExt.toLowerCase();

  if (src === 'scss' || src === 'sass') {
    if (dst !== 'css') throw new Error(`${src.toUpperCase()} transpiles to CSS.`);
    const res = sass.compileString(source, {
      syntax: src === 'sass' ? 'indented' : 'scss',
      style: options.minify ? 'compressed' : 'expanded',
    });
    return {
      output: res.css,
      operationKind: 'transpilation',
      note: `Compiled ${src.toUpperCase()} stylesheet to standard CSS.`,
    };
  }

  if (src === 'less') {
    if (dst !== 'css') throw new Error('LESS transpiles to CSS.');
    const res = await less.render(source, { compress: Boolean(options.minify) });
    return {
      output: res.css,
      operationKind: 'transpilation',
      note: 'Compiled LESS stylesheet to standard CSS.',
    };
  }

  if (src === 'css' && dst === 'css') {
    const min = new CleanCSS({ level: options.minify !== false ? 2 : 0 }).minify(source);
    if (min.errors.length > 0) throw new Error(min.errors.join('; '));
    return {
      output: min.styles,
      operationKind: 'transpilation',
      note: 'Minified and optimized CSS rules.',
    };
  }

  if (src === 'ts' || src === 'tsx' || src === 'jsx') {
    if (dst !== 'js') throw new Error(`${src.toUpperCase()} transpiles to JS.`);
    const res = await esbuildTransform(source, {
      loader: src,
      target: 'es2022',
      jsx: 'automatic',
      minify: Boolean(options.minify),
    });
    return {
      output: res.code,
      operationKind: 'transpilation',
      note: `Transpiled ${src.toUpperCase()} source module to ES2022 JavaScript via esbuild.`,
    };
  }

  if (src === 'js' && dst === 'js') {
    const min = await terserMinify(source);
    return {
      output: min.code || source,
      operationKind: 'transpilation',
      note: 'Minified JavaScript bundle with Terser.',
    };
  }

  if (src === 'mdx') {
    const cleaned = source.replace(/^import\s+.*$/gm, '').replace(/^export\s+.*$/gm, '').trim();
    if (dst === 'md') {
      return { output: cleaned + '\n', operationKind: 'transpilation', note: 'Stripped JSX module imports/exports into Markdown.' };
    }
    if (dst === 'html') {
      const html = await marked.parse(cleaned);
      return { output: html, operationKind: 'transpilation', note: 'Compiled MDX prose blocks to HTML.' };
    }
  }

  throw new Error(`Unsupported web asset transpilation: ${src} -> ${dst}`);
}
