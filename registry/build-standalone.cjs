/* Produce a portable, offline HTML without changing the working application.
 * Run: node registry/build-standalone.cjs [output.html]
 * Uses only Node built-ins. Explicit adapters fail on unexpected source changes
 * instead of silently shipping broken dynamic icons. No DOM/network interceptors.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = __dirname;
const output = path.resolve(process.argv[2] || path.join(root, '..', 'Sber-BPM-Registry-Standalone.html'));
if (output === path.join(root, 'index.html')) throw new Error('Do not overwrite the working index.html');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const mime = {'.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff'};
const assets = Object.create(null);
function collect(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const key = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collect(key);
    else if (mime[path.extname(entry.name)]) assets[key] = `data:${mime[path.extname(entry.name)]};base64,${fs.readFileSync(path.join(root,key)).toString('base64')}`;
  }
}
collect('assets');
function embedded(key) {
  if (!Object.hasOwn(assets,key)) throw new Error(`Asset not embedded: ${key}`);
  return assets[key];
}
const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeScript = source => source.replace(/<\/script/gi,'<\\/script');
const safeJSON = value => JSON.stringify(value).replace(/</g,'\\u003c');
function replaceOnce(source, before, after, file) {
  if (source.split(before).length !== 2) throw new Error(`Expected exactly one adapter match in ${file}: ${before}`);
  return source.replace(before,()=>after);
}

// These paths include template expressions. Resolve them before HTML is inserted
// or image.src is assigned, so there is never a request for an adjacent assets/.
const adapters = {
  'app.js': [
    ['src="assets/${esc(name)}.svg"','src="${window.BPMEmbeddedAsset(`assets/${name}.svg`)}"'],
    [".src=`assets/${collapsed&&!peek&&innerWidth>=768?'menu-right':'collapse-menu'}.svg`", ".src=window.BPMEmbeddedAsset(`assets/${collapsed&&!peek&&innerWidth>=768?'menu-right':'collapse-menu'}.svg`)"],
    [".src=`assets/chevron-${open?'up':'down'}.svg`", ".src=window.BPMEmbeddedAsset(`assets/chevron-${open?'up':'down'}.svg`)"],
  ],
  'calendar.js': [['src="assets/${name}.svg"','src="${window.BPMEmbeddedAsset(`assets/${name}.svg`)}"']],
  'structure.js': [['src="assets/${name}.svg"','src="${window.BPMEmbeddedAsset(`assets/${name}.svg`)}"']],
  'structure-incoming.js': [['src="assets/${name}.svg"','src="${window.BPMEmbeddedAsset(`assets/${name}.svg`)}"']],
  'tasks.js': [['src="${base}/${name}.svg"','src="${window.BPMEmbeddedAsset(`${base}/${name}.svg`)}"']],
  'task-visuals.js': [['const asset = name => `assets/tasks/${name}.svg`;','const asset = name => window.BPMEmbeddedAsset(`assets/tasks/${name}.svg`);']],
  'journey-details.js': [['src="assets/journey-details/${name}.svg"','src="${window.BPMEmbeddedAsset(`assets/journey-details/${name}.svg`)}"']],
  'journey-supplement.js': [
    ['src="${assets}supplement-${key}.png"','src="${window.BPMEmbeddedAsset(`${assets}supplement-${key}.png`)}"'],
    ['src="${assets}supplement-lightning.svg"','src="${window.BPMEmbeddedAsset(`${assets}supplement-lightning.svg`)}"'],
  ],
  'process-drawer.js': [['window.BpmProcessAssets?.[name] || `assets/${name}.svg`','window.BpmProcessAssets?.[name] || window.BPMEmbeddedAsset(`assets/${name}.svg`)']],
};
function script(file) {
  let source = read(file);
  for (const [before,after] of adapters[file] || []) source = replaceOnce(source,before,after,file);
  // Handles literal asset-map values and literal URLs inside HTML templates.
  source = source.replace(/(['"])(assets\/[\w./-]+\.(?:svg|png|jpg|jpeg|webp|woff2?))\1/g,(_match,quote,key)=>quote+embedded(key)+quote);
  new vm.Script(source,{filename:file});
  return `<script data-bpm-source="${escapeHTML(file)}">\n${safeScript(source)}\n</script>`;
}
function stylesheet(file) {
  const css = read(file).replace(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/g,(_match,_quote,url)=>{
    if (/^(?:data:|#)/.test(url)) return `url("${url}")`;
    return `url("${embedded(path.posix.normalize(path.posix.join(path.posix.dirname(file),url)))}")`;
  });
  if (/@import\b/i.test(css)) throw new Error(`Unresolved CSS import in ${file}`);
  return `<style data-bpm-source="${escapeHTML(file)}">\n${css.replace(/<\/style/gi,'<\\/style')}\n</style>`;
}

let html = read('index.html');
const scripts = [], styles = [];
html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*>/g,(_tag,file)=>{styles.push(file);return stylesheet(file);});
html = html.replace(/<script\s+src="([^"]+)"\s+defer><\/script>/g,(_tag,file)=>{scripts.push(file);return '';});
if (!styles.length || !scripts.length) throw new Error('No application styles/scripts found');
for (const file of Object.keys(adapters)) if (!scripts.includes(file)) throw new Error(`Unused adapter: ${file}`);
html = html.replace(/\b(src|href)="(assets\/[^"]+)"/g,(_match,attribute,key)=>`${attribute}="${embedded(key)}"`);
html = replaceOnce(html,'href="./index.html"','href="#main" data-bpm-home', 'index.html');
html = replaceOnce(html,'href="STRUCTURE-SOURCES.md" target="_blank" rel="noopener"','href="#bpm-standalone-sources" data-bpm-sources', 'index.html');
if (/<script[^>]+\bsrc=|<link[^>]+rel="stylesheet"/i.test(html)) throw new Error('Unresolved external script/stylesheet');

const resources = `<script data-bpm-source="embedded-assets">\n(() => {\nconst assets = Object.freeze(${safeJSON(assets)});\nwindow.BPMEmbeddedAsset = key => {\nif (!Object.prototype.hasOwnProperty.call(assets,key)) throw new Error('Missing embedded BPM asset: '+key);\nreturn assets[key];\n};\n})();\n</script>`;
const documentation = `<dialog id="bpm-standalone-sources" class="modal" aria-labelledby="bpm-standalone-sources-title" style="width:min(960px,calc(100vw - 32px));max-height:85dvh;overflow:auto"><div class="modal-heading"><h2 id="bpm-standalone-sources-title">Источник и правила</h2><form method="dialog"><button class="button secondary-button" autofocus>Закрыть</button></form></div><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:13px;line-height:20px">${escapeHTML(read('STRUCTURE-SOURCES.md'))}</pre></dialog>`;
const navigation = `<script data-bpm-source="standalone-navigation">\n(() => {\n// Brand reloads this document, even after the standalone file is renamed.\ndocument.querySelector('[data-bpm-home]').addEventListener('click',event=>{event.preventDefault();location.replace(location.href.split('#')[0]);});\nconst link=document.querySelector('[data-bpm-sources]'), dialog=document.getElementById('bpm-standalone-sources');\nlink.addEventListener('click',event=>{event.preventDefault();dialog.showModal();});\ndialog.addEventListener('close',()=>link.focus({preventScroll:true}));\n})();\n</script>`;
html = html.replace('</body>',`${documentation}\n${resources}\n${scripts.map(script).join('\n')}\n${navigation}\n</body>`);
html = html.replace('<html lang="ru">','<html lang="ru" data-bpm-standalone="true">');
fs.writeFileSync(output,html);
console.log(JSON.stringify({output,bytes:Buffer.byteLength(html),styles:styles.length,scripts:scripts.length,assets:Object.keys(assets).length},null,2));
