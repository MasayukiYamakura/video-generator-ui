import assert from 'node:assert/strict';
import {emptyRegistry, resolveConfig} from './builder/model.mjs';
import {TAROT_CARDS} from './builder/tarot-cards.mjs';
import {batchPrompt, batchConfig, compileBatch, importBatch} from './builder/batch.mjs';

const shared=resolveConfig(emptyRegistry(),{video_preset:'tarot_monthly_batch',overrides:{video:{},layout:{}},ai:{}});
const phases=['intro','overall','relationships','work','advice'];
const make=(sign,offset)=>({
  entry:{cards:TAROT_CARDS.slice(offset,offset+4).map(c=>c.id),
    orientations:['upright','reversed','upright','reversed'],
    year:2026,month:10,period:'second',cta:'',sharedCta:'保存して見返してね',
    narration:phases.map(phase=>sign+phase).join('')},
  response:{zodiac:sign,scenes:[...phases.map(phase=>({tarot_phase:phase,text:sign+phase})),
    {tarot_phase:'cta',text:'保存して見返してね'}]},
});
const aries=make('aries',0),taurus=make('taurus',4);
const entries={aries:aries.entry,taurus:taurus.entry}, responses={aries:aries.response,taurus:taurus.response};
for(const sign of Object.keys(responses))responses[sign].cards=batchConfig(shared,sign,entries[sign]).tarot.cards;
const prompt=batchPrompt(shared,[['aries',aries.entry],['taurus',taurus.entry]],null);
assert.match(prompt,/2026年10月後半/);
assert.equal((prompt.match(/【全星座共通ルール】/g)||[]).length,1);
assert.match(prompt,/残り|不足分/);
assert.deepEqual(Object.keys(importBatch(JSON.stringify({videos:Object.values(responses)}),['aries','taurus'])),['aries','taurus']);
assert.deepEqual(Object.keys(importBatch(JSON.stringify({videos:[aries.response]}),['aries','taurus'])),['aries']);
assert.deepEqual(Object.keys(importBatch(JSON.stringify({videos:[aries.response]}),['aries','taurus'],entries)),['aries']);
assert.throws(()=>importBatch(JSON.stringify({videos:[{...aries.response,cards:aries.response.cards.map((c,i)=>i===1?{...c,orientation:'upright'}:c)}]}),['aries'],entries),/正逆/);
assert.throws(()=>importBatch(JSON.stringify({videos:[{...aries.response,cards:undefined}]}),['aries'],entries),/正逆/);
const manifest=compileBatch(shared,entries,responses,['aries','taurus'],null);
assert.equal(manifest.videos.length,2);
assert.equal(manifest.videos[0].script.tarot.zodiac,'aries');
assert.equal(manifest.videos[1].script.tarot.cards[0].card_id,taurus.entry.cards[0]);
assert.equal(manifest.videos[0].script.tarot.cards[1].orientation,'reversed');
assert.match(prompt,/reversed=逆位置/);
assert.equal(manifest.videos[0].script.scenes[0].hook_text,'2026年10月後半\n牡羊座の運勢');
assert.equal(manifest.videos[0].script.scenes.at(-1).text,'保存して見返してね');
assert.deepEqual(compileBatch(shared,entries,responses,['taurus'],null).videos.map(x=>x.zodiac),['taurus']);
assert.throws(()=>compileBatch(shared,entries,{...responses,taurus:aries.response},['taurus'],null),/原稿/);
assert.throws(()=>importBatch(JSON.stringify({videos:[aries.response,aries.response]}),['aries','taurus']),/星座/);
assert.throws(()=>compileBatch(shared,{aries:{...aries.entry,orientations:['sideways','upright','upright','upright']}},responses,['aries'],null),/向き/);
assert.equal(compileBatch(shared,{aries:{...aries.entry,orientations:undefined}},responses,['aries'],null).videos[0].script.tarot.cards[1].orientation,'upright');
console.log('batch compilation, titles, cards, retry subset: OK');
