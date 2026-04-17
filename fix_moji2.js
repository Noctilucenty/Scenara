// Binary-level fix for emojis whose double-encoding produced FFFD replacement chars
// (text-based replace can't match these since the bad bytes vary between passes)

const fs = require('fs');
const path = 'C:/Users/splk3/OneDrive/Desktop/Scenara/Scenara/scenara-mobile/app/(tabs)/index.tsx';
const buf = fs.readFileSync(path);  // read as binary Buffer

function replaceBytes(buf, search, replace) {
  const parts = [];
  let i = 0, count = 0;
  while (i <= buf.length - search.length) {
    let match = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { match = false; break; }
    }
    if (match) {
      parts.push(buf.slice(0, i)); // everything before
      parts.push(Buffer.from(replace));
      buf = buf.slice(i + search.length); // everything after
      count++;
      i = 0;
    } else {
      i++;
    }
  }
  parts.push(buf);
  return [Buffer.concat(parts), count];
}

let buf2 = buf;
let total = 0;

// 🔥 U+1F525 → bytes F0 9F 94 A5
// Corrupted form in file: c3 b0 c5 b8 ef bf bd c2 9d c2 a5
//  ð    Ÿ    FFFD      U+009D  ¥
const fire_bad  = [0xc3,0xb0,0xc5,0xb8,0xef,0xbf,0xbd,0xc2,0x9d,0xc2,0xa5];
const fire_good = [0xf0,0x9f,0x94,0xa5];
let [b, n] = replaceBytes(buf2, fire_bad, fire_good);
buf2 = b; total += n;
console.log(`🔥 fire emoji: ${n} replacements`);

// 🔒 U+1F512 → bytes F0 9F 94 92
// Corrupted form: c3 b0 c5 b8 ef bf bd c2 9d e2 80 99
//  ð    Ÿ    FFFD      U+009D  '(U+2019)
const lock_bad  = [0xc3,0xb0,0xc5,0xb8,0xef,0xbf,0xbd,0xc2,0x9d,0xe2,0x80,0x99];
const lock_good = [0xf0,0x9f,0x94,0x92];
[b, n] = replaceBytes(buf2, lock_bad, lock_good);
buf2 = b; total += n;
console.log(`🔒 lock emoji: ${n} replacements`);

// 免 U+514D → bytes E5 85 8D
// Corrupted in file: ef bf bd ef bf bd c2 8d (two FFFD + C2 8D)
const free_bad  = [0xef,0xbf,0xbd,0xef,0xbf,0xbd,0xc2,0x8d];
const free_good = [0xe5,0x85,0x8d];
[b, n] = replaceBytes(buf2, free_bad, free_good);
buf2 = b; total += n;
console.log(`免 char: ${n} replacements`);

// 成 U+6210 → bytes E6 88 90
// Corrupted: ef bf bd c2 90 (FFFD + C2 90)
const cheng_bad  = [0xef,0xbf,0xbd,0xc2,0x90];
const cheng_good = [0xe6,0x88,0x90];
[b, n] = replaceBytes(buf2, cheng_bad, cheng_good);
buf2 = b; total += n;
console.log(`成 char: ${n} replacements`);

console.log(`\nTotal: ${total} replacements`);
if (total > 0) {
  fs.writeFileSync(path, buf2);
  console.log('File saved.');
} else {
  console.log('No changes made.');
}
