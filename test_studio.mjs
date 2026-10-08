import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerBgm,validateRegistration} from './studio-features.mjs';
import {emptyRegistry,resolveConfig,defaultLayout,savePreset} from './builder/model.mjs';
import {fixedSettings} from './builder/compiler.mjs';
const fields={id:'new_track',title:'New',artist:'Artist',source_url:'https://example.com',license:'CC0',categories:['calm','hopeful'],commercial_use_confirmed:true,attribution_required:false,attribution_text:'',priority:100};
const file=new File(['sample'],'music.mp3');
const catalog={version:1,tracks:[]};
test('registration validates license, categories, IDs and attribution',()=>{
 assert.equal(validateRegistration(file,fields,catalog).file,'new_track.mp3');
 for(const change of [{id:'../bad'},{commercial_use_confirmed:false},{categories:[]},{attribution_required:true},{source_url:'javascript:bad'}])assert.throws(()=>validateRegistration(file,{...fields,...change},catalog));
 assert.throws(()=>validateRegistration(file,fields,{tracks:[fields]}));
});
function fakeApi(conflict=false){const calls=[];return {calls,api:async(path,method='GET',body)=>{
 calls.push({path,method,body});if(path==='')return {private:true};
 if(path==='git/ref/heads/main')return {object:{sha:conflict&&calls.filter(c=>c.path===path).length>1?'other':'head'}};
 if(path==='git/commits/head')return {tree:{sha:'base'}};
 if(path==='contents/media/bgm/catalog.json?ref=head')return {content:Buffer.from(JSON.stringify(catalog)).toString('base64')};
 if(path.startsWith('contents/media/bgm/new_track')){const e=Error('missing');e.status=404;throw e;}
 if(path.startsWith('git/trees/base'))return {tree:[]};
 if(path==='git/blobs')return {sha:body.encoding==='base64'?'audio':'catalog'};
 if(path==='git/trees')return {sha:'tree'};
 if(path==='git/commits')return {sha:'commit'};
 if(path==='git/refs/heads/main')return {};
 throw Error(path);
 }};}
test('audio and catalog publish atomically in one non-force commit',async()=>{
 const {api,calls}=fakeApi();const result=await registerBgm(api,file,fields,async()=>Buffer.from(await file.arrayBuffer()).toString('base64'));
 assert.equal(result.sha256.length,64);
 const tree=calls.find(c=>c.path==='git/trees');assert.equal(tree.body.tree.length,2);assert.equal(tree.body.base_tree,'base');
 assert.deepEqual(calls.find(c=>c.path==='git/commits').body.parents,['head']);
 assert.deepEqual(calls.at(-1).body,{sha:'commit',force:false});
 assert.equal(calls.some(c=>c.path.includes('dispatch')),false);
});
test('concurrent main changes prevent publication',async()=>{
 const {api,calls}=fakeApi(true);await assert.rejects(()=>registerBgm(api,file,fields,async()=>''),/別の更新/);
 assert.equal(calls.some(c=>c.method==='PATCH'),false);
});
test('both BGM start times and title appearance survive presets and compilation',()=>{
 let registry=emptyRegistry();const values={bgm_start_seconds:30,bgm_delay_seconds:3,bgm_fade_in_seconds:1,bgm_loop:true};
 registry=savePreset(registry,'video',{id:'custom',name:'Custom',extends:'tiktok_standard',values});
 registry=savePreset(registry,'layout',{id:'appearance',name:'Appearance',extends:'portrait_standard',format:'vertical',values:{hook_band_color:'#224466',hook_band_width_ratio:0.8,hook_band_padding_y:24,hook_font_size_mode:'fixed'}});
 const c=resolveConfig(registry,{video_preset:'custom',layout_preset:'appearance',overrides:{video:{},layout:{}}}),g=fixedSettings(c);
 assert.equal(g.bgm.start_seconds,30);assert.equal(g.bgm.delay_seconds,3);assert.equal(g.bgm.loop,true);
 assert.equal(g.hook.band_color,'#224466');assert.equal(g.hook.band_width_ratio,0.8);assert.equal(g.hook.font_size_mode,'fixed');
});
