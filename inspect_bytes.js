const fs = require('fs');
const path = 'C:/Users/splk3/OneDrive/Desktop/Scenara/Scenara/scenara-mobile/app/(tabs)/index.tsx';
const content = fs.readFileSync(path, 'utf8');

// Find each problem area and show surrounding bytes
const patterns = ['ðŸ', '创建', '正在生', 'âŽ', 'âŽ™', 'â€º'];

for (const pat of patterns) {
  const idx = content.indexOf(pat);
  if (idx === -1) { console.log(pat, '-> not found'); continue; }
  const slice = content.slice(idx, idx + 12);
  const bytes = Buffer.from(slice, 'utf8');
  console.log('\nFound:', JSON.stringify(pat), 'at', idx);
  console.log('  chars:', [...slice].map(c => 'U+' + c.codePointAt(0).toString(16).padStart(4,'0') + '(' + c + ')').join(' '));
  console.log('  bytes:', [...bytes].map(b => b.toString(16).padStart(2,'0')).join(' '));
}

// Also find the guest gate emoji
const guestIdx = content.indexOf('ðŸ\u009f') !== -1 ? content.indexOf('ðŸ\u009f') :
                 content.indexOf('ðŸ\u0178') !== -1 ? content.indexOf('ðŸ\u0178') : -1;

// Find all ðŸ occurrences
let pos = 0;
while (true) {
  const i = content.indexOf('ð', pos);
  if (i === -1) break;
  const slice = content.slice(i, i + 8);
  const chars = [...slice];
  if (chars[0] === 'ð') {
    const bytes = Buffer.from(slice, 'utf8');
    console.log('\nð at', i, ':', chars.slice(0,6).map(c => 'U+' + c.codePointAt(0).toString(16).padStart(4,'0')).join(' '));
    console.log('  bytes:', [...bytes].slice(0,12).map(b => b.toString(16).padStart(2,'0')).join(' '));
  }
  pos = i + 1;
  if (pos > 5000000) break;
}
