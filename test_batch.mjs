import assert from 'node:assert/strict';
import {emptyRegistry, resolveConfig} from './builder/model.mjs';
import {TAROT_CARDS} from './builder/tarot-cards.mjs';
import {batchPrompt, batchConfig, compileBatch, importBatch, importBatchSource, batchSourcePrompt} from './builder/batch.mjs';
import {buildPrompt} from './builder/prompt.mjs';

const shared=resolveConfig(emptyRegistry(),{video_preset:'tarot_monthly_batch',overrides:{video:{},layout:{}},ai:{}});
const phases=['intro','overall','relationships','work','advice'];
const make=(sign,offset)=>({
  entry:{cards:TAROT_CARDS.slice(offset,offset+4).map(c=>c.id),
    orientations:['upright','reversed','upright','reversed'],
    year:2026,month:10,period:'second',cta:'',sharedCta:'保存して見返してね',
    narration:phases.map(phase=>sign+phase).join('')},
  response:{zodiac:sign,scenes:[...phases.map(phase=>({tarot_phase:phase,text:sign+phase,
    ...(['overall','relationships','work','advice'].includes(phase)?{tarot_visual:'scenery',media_type:'pexels',media_query:`${phase} nature`}:{} )})),
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
assert.equal(manifest.videos[0].script.scenes.filter(s=>s.tarot_visual==='scenery').length,4);
assert.throws(()=>compileBatch(shared,entries,{...responses,aries:{...aries.response,scenes:aries.response.scenes.map(s=>s.tarot_phase==='work'?{tarot_phase:'work',text:s.text}:s)}},['aries'],null),/仕事・行動に情景映像/);
assert.match(prompt,/reversed=逆位置/);
assert.match(prompt,/各役割で少なくとも1scene/);
assert.match(buildPrompt(batchConfig(shared,'aries',aries.entry),aries.entry.narration),/各役割で少なくとも1scene/);
assert.equal(manifest.videos[0].script.scenes[0].hook_text,'2026年10月後半\n牡羊座の運勢');
assert.equal(manifest.videos[0].script.scenes.at(-1).text,'保存して見返してね');
assert.deepEqual(compileBatch(shared,entries,responses,['taurus'],null).videos.map(x=>x.zodiac),['taurus']);
assert.throws(()=>compileBatch(shared,entries,{...responses,taurus:aries.response},['taurus'],null),/原稿/);
assert.throws(()=>importBatch(JSON.stringify({videos:[aries.response,aries.response]}),['aries','taurus']),/星座/);
assert.throws(()=>compileBatch(shared,{aries:{...aries.entry,orientations:['sideways','upright','upright','upright']}},responses,['aries'],null),/向き/);
assert.equal(compileBatch(shared,{aries:{...aries.entry,orientations:undefined}},responses,['aries'],null).videos[0].script.tarot.cards[1].orientation,'upright');
console.log('batch compilation, titles, cards, retry subset: OK');

const source={version:1,year:2026,month:10,period:'second',videos:[
  'aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'
].map((zodiac,i)=>({zodiac,cards:TAROT_CARDS.slice(i*4,i*4+4).map((c,j)=>({position:['overall','relationships','work','advice'][j],card_id:c.id,name:c.name,orientation:j===3?'reversed':'upright'})),
  narration:`2026年10月後半の${zodiac}の原稿`,cta:'保存して見返してね'}))};
const imported=importBatchSource(JSON.stringify(source));
assert.equal(Object.keys(imported.entries).length,12);
assert.equal(imported.entries.aries.orientations[3],'reversed');
assert.match(batchSourcePrompt(2026,10,'second'),/major-06-lovers=恋人/);
const sourcePrompt=batchSourcePrompt(2026,10,'second',true,'いちばん気になったカード、コメントで教えてね。');
assert.match(sourcePrompt,/ライダー版タロット78枚/);
assert.match(sourcePrompt,/約250〜300字/);
assert.match(sourcePrompt,/2026年10月後半/);
assert.match(sourcePrompt,/共通CTA文は「いちばん気になったカード、コメントで教えてね。」/);
assert.match(sourcePrompt,/各videoのctaは空文字/);
assert.ok(sourcePrompt.includes('\n\n'));
assert.throws(()=>importBatchSource(JSON.stringify({...source,videos:source.videos.slice(1)})),/12星座/);
assert.throws(()=>importBatchSource(JSON.stringify({...source,videos:[source.videos[0],...source.videos.slice(1,11),source.videos[0]]})),/重複/);
assert.throws(()=>importBatchSource(JSON.stringify({...source,videos:source.videos.map((v,i)=>i? v:{...v,cards:v.cards.map((c,j)=>j?c:{...c,name:'恋人たち'})})})),/正式|ではなく/);

