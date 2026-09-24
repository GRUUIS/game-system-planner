import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const [template, css, model, studio, storage, app, mermaid, example] = await Promise.all([
  read('public/workbench.template.html'), read('public/styles.css'), read('public/model.js'),
  read('public/studio-model.js'), read('public/storage.js'), read('public/app.js'), read('public/vendor/mermaid.min.js'),
  read('examples/签到系统_使用示例.sysplan')
]);
let seed = example;
try { seed = await read('data/project.json'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const seedProject = JSON.parse(seed);
const withoutExports = text => text.replace(/^export /gm, '').replace(/^import .*?;\r?\n/gm, '');
const bundle = '(function(){\n' + withoutExports(model) + '\n' + withoutExports(studio) + '\n' + withoutExports(storage)
  + '\n' + app.replace(/^import .*?;\r?\n/gm, '') + '\n})();';
new vm.Script(bundle, {filename: 'planner-standalone.js'});
new vm.Script(mermaid, {filename: 'mermaid.min.js'});
const inlineScript = text => text.replace(/<\/script/gi, '<\\/script');
const html = template
  .replace('<script src="vendor/mermaid.min.js"></script>', '')
  .replace('<link rel="stylesheet" href="styles.css">', () => '<style>\n' + css + '\n</style>')
  .replace('<script type="module" src="app.js"></script>', () =>
    '<script id="standalone-seed" type="application/json">' + JSON.stringify(seedProject).replace(/</g, '\\u003c') + '</script>\n'
    + '<script>globalThis.__PLANNER_STANDALONE__ = true;</script>\n'
    + '<!-- Mermaid MIT license: public/vendor/LICENSE -->\n<script>' + inlineScript(mermaid) + '</script>\n'
    + '<script>' + inlineScript(bundle) + '</script>');
await writeFile(new URL('index.html', import.meta.url), html, 'utf8');
console.log(`已生成 ${fileURLToPath(new URL('index.html', import.meta.url))}（${(Buffer.byteLength(html)/1024/1024).toFixed(1)} MB）`);
