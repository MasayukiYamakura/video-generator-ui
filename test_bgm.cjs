const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const nodes = new Map();
const element = () => ({value:'',textContent:'',files:[],append(){},replaceChildren(){},addEventListener(){}});
const document = {hidden:false, getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element,addEventListener(){}};
document.getElementById('repo').value='owner/private';
const context = vm.createContext({document,window:{addEventListener(){}},localStorage:{getItem(){return null;},setItem(){}},setInterval(){},setTimeout,clearTimeout,TextEncoder,TextDecoder,Uint8Array,AbortController,atob,console});
vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),context);
const settings = value => context.bgmSettings({global_settings:{bgm:value}});
assert.equal(settings(undefined).enabled,false);
for(const level of [-30,0,6,12,18,24]) assert.equal(settings({volume_db:level}).volume_db,level);
for(const value of [{enabled:'true'},{volume_db:25},{volume_db:NaN},{ducking:1},{enabled:true,category:'unknown'},{foo:1}]) assert.throws(()=>settings(value));
const catalog={version:1,tracks:[{id:'calm_02',title:'静かな曲B',categories:['calm'],priority:20},{id:'calm_01',title:'静かな曲A',categories:['calm'],priority:10}]};
context.api=async()=>({content:Buffer.from(JSON.stringify(catalog)).toString('base64')});
(async()=>{
 assert.equal(await context.previewBgm({}),'BGM: なし');
 const byCategory=await context.previewBgm({global_settings:{bgm:{enabled:true,category:'calm'}}});
 assert.ok(byCategory.includes('静かな曲A (calm_01)'));
 const byId=await context.previewBgm({global_settings:{bgm:{enabled:true,selection_mode:'track',track_id:'calm_02',volume_db:-6}}});
 assert.ok(byId.includes('静かな曲B (calm_02)'));
 assert.ok(byId.includes('-6 dB'));
 await assert.rejects(()=>context.previewBgm({global_settings:{bgm:{enabled:true,category:'serious'}}}));
 console.log('BGM UI validation and preview tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});



const ttsScript={global_settings:{voice_mode:'tts',tts:{voice:'male_a'}},scenes:[{text:'[[こんにちは]]'}]};
assert.equal(context.validate(null,JSON.stringify(ttsScript)).mode,'tts');
assert.throws(()=>context.validate(null,JSON.stringify({...ttsScript,scenes:[{text:''}]})));
assert.throws(()=>context.validate(null,JSON.stringify({...ttsScript,global_settings:{voice_mode:'tts',tts:{pace:'bad'}}})));
assert.throws(()=>context.validate(null,JSON.stringify({scenes:[{text:'録音'}]})));
