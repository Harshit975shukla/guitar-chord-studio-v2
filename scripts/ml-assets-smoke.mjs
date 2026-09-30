import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const path='public/ml/basic-pitch-1.0.1-tfjs-3.21.0/';
const source=JSON.parse(readFileSync(path+'SOURCE.json'));
assert.equal(source.model,'@spotify/basic-pitch@1.0.1');
for(const asset of source.assets){
  const file=readFileSync(path+asset.file);
  assert.equal(file.length,asset.bytes,asset.file);
  assert.equal(createHash('sha256').update(file).digest('hex'),asset.sha256,asset.file);
}
const model=JSON.parse(readFileSync(path+'model.json'));
assert.ok(model.weightsManifest.every(group=>group.paths.every(p=>source.assets.some(asset=>asset.file===p))));
assert.equal(model.signature.inputs.input_2.tensorShape.dim[1].size,'43844');
assert.match(readFileSync(path+'LICENSE-basic-pitch.txt','utf8'),/Apache License/);
console.log(`PASS ${source.assets.length} pinned model/WASM/licence assets verified`);
