// Optional DOM integration: npm install --no-save happy-dom
// No real GitHub/Google API, browser or Actions execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Window}=await import(require.resolve('happy-dom'));
const window=new Window({url:'https://example.test/', settings:{disableJavaScriptEvaluation:true}});
window.document.write(fs.readFileSync(new URL('./index.html',import.meta.url),'utf8'));
const document=window.document, $=id=>document.getElementById(id), blobs=[], trees=[];
let receipt;
const context=vm.createContext({window,document,localStorage:window.localStorage,
  TextEncoder,TextDecoder,Uint8Array,AbortController,atob,btoa,crypto:globalThis.crypto,
  setTimeout,clearTimeout,setInterval(){},console,
  fetch:async(url,options)=>{
    const path=new URL(url).pathname.replace('/repos/MasayukiYamakura/video-generator','').replace(/^\//,'');
    const body=options.body?JSON.parse(options.body):null;
    let data={};
    if(path==='git/blobs'){blobs.push(body);data={sha:'a'.repeat(40)};}
    else if(path==='git/trees'){trees.push(body);data={sha:'a'.repeat(40)};}
    else if(path==='git/commits'||path==='git/refs')data={sha:'a'.repeat(40)};
    else if(path==='actions/workflows/generate_video_ui.yml/dispatches')receipt=body.inputs.receipt_id;
    else if(path==='actions/workflows/generate_video_ui.yml/runs')data={workflow_runs:receipt?[{id:1,display_title:'Pages '+receipt,status:'completed',conclusion:'success'}]:[]};
    else if(path==='')data={private:true};
    else throw Error('Unexpected API: '+path);
    return {ok:true,status:path.endsWith('dispatches')?204:200,json:async()=>data};
  }});
vm.runInContext(fs.readFileSync(new URL('./app.js',import.meta.url),'utf8').replace(/^import .*studio-features.*$/m,'').replace('mountBgmRegistration(api,base64);',''),context);
globalThis.document=document;globalThis.window=window;
const {mountBuilder}=await import('./builder/ui.mjs');
window.videoConfigurator=mountBuilder(()=>window.videoStudioApi);
const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new window.Event('change'));};
assert.equal($('audioUpload').hidden,false);assert.equal($('pbTtsFields').hidden,true);
change('pb_voice_mode','anonymous');assert.equal($('pbDspHelp').hidden,false);
assert.equal($('audioUpload').hidden,false);
change('pb_voice_mode','tts');assert.equal($('audioUpload').hidden,true);
assert.equal($('pbTtsFields').hidden,false);assert.equal($('pb_tts_voice').value,'hashimoto');
assert.equal($('pbTtsDetails').open,false);
change('pb_tts_voice','male_a');change('pb_background_mode','fixed');
$('pbTranscript').value='自分の人生を、自分で選ぶ。';$('pbBuild').click();
assert.match($('pbPrompt').value,/自分の人生を、自分で選ぶ。/);
assert.equal($('pbApplyOnSend').checked,true);
$('script').value=JSON.stringify({scenes:[{text:'自分の人生を、自分で選ぶ。',hook_text:'人生を選ぶ'}]});
$('token').value='mock-token';$('generate').click();
for(let i=0;i<100&&!$('status').textContent.includes('実行受付完了');i++)await new Promise(r=>setTimeout(r,5));
assert.match($('status').textContent,/実行受付完了/);
assert.equal(blobs.length,1);assert.equal(blobs[0].encoding,'utf-8');
const result=JSON.parse(blobs[0].content);
assert.equal(result.global_settings.voice_mode,'tts');assert.equal(result.global_settings.tts.voice,'male_a');
assert.equal(Object.hasOwn(result,'audio_file'),false);
assert.deepEqual(trees[0].tree.map(item=>item.path),['input/script.json']);
change('pb_voice_mode','original');assert.equal($('pbTtsFields').hidden,true);
assert.equal($('audioUpload').hidden,false);assert.equal($('pbDspHelp').hidden,true);
console.log('TTS DOM integration passed: three modes, prompt, settings, JSON-only submission.');
await window.happyDOM.abort();

