import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { ALL_PERCUSSION_ASSETS, VCSL_COMMIT } from '../src/audio/percussionSampleData.ts';

if (!process.argv.includes('--authorized')) throw new Error('Musicca recordings require the necessary permission. Pass --authorized only after obtaining it.');
const folder = join('public', 'audio', 'percussion');

/** Newer CC0 selections: mono 16-bit PCM, trimmed with a 60 ms fade so kits download faster. */
function trimWav(input, maxSeconds) {
  if (input.toString('ascii', 0, 4) !== 'RIFF' || input.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAV file.');
  let offset = 12, format = null, data = null;
  while (offset + 8 <= input.length) {
    const id = input.toString('ascii', offset, offset + 4), size = input.readUInt32LE(offset + 4), body = offset + 8;
    if (id === 'fmt ') {
      format = { code: input.readUInt16LE(body), channels: input.readUInt16LE(body + 2), rate: input.readUInt32LE(body + 4), bits: input.readUInt16LE(body + 14) };
      if (format.code === 0xfffe) format.code = input.readUInt16LE(body + 24);
    }
    if (id === 'data') data = { start: body, size: Math.min(size, input.length - body) };
    offset = body + size + (size & 1);
  }
  if (!format || !data || ![1, 3].includes(format.code) || format.channels < 1) throw new Error('Unsupported WAV encoding.');
  const width = format.bits / 8, frames = Math.floor(data.size / (width * format.channels));
  const read = at => {
    if (format.code === 3 && format.bits === 32) return input.readFloatLE(at);
    if (format.bits === 16) return input.readInt16LE(at) / 32768;
    if (format.bits === 24) return input.readIntLE(at, 3) / 8388608;
    if (format.bits === 32) return input.readInt32LE(at) / 2147483648;
    throw new Error(`Unsupported WAV bit depth: ${format.bits}`);
  };
  const keep = Math.min(frames, Math.round(maxSeconds * format.rate)), fade = Math.min(keep, Math.round(.06 * format.rate));
  const output = Buffer.alloc(44 + keep * 2);
  for (let frame = 0; frame < keep; frame++) {
    let sum = 0;
    for (let channel = 0; channel < format.channels; channel++) sum += read(data.start + (frame * format.channels + channel) * width);
    let value = sum / format.channels;
    if (keep < frames && frame >= keep - fade) value *= .5 + .5 * Math.cos(Math.PI * (frame - (keep - fade)) / fade);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value * 32767))), 44 + frame * 2);
  }
  output.write('RIFF', 0, 'ascii'); output.writeUInt32LE(36 + keep * 2, 4); output.write('WAVEfmt ', 8, 'ascii');
  output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22); output.writeUInt32LE(format.rate, 24);
  output.writeUInt32LE(format.rate * 2, 28); output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34);
  output.write('data', 36, 'ascii'); output.writeUInt32LE(keep * 2, 40);
  return output;
}

const files = [];
for (let i = 0; i < ALL_PERCUSSION_ASSETS.length; i += 4) {
  files.push(...await Promise.all(ALL_PERCUSSION_ASSETS.slice(i, i + 4).map(async asset => {
    const path = join(folder, ...asset.path.split('/'));
    await mkdir(dirname(path), { recursive: true });
    let data;
    try { data = await readFile(path); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`${response.status}: ${asset.url}`);
      data = Buffer.from(await response.arrayBuffer());
      if (data.length < 1000 || data.length > 8 * 1024 * 1024 || data.subarray(0, 80).toString().includes('<html')) throw new Error(`Invalid audio: ${asset.url}`);
      if (asset.maxSeconds) data = trimWav(data, asset.maxSeconds);
      await writeFile(path, data, { flag: 'wx' });
    }
    const { maxSeconds, ...entry } = asset;
    return { ...entry, ...(maxSeconds ? { processing: `Mono 16-bit PCM, at most ${maxSeconds} s with a 60 ms fade when trimmed` } : {}),
      bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  })));
}
const license = await fetch(`https://raw.githubusercontent.com/sgossner/VCSL/${VCSL_COMMIT}/LICENSE`);
if (!license.ok) throw new Error('VCSL license could not be retrieved.');
await writeFile(join(folder, 'VCSL-CC0.txt'), await license.text());
await writeFile(join(folder, 'SOURCE.json'), JSON.stringify({
  sources: [
    { name: 'Musicca', reference: 'https://www.musicca.com/drums', permission: 'Project owner explicitly confirmed permission for percussion reuse on 2026-09-28. Copyright remains with Musicca; this is not a public license.' },
    { name: 'Versilian Community Sample Library', reference: 'https://github.com/sgossner/VCSL', commit: VCSL_COMMIT, license: 'CC0-1.0', licenseFile: 'VCSL-CC0.txt' },
  ],
  notes: 'Selected recorded drum, conga, bongo, cajon, shaker and tambourine sounds, plus VCSL multi-velocity snare, hi-hat, cross-stick and tom hits and claps, cowbell, claves, woodblock and agogo for the drum-groove trainer. No source application code copied. No recorded tabla bank is claimed. No Soundsnap sounds are included.',
  files,
}, null, 2) + '\n');
console.log(`${files.length} percussion recordings ready; ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes.`);
