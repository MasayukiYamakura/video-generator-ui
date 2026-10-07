import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {emptyRegistry,resolvePreset,resolveConfig,savePreset,validateRegistry} from './builder/model.mjs';
import {VIDEO_PRESETS} from './builder/presets.mjs';
import {applyConfig,fixedSettings} from './builder/compiler.mjs';
import {buildPrompt} from './builder/prompt.mjs';
import {readRegistry,writeRegistry,encodeContent,decodeContent} from './builder/storage.mjs';

const registry=emptyRegistry();
const session=(overrides={},extra={})=>({video_preset:'tiktok_standard',layout_preset:'portrait_standard',overrides,...extra});
const config=(ov={},extra={})=>resolveConfig(registry,session(ov,extra));
const content={scenes:[{text:'自分の人生を選ぶ',hook_text:'人生を選ぶ'},{text:'自分のことを知る'}]};
const music={version:1,tracks:[{id:'calm_01',title:'静かな曲',categories:['calm']},{id:'serious_01',title:'注意喚起',categories:['serious']}]};
test('all four built-in presets and matching default layouts load',()=>{
  for(const p of VIDEO_PRESETS){const v=resolvePreset(registry,'video',p.id);const c=resolveConfig(registry,{video_preset:p.id,layout_preset:v.default_layout});assert.ok(c.width);}
});
test('anonymous preset inherits layout and only overrides voice',()=>{
  const v=resolvePreset(registry,'video','tiktok_anonymous');assert.equal(v.default_layout,'portrait_standard');
  const original=fixedSettings(config()),anonymous=fixedSettings(config({}, {video_preset:'tiktok_anonymous'}));
  delete anonymous.voice_processing;anonymous.voice_mode='original';assert.deepEqual(original,anonymous);
});
test('layout values beat defaults, overrides beat presets without mutation',()=>{
  const original=JSON.stringify(VIDEO_PRESETS);
  const r=savePreset(registry,'layout',{id:'top',name:'上に移動',extends:'portrait_standard',format:'vertical',values:{tag_y:200}});
  const s=session({layout:{tag_y:160},video:{voice_mode:'anonymous'}},{layout_preset:'top'});
  const c=resolveConfig(r,s);assert.equal(c.layout.tag_y,160);assert.equal(c.layout.tag_x,100);assert.equal(c.video.voice_mode,'anonymous');
  assert.equal(JSON.stringify(VIDEO_PRESETS),original);assert.deepEqual(registry,emptyRegistry());
});
test('BGM off/category/track/AI and original/anonymous are independent switches',()=>{
  for(const voice of ['original','anonymous'])for(const mode of ['off','category','track','ai']){
    const c=config({video:{voice_mode:voice,bgm_mode:mode,bgm_category:'calm',bgm_track:'calm_01'}});
    const result=applyConfig({...content,bgm_category:'serious'},c,music);
    assert.equal(result.global_settings.voice_mode,voice);assert.equal(result.global_settings.bgm.enabled,mode!=='off');
    assert.equal(result.global_settings.bgm.loop,false);
    if(mode==='category')assert.equal(result.global_settings.bgm.category,'calm');
    if(mode==='ai')assert.equal(result.global_settings.bgm.category,'serious');
    if(mode==='track')assert.equal(result.global_settings.bgm.track_id,'calm_01');
  }
});
test('unknown BGM and AI categories fail without fallback',()=>{
  assert.throws(()=>applyConfig(content,config({video:{bgm_mode:'ai'}}),music));
  assert.throws(()=>applyConfig({...content,bgm_category:'fake'},config({video:{bgm_mode:'ai'}}),music));
  assert.throws(()=>applyConfig(content,config({video:{bgm_mode:'track',bgm_track:'missing'}}),music));
});
test('horizontal/vertical/off hooks and intro/body flags compile exactly',()=>{
  for(const orientation of ['horizontal','vertical'])for(const on of [true,false])for(const flag of [true,false]){
    const c=config({video:{hook_orientation:orientation,hook_enabled:on,intro_tags:flag,body_tags:!flag,intro_visualizer:flag,body_visualizer:!flag}});
    const result=applyConfig(content,c);
    assert.equal(result.global_settings.hook.orientation,orientation);assert.equal(result.global_settings.hook.enabled,on);
    assert.equal(result.scenes[0].category_tags,flag);assert.equal(result.scenes[1].category_tags,!flag);
    assert.equal(result.scenes[0].visualizer,flag);assert.equal(result.scenes[1].visualizer,!flag);
    assert.equal(Object.hasOwn(result.scenes[0],'hook_text'),on);assert.equal(Object.hasOwn(result.scenes[1],'hook_text'),false);
  }
});
test('AI cannot override renderer settings or per-scene style/layout/timing',()=>{
  const bad={global_settings:{format:'landscape',voice_mode:'anonymous',hook:{enabled:false},brand_layout:{tag_x:9999}},
    scenes:[{text:'人生を選ぶ',hook_text:'人生',category_tags:true,visualizer:true,caption_enabled:true,layout:'vertical',text_style:{font_size:1},start_time:0,end_time:1}]};
  const r=applyConfig(bad,config({layout:{tag_x:70}}));
  assert.equal(r.global_settings.format,'vertical');assert.equal(r.global_settings.voice_mode,'original');assert.equal(r.global_settings.brand_layout.tag_x,70);
  assert.equal(r.scenes[0].category_tags,false);assert.equal(r.scenes[0].caption_enabled,false);
  for(const key of ['layout','text_style','start_time','end_time'])assert.equal(Object.hasOwn(r.scenes[0],key),false);
});
test('manual hooks and queries win over AI content including line breaks',()=>{
  const c=config({video:{background_mode:'stock'}},{ai:{hook:'manual',manual_hook:'私の\n人生',search:'manual',search_text:'calm ocean'}});
  const r=applyConfig(content,c);assert.equal(r.scenes[0].hook_text,'私の\n人生');assert.equal(r.scenes[1].media_query,'calm ocean');
});
test('manual stock scene selection and fixed image strip AI stock choices',()=>{
  const scenes=[{...content.scenes[0],media_type:'pexels',media_query:'sea'},{...content.scenes[1],media_type:'pexels',media_query:'forest'}];
  const c=config({}, {ai:{stock_scenes:'manual',stock_indices:'2'}});
  const r=applyConfig({scenes},c);assert.equal(r.scenes[0].media_type,undefined);assert.equal(r.scenes[1].media_query,'forest');
  const fixed=applyConfig({scenes},config({video:{background_mode:'fixed'}}));assert.ok(fixed.scenes.every(s=>!s.media_type));
});
test('manual stock index bounds and scene types are validated',()=>{
  assert.throws(()=>applyConfig(content,config({}, {ai:{stock_scenes:'manual',stock_indices:'3'}})));
  assert.throws(()=>applyConfig({scenes:[{text:42}]},config()));
  assert.throws(()=>applyConfig({scenes:[]},config()));
});
test('legacy local presenter segment with explicit timing is retained',()=>{
  const source={scenes:[{text:'',media_type:'local',media_query:'presenter.mp4',start_time:0,end_time:2}]};
  const r=applyConfig(source,config());assert.equal(r.scenes[0].end_time,2);assert.equal(r.scenes[0].caption_enabled,false);
});
test('invalid combinations, numeric values and schema keys fail explicitly',()=>{
  for(const ov of [{video:{format:'landscape'}},{video:{voice_mode:'tts'}},{video:{intro_scenes:0}},
    {layout:{tag_x:1081}},{layout:{visualizer_size:-1}},{layout:{hook_band_opacity:2}},
    {video:{bgm_mode:'category',bgm_category:'ai'}},{layout:{unknown:1}},{video:{fps:60}}])assert.throws(()=>config(ov));
  assert.throws(()=>config({}, {layout_preset:'landscape_standard'}));
  assert.throws(()=>resolveConfig(registry,{video_preset:'youtube_landscape',overrides:{video:{body_tags:true}}}));
  assert.throws(()=>config({}, {background:'../image.png'}));
});
test('video and layout save/reload are independent and retain inheritance',()=>{
  let r=savePreset(registry,'video',{id:'calm_video',name:'BGM用',extends:'tiktok_standard',values:{bgm_mode:'category',bgm_category:'calm'}});
  r=savePreset(r,'layout',{id:'male_layout',name:'人物位置',extends:'portrait_standard',format:'vertical',values:{tag_x:12,visualizer_y:500}});
  const reloaded=decodeContent({content:encodeContent(r)});validateRegistry(reloaded);
  const c=resolveConfig(reloaded,{video_preset:'calm_video',layout_preset:'male_layout'});assert.equal(c.layout.tag_x,12);assert.equal(c.video.bgm_category,'calm');
  assert.throws(()=>savePreset(r,'video',{id:'calm_video',name:'重複',values:{}}));
  assert.throws(()=>savePreset(r,'video',{id:'tiktok_standard',name:'組込上書き',values:{}}));
});
test('registry rejects cyclic, missing parents and geometry in video presets',()=>{
  for(const values of [ [{id:'x',name:'x',extends:'x',values:{}}], [{id:'x',name:'x',extends:'missing',values:{}}], [{id:'x',name:'x',values:{tag_x:20}}] ])assert.throws(()=>validateRegistry({...registry,video_presets:values}));
});
test('background model links to a reusable recommended layout',()=>{
  const r={...registry,backgrounds:[{id:'male',name:'人物A',file:'male.png',recommended_layout:'portrait_standard'}]};assert.equal(validateRegistry(r).backgrounds[0].recommended_layout,'portrait_standard');
});
test('prompt combines shared rules with settings and only permitted AI slots',()=>{
  const p=buildPrompt(config({video:{voice_mode:'anonymous',bgm_mode:'ai'}}),'自分の人生を選ぶ',music);
  for(const text of ['【共通ルール】','【動画設定】','【AI判断ルール】','【JSON出力ルール】','"voice_mode": "anonymous"','"band_opacity": 0.58','calm / serious','自分の人生を選ぶ'])assert.ok(p.includes(text));
  assert.ok(buildPrompt(config(),'台本',music,'content').includes('global_settingsは返さない'));
  assert.throws(()=>buildPrompt(config({video:{bgm_mode:'ai'}})));
});
test('YouTube theme title is the only AI theme slot',()=>{
  const c=resolveConfig(registry,{video_preset:'youtube_landscape'});
  const r=applyConfig({...content,theme_title:'テーマ',scenes:content.scenes.map(s=>({...s,media_query:'sea'}))},c);
  assert.equal(r.global_settings.theme.title,'テーマ');assert.equal(r.global_settings.theme.subtitle,'ハシモトの占いと思想');assert.equal(r.scenes[0].hook_text,undefined);
});
test('BGM volume and ducking are human settings and survive save/reload',()=>{
  const saved=savePreset(registry,'video',{id:'audible_music',name:'BGM調整',extends:'tiktok_standard',values:{bgm_mode:'track',bgm_track:'calm_01',bgm_volume_db:6,bgm_ducking:false}});
  const c=resolveConfig(JSON.parse(JSON.stringify(saved)),{video_preset:'audible_music'});
  const r=applyConfig({...content,global_settings:{bgm:{volume_db:-30,ducking:true}}},c,music);
  assert.equal(r.global_settings.bgm.volume_db,6);assert.equal(r.global_settings.bgm.ducking,false);
  const override=resolveConfig(saved,{video_preset:'audible_music',overrides:{video:{bgm_volume_db:2,bgm_ducking:true}}});
  assert.equal(fixedSettings(override).bgm.volume_db,2);assert.equal(fixedSettings(override).bgm.ducking,true);
  assert.equal(fixedSettings(config()).bgm.volume_db,0);assert.equal(fixedSettings(config()).bgm.ducking,true);
  for(const bgm_volume_db of [-31,7,NaN,'6'])assert.throws(()=>config({video:{bgm_volume_db}}));
  assert.throws(()=>config({video:{bgm_ducking:'false'}}));
});
test('title instructions preserve hook_text newlines and manual title wins over extraction',()=>{
  const title='今幸せじゃないよって\n言う女性\n孤独を受け入れて\nみてください';
  const c=config({}, {ai:{hook:'manual',manual_hook:title}});
  const p=buildPrompt(c,'録音の文章',music);
  assert.ok(p.includes(JSON.stringify(title)));
  for(const rule of ['hook_textは冒頭タイトルの表示用','textだけに入れてはいけない','文字数目安より手動指定を優先','出力前に確認'])assert.ok(p.includes(rule));
  assert.ok(!p.includes('hook_textは同じシーンのtextから抜き出し、言い換え禁止'));
  assert.ok(p.includes('改行エスケープ \\n'));
  const r=applyConfig(content,c,music);
  assert.equal(JSON.parse(JSON.stringify(r)).scenes[0].hook_text,title);
  assert.equal(r.scenes[0].text,content.scenes[0].text);
  const ai=buildPrompt(config(),'台本と指定タイトル',music);
  assert.ok(ai.includes('指定がない場合だけ'));assert.ok(ai.includes('hook_textに完全一致'));
});
test('repository roundtrip uses SHA guard, private repo and no auto retry',async()=>{
  let value=emptyRegistry(),head='a',writes=0;
  const api=async(path,method,body)=>{
    if(path==='')return {private:true};
    if(method==='PUT'){assert.equal(body.sha,head);value=decodeContent({content:body.content});head='b';writes++;return {content:{sha:head}};}
    return {content:encodeContent(value),sha:head};
  };
  const first=await readRegistry(api);const next=savePreset(first.registry,'video',{id:'mine',name:'自分用',extends:'tiktok_standard',values:{voice_mode:'anonymous'}});
  const saved=await writeRegistry(api,next,first.sha);assert.equal(saved.sha,'b');assert.equal((await readRegistry(api)).registry.video_presets[0].id,'mine');
  await assert.rejects(()=>writeRegistry(api,next,'a'),/他の端末/);assert.equal(writes,1);
  await assert.rejects(()=>writeRegistry(async()=>({private:false}),next,'b'),/非公開/);
});
test('missing registry is supported but auth/network failures are surfaced',async()=>{
  assert.deepEqual((await readRegistry(async()=>{throw Object.assign(Error('not found'),{status:404});})).registry,emptyRegistry());
  await assert.rejects(()=>readRegistry(async()=>{throw Object.assign(Error('unauthorized'),{status:401});}),/unauthorized/);
});
const mediaPath=new URL('../../media/script.json',import.meta.url);
// The public UI intentionally contains no private media fixture. Run this
// compatibility assertion only from video-generator's tools/pages-ui copy.
test('the existing media/script.json remains byte-for-byte unchanged by compilation',{skip:!existsSync(mediaPath)},()=>{
  const path=mediaPath,before=readFileSync(path,'utf8');const source=JSON.parse(before);
  applyConfig(source,config());assert.equal(readFileSync(path,'utf8'),before);assert.deepEqual(JSON.parse(before),source);
});
