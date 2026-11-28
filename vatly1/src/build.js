// Build script: parse question bank, pre-render all math with KaTeX (fail on any error),
// inline KaTeX CSS + fonts, and write one self-contained HTML page.
const fs = require('fs');
const path = require('path');
const katex = require('katex');

const DIR = __dirname;
const OUT = process.argv[2] || path.join(DIR, 'out.html');

const CHAPTERS = {
  C1: 'Chương 1 · Động học & động lực học chất điểm',
  C2: 'Chương 2 · Động lực học vật rắn',
  C3: 'Chương 3 · Năng lượng',
  C7: 'Chương 7 · Trường tĩnh điện',
  C8: 'Chương 8 · Vật dẫn – Tụ điện',
  C9: 'Chương 9 · Điện môi',
  C10: 'Chương 10 · Từ trường',
  C11: 'Chương 11 · Cảm ứng điện từ',
  C13: 'Chương 13 · Trường điện từ',
};

const errors = [];

function prepMath(tex) {
  // Vietnamese decimal comma: 2,5 -> 2{,}5 (no extra space)
  tex = tex.replace(/(\d),(?=\d)/g, '$1{,}');
  tex = tex.replace(/·/g, '}{\cdot}\text{');
  // Non-ASCII subscripts -> upright text
  tex = tex.replace(/_\{([^{}]*[^\x00-\x7F][^{}]*)\}/g, '_{\\text{$1}}');
  tex = tex.replace(/_([^\x00-\x7F\s\\{}])/g, '_{\\text{$1}}');
  return tex;
}

function renderMath(tex, display, where) {
  try {
    return katex.renderToString(prepMath(tex), {
      displayMode: display, throwOnError: true, output: 'html', strict: 'ignore',
    });
  } catch (e) {
    errors.push(`${where}: ${e.message}\n   TEX: ${tex}`);
    return '<span style="color:red">[LỖI CÔNG THỨC]</span>';
  }
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(text, where) {
  // tokens: $$...$$ | $...$ | text
  let out = '';
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    out += fmtText(text.slice(last, m.index));
    if (m[1] !== undefined) out += renderMath(m[1], true, where);
    else out += renderMath(m[2], false, where);
    last = re.lastIndex;
  }
  out += fmtText(text.slice(last));
  return out;
}

function fmtText(t) {
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function block(text, where) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('|'));
  let html = '', inList = false;
  for (const l of lines) {
    if (l.startsWith('- ')) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + inline(l.slice(2), where) + '</li>';
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (/^\$\$[\s\S]*\$\$$/.test(l) && l.indexOf('$$', 2) === l.length - 2) {
      html += '<div class="eq">' + renderMath(l.slice(2, -2), true, where) + '</div>';
    } else {
      html += '<p>' + inline(l, where) + '</p>';
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function parseBank(file, prefix) {
  const raw = fs.readFileSync(path.join(DIR, file), 'utf8');
  const parts = raw.split(/^@@ /m).slice(1);
  return parts.map((p, i) => {
    const lines = p.split('\n');
    const [ch, src] = lines[0].split('|').map(s => s.trim());
    if (!CHAPTERS[ch]) throw new Error(`${file} #${i + 1}: bad chapter ${ch}`);
    const f = {};
    let cur = null;
    for (const l of lines.slice(1)) {
      const m = l.match(/^(Q|A|B|C|D|ANS|SOL|TIP|WARN):\s?(.*)$/);
      if (m) { cur = m[1]; f[cur] = m[2]; }
      else if (cur) f[cur] += '\n' + l;
    }
    for (const k of ['Q', 'A', 'B', 'C', 'D', 'ANS', 'SOL'])
      if (!f[k] || !f[k].trim()) throw new Error(`${file} #${i + 1}: missing ${k}`);
    const ans = 'ABCD'.indexOf(f.ANS.trim());
    if (ans < 0) throw new Error(`${file} #${i + 1}: bad ANS`);
    const chosen = f.SOL.match(/chọn \*\*([A-D])\*\*/);
    if (!chosen || chosen[1] !== f.ANS.trim())
      throw new Error(`${file} #${i + 1}: SOL conclusion ${chosen && chosen[1]} != ANS ${f.ANS}`);
    return { prefix, idx: i + 1, ch, src, f: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])), ans };
  });
}

// Deterministic shuffle of options for new questions whose solution only names the
// answer letter in the final "chọn **X**" (so no other letter references break).
function rng(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }
function lettersOutsideMath(sol) {
  const noMath = sol.replace(/\$\$[\s\S]+?\$\$|\$[^$]+?\$/g, ' ').replace(/chọn \*\*[A-D]\*\*/g, ' ');
  return /(^|[^A-Za-zÀ-ỹ])[A-D]([^A-Za-zÀ-ỹ]|$)/.test(noMath);
}

const raw = [...parseBank('q_demo.txt', 'd'), ...parseBank('q_co.txt', 'm'), ...parseBank('q_dien.txt', 'e')];
const rand = rng(20261205);
let shuffled = 0;
const questions = raw.map(r => {
  const where = `${r.prefix}${r.idx}`;
  let opts = ['A', 'B', 'C', 'D'].map(k => r.f[k]);
  let ans = r.ans;
  let sol = r.f.SOL;
  const target = Math.floor(rand() * 4);
  if (r.src === 'new' && !lettersOutsideMath(sol) && target !== ans) {
    // swap correct option into target slot
    [opts[ans], opts[target]] = [opts[target], opts[ans]];
    sol = sol.replace(/chọn \*\*[A-D]\*\*/, `chọn **${'ABCD'[target]}**`);
    ans = target; shuffled++;
  }
  return {
    id: where,
    ch: r.ch,
    src: r.src,
    q: inline(r.f.Q, where + ' Q'),
    o: opts.map((o, i) => inline(o, where + ' ' + 'ABCD'[i])),
    a: ans,
    s: block(sol, where + ' SOL'),
    t: r.f.TIP ? inline(r.f.TIP, where + ' TIP') : '',
    w: r.f.WARN ? inline(r.f.WARN, where + ' WARN') : '',
  };
});

// Formula sheet
const fraw = fs.readFileSync(path.join(DIR, 'formulas.txt'), 'utf8');
const formulas = [];
for (const sec of fraw.split(/^# /m).slice(1)) {
  const lines = sec.split('\n').filter(l => l.trim());
  const [ch, name] = lines[0].split('|').map(s => s.trim());
  formulas.push({
    ch, name,
    items: lines.slice(1).map(l => {
      const [label, f] = l.split('::').map(s => s.trim());
      return { l: esc(label), f: inline(f, 'formula ' + ch + ' ' + label) };
    }),
  });
}

if (errors.length) {
  console.error('KaTeX errors:\n' + errors.join('\n'));
  process.exit(1);
}

// KaTeX CSS with inlined woff2 fonts
const kdir = path.join(DIR, 'node_modules/katex/dist');
let kcss = fs.readFileSync(path.join(kdir, 'katex.min.css'), 'utf8');
kcss = kcss.replace(/src:url\(fonts\/([^)]+?\.woff2)\) format\("woff2"\)(,url\([^)]+\) format\("[^"]+"\))*/g, (m, f) => {
  const b64 = fs.readFileSync(path.join(kdir, 'fonts', f)).toString('base64');
  return `src:url(data:font/woff2;base64,${b64}) format("woff2")`;
});
if (/url\(fonts\//.test(kcss)) { console.error('Unreplaced KaTeX font url'); process.exit(1); }

const counts = {};
for (const q of questions) counts[q.ch] = (counts[q.ch] || 0) + 1;
const ansDist = [0, 0, 0, 0];
for (const q of questions) ansDist[q.a]++;

const data = { chapters: CHAPTERS, questions, formulas };
const tpl = fs.readFileSync(path.join(DIR, 'template.html'), 'utf8');
const html = tpl
  .replace('/*KATEX_CSS*/', () => kcss)
  .replace('/*DATA*/', () => 'const DATA = ' + JSON.stringify(data).replace(/<\/script/gi, '<\\/script') + ';');
fs.writeFileSync(OUT, html);
console.log(`OK: ${questions.length} questions (${questions.filter(q => q.src === 'demo').length} demo), shuffled ${shuffled}`);
console.log('per chapter', counts, 'answer dist A-D', ansDist);
console.log('size', (html.length / 1024).toFixed(0), 'KB ->', OUT);
