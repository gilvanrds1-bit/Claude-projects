#!/usr/bin/env node
/* ------------------------------------------------------------------
   Build the portable single-file version of the app.

   Everything — markup, stylesheet and all six scripts — is folded into
   one .html file you can email to a colleague or drop on a share.

   The one thing that cannot travel inside a single file is the text
   recognition engine (a worker plus 10MB of WebAssembly and language
   data, which the browser has to fetch as separate files). The single
   file build points at the jsDelivr copy instead, so photo capture
   needs the machine to be online; everything else works offline. Serve
   the folder as it is, or open index.html, if you want recognition with
   no network at all.

     node build.js                 -> dist/service-desk-standalone.html
     node build.js --out <path>    -> write somewhere else
     node build.js --fragment      -> omit <!doctype>/<html>/<head>/<body>
   ------------------------------------------------------------------ */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const outIdx = args.indexOf('--out');
const outPath = outIdx !== -1 && args[outIdx + 1]
  ? path.resolve(args[outIdx + 1])
  : path.join(root, 'dist', 'service-desk-standalone.html');

const CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/* Guard against a script that would close its own tag when inlined. */
function inlineSafe(js, name) {
  if (/<\/script/i.test(js)) throw new Error(`${name} contains a closing script tag and cannot be inlined`);
  return js;
}

/* Always replace via a function: source containing $' or $& would
   otherwise be read as a substitution pattern rather than as text. */
function swap(haystack, needle, replacement, what) {
  if (haystack.indexOf(needle) === -1) throw new Error(`could not find ${what} in index.html`);
  return haystack.replace(needle, () => replacement);
}

let html = read('index.html');

html = swap(html,
  '<link rel="stylesheet" href="assets/css/app.css">',
  '<style>\n' + read('assets/css/app.css').trim() + '\n</style>',
  'the stylesheet link');

html = swap(html,
  '<script src="vendor/tesseract/tesseract.min.js"></script>',
  `<script>window.SDP_SINGLE_FILE = true;</script>\n<script src="${CDN}"></script>`,
  'the recognition engine script');

/* The vendored worker, core and language data are no longer beside the
   page, so let Tesseract fall back to its own CDN defaults. */
let ocr = read('assets/js/ocr.js').replace(
  /\n\s*workerPath:.*\n\s*corePath:.*\n\s*langPath:.*\n\s*gzip: true,/,
  ''
);

const scripts = {
  'assets/js/config.js':    read('assets/js/config.js'),
  'assets/js/store.js':     read('assets/js/store.js'),
  'assets/js/charts.js':    read('assets/js/charts.js'),
  'assets/js/ocr.js':       ocr,
  'assets/js/dashboard.js': read('assets/js/dashboard.js'),
  'assets/js/app.js':       read('assets/js/app.js')
};

Object.keys(scripts).forEach(src => {
  html = swap(html,
    `<script src="${src}"></script>`,
    '<script>\n' + inlineSafe(scripts[src], src).trim() + '\n</script>',
    src);
});

/* The Artifact host supplies <!doctype>, <head> and <body> itself, so
   that variant ships the title, the styles and the markup alone. */
if (fragment) {
  html = html
    .replace(/^[\s\S]*?(?=<title>)/, '')
    .replace(/^<meta .*$/gm, '')
    .replace(/^<link rel="icon".*$/gm, '')
    .replace(/\s*<\/head>\s*<body>\s*/, '\n\n')
    .replace(/\s*<\/body>\s*<\/html>\s*$/, '\n')
    .replace(/\n{3,}/g, '\n\n')
    /* the gallery lists this by name, so drop the tagline from the title */
    .replace(/<title>[^<]*<\/title>/, '<title>Service Desk Intelligence</title>');
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);

const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
console.log(`${path.relative(process.cwd(), outPath)}  (${kb} KB)`);
