// Comprehensive string-level fix for index.tsx
// Fixes garbled/mojibake characters and wrong Chinese chars
const fs = require('fs');
const path = 'C:/Users/splk3/OneDrive/Desktop/Scenara/Scenara/scenara-mobile/app/(tabs)/index.tsx';
let content = fs.readFileSync(path, 'utf8');
let changes = [];

function replaceAll(from, to, label) {
  const count = content.split(from).length - 1;
  if (count > 0) {
    content = content.split(from).join(to);
    changes.push(`  [${count}x] ${label || JSON.stringify(from)} → ${JSON.stringify(to)}`);
  } else {
    console.log(`  MISS: ${label || JSON.stringify(from)}`);
  }
}

// ── Activity ticker time labels ─────────────────────────────────────
replaceAll('\u79d2\u514d', '\u79d2\u524d', '秒免 → 秒前');
replaceAll('\u5206\u514d', '\u5206\u949f\u524d', '分免 → 分钟前');
// garbled 小时前: å(U+00E5) °(U+00B0) FFFD(U+FFFD) U+008F 时(U+65F6) 免(U+514D) → 小时前
replaceAll('\u00e5\u00b0\ufffd\u008f\u65f6\u514d', '\u5c0f\u65f6\u524d', 'garbled-小时前 → 小时前');

// ── ⚡ lightning bolt emoji (U+00E2 U+0161 U+00A1 = âš¡) ─────────────
replaceAll('\u00e2\u0161\u00a1', '\u26a1', 'âš¡ → ⚡');

// ── → arrow (U+00E2 U+2020 U+2019 = â†') ────────────────────────────
replaceAll('\u00e2\u2020\u2019', '\u2192', 'â†\u2019 → →');

// ── 余额 balance (U+FFFD U+FFFD U+009D after 余) ─────────────────────
replaceAll('\u4f59\ufffd\ufffd\u009d', '\u4f59\u989d', '余-garbled → 余额');

// ── 今日成交量 (U+FFFD U+008F after 成交) ─────────────────────────────
replaceAll('\u4ea4\ufffd\u008f', '\u4ea4\u91cf', '成交-garbled → 成交量');

// ── em dash garbled (U+00E2 U+20AC U+FFFD U+009D = â€"garbled) ──────
replaceAll('\u00e2\u20ac\ufffd\u009d', '\u2014', 'garbled-em-dash → —');

console.log('Changes made:');
changes.forEach(c => console.log(c));
console.log(`\nTotal change types: ${changes.length}`);
if (changes.length > 0) {
  fs.writeFileSync(path, content, 'utf8');
  console.log('File saved.');
} else {
  console.log('No changes.');
}
