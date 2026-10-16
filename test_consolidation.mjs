import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyRegistry,catalog,resolveConfig,resolvePreset,migrateRegistry} from './builder/model.mjs';
import {applyConfig} from './builder/compiler.mjs';
import {isBatch,visiblePreset} from './builder/modes.mjs';
import {TAROT_CARDS} from './builder/tarot-cards.mjs';
import {compileBatch} from './builder/batch.mjs';

test('three visible families retain exact legacy vertical rendering and saved preset references',()=>{
 const r=emptyRegistry();
 assert.deepEqual(catalog(r,'video').map(p=>p.id),['tiktok_standard','tarot_monthly_remotion','youtube_landscape']);
 const c=resolveConfig(r,{video_preset:'tiktok_vertical_hook'});
 assert.equal(c.video.template,'standard');assert.equal(c.video.background_mode,'stock');
 assert.equal(c.video.hook_orientation,'vertical');assert.equal(c.layout.caption_center_y,1420);
 assert.equal(c.video.body_tags,false);assert.equal(c.video.body_visualizer,false);
 assert.equal(visiblePreset('tiktok_vertical_hook'),'tiktok_standard');
 assert.equal(isBatch(resolveConfig(r,{video_preset:'tarot_monthly_batch'}).video),true);
 assert.equal(resolvePreset(r,'video','tarot_monthly_remotion').extends,undefined);
});
test('retiring presets materializes custom descendants and keeps standard settings',()=>{
 const r=emptyRegistry();r.video_presets=[
  {id:'tiktok_anonymous',name:'旧匿名',extends:'tiktok_standard',values:{voice_mode:'anonymous',bgm_volume_db:2},layout:{hook_font_size:250}},
  {id:'mine',name:'利用中',extends:'tiktok_anonymous',values:{tts_voice:'male_a'}},
  {id:'child',name:'派生',extends:'mine',values:{}},
 ];
 const before=resolveConfig(r,{video_preset:'child'}), migrated=migrateRegistry(r);
 assert.deepEqual(resolveConfig(migrated,{video_preset:'child'}),before);
 assert.ok(!migrated.video_presets.some(p=>p.id==='tiktok_anonymous'));
 assert.equal(resolveConfig(migrated,{video_preset:'tiktok_standard'}).video.voice_mode,'original');
 assert.deepEqual(migrateRegistry(migrated),migrated);
});
test('single Remotion tarot compiles all three audio modes; uploaded audio never enters batch',()=>{
 const tarot={year:2026,month:10,period:'second',zodiac:'taurus',cards:['overall','relationships','work','advice'].map((position,i)=>({position,card_id:TAROT_CARDS[i].id,orientation:'upright'}))};
 const scenes=['intro','overall','relationships','work','advice'].map(tarot_phase=>({tarot_phase,text:tarot_phase,...(tarot_phase==='intro'?{}:{tarot_visual:'scenery',media_type:'pexels',media_query:'ocean'})}));
 for(const voice_mode of ['original','anonymous','tts']){
  const c=resolveConfig(emptyRegistry(),{video_preset:'tarot_monthly_remotion',overrides:{video:{voice_mode}}});c.tarot=tarot;
  const script=applyConfig({audio_file:'recording.m4a',scenes},c);
  assert.equal(script.global_settings.tarot_renderer,'remotion');assert.equal(script.global_settings.voice_mode,voice_mode);
  assert.equal(Boolean(script.audio_file),voice_mode!=='tts');assert.equal(Boolean(script.global_settings.voice_processing),voice_mode==='anonymous');
 }
 const c=resolveConfig(emptyRegistry(),{video_preset:'tarot_monthly_batch',overrides:{video:{voice_mode:'original'}}});
 assert.throws(()=>compileBatch(c,{}, {},['taurus']),/AI読み上げ/);
});
