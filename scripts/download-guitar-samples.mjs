import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

if (!process.argv.includes('--authorized')) throw new Error('Run only with permission to copy these guitar recordings; pass --authorized to acknowledge it.');
const root = join('public', 'audio', 'musicca-guitar');
const banks = ['steel', 'classical', 'electric'];
const ids = [
  'f0', 'f1', 'f2', 'f3', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12', 'f13', 'f14',
  'h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h9', 'g0', 'g1', 'g2', 'g3', 'g4',
  'd0', 'd1', 'd2', 'd3', 'd4', 'd5', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'e0', 'e1', 'e2', 'e3', 'e4', 'e5',
];
const entries = [];
for (const bank of banks) {
  await mkdir(join(root, bank), { recursive: true });
  for (let start = 0; start < ids.length; start += 4) {
    entries.push(...await Promise.all(ids.slice(start, start + 4).map(async id => {
      const url = `https://www.musicca.com/lydfiler/guitar/${bank}/${id}.mp3`;
      const path = join(root, bank, `${id}.mp3`);
      let bytes;
      try { bytes = await readFile(path); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok || !response.headers.get('content-type')?.includes('audio/mpeg')) throw new Error(`Audio unavailable: ${url} (${response.status})`);
        bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length < 1000 || bytes.length > 5 * 1024 * 1024) throw new Error(`Unexpected audio size: ${url}`);
        await writeFile(path, bytes, { flag: 'wx' });
      }
      return { bank, id, url, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    })));
  }
  console.log(`${bank}: ${ids.length} guitar recordings ready`);
}
await writeFile(join(root, 'SOURCE.json'), JSON.stringify({
  source: 'Musicca', referencePage: 'https://www.musicca.com/guitar',
  permission: 'User reported permission and explicitly authorized downloading these guitar recordings on 2026-09-27. No independent verification of redistribution terms; review those terms before publishing.',
  scope: 'Only the three guitar sound banks referenced by the public virtual-guitar player. No Musicca application code, other instruments or account data included.',
  files: entries,
}, null, 2) + '\n');
console.log(`${entries.length} files; ${entries.reduce((sum, entry) => sum + entry.bytes, 0)} bytes. No upload or deployment performed.`);
