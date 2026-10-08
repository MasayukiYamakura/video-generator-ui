// Optional: happy-dom. No real GitHub writes or Actions runs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {decodeBlob} from './studio-features.mjs';
const require=createRequire(import.meta.url);
const {Window}=await import(require.resolve('happy-dom'));
const window=new Window({url:'https://example.test/',settings:{disableJavaScriptEvaluation:true}});
window.document.write(fs.readFileSync(new URL('./index.html',import.meta.url),'utf8'));
const document=window.document,$=id=>document.getElementById(id),blobs=[],dispatches=[];
let receipt,finished=false;
const file=new File(['voice fixture'],'voice.wav');
const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
const audioHash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
const track={id:'calm_01',title:'Calm',categories:['calm'],sha256:'f'.repeat(64)};
const encoded=content=>({encoding:'base64',content:Buffer.from(content).toString('base64')});
const context=vm.createContext({window,document,localStorage:window.localStorage,TextEncoder,TextDecoder,Uint8Array,AbortController,atob,btoa,crypto,Blob,URL,decodeBlob,setTimeout,clearTimeout,setInterval(){},console,
 fetch:async(url,options)=>{
  const path=new URL(url).pathname.replace('/repos/MasayukiYamakura/video-generator','').replace(/^\//,''),body=options.body?JSON.parse(options.body):null;
  let data={};
  if(path==='')data={private:true};
  else if(path==='git/blobs'){blobs.push(body);data={sha:'a'.repeat(40)};}
  else if(['git/trees','git/commits','git/refs'].includes(path))data={sha:'a'.repeat(40)};
  else if(path.endsWith('/dispatches')){receipt=body.inputs.receipt_id;dispatches.push(body);}
  else if(path.endsWith('/runs'))data={workflow_runs:receipt?[{id:1,display_title:'Pages '+receipt,status:finished?'completed':'queued',conclusion:finished?'success':null}]:[]};
  else if(path==='actions/runs/1')data={status:'completed',conclusion:'success'};
  else if(path==='actions/runs/1/jobs')data={jobs:[]};
  else if(path==='actions/runs/1/artifacts')data={artifacts:[]};
  else if(path==='contents/media/bgm/catalog.json')data=encoded(JSON.stringify({version:1,tracks:[track]}));
  else if(path==='contents/audio-preview.m4a')data=encoded('audio result');
  else if(path==='contents/preview-meta.json')data=encoded(JSON.stringify({audio_sha256:audioHash}));
  else if(path==='contents/bgm-report.json')data=encoded(JSON.stringify({track}));
  else if(path==='contents/preview-script.json')data=encoded(blobs.find(b=>b.encoding==='utf-8').content);
  else throw Error('Unexpected API '+path);
  return {ok:true,status:path.endsWith('/dispatches')?204:200,json:async()=>data};
 }});
vm.runInContext(fs.readFileSync(new URL('./app.js',import.meta.url),'utf8').replace(/^import .*studio-features.*$/m,'').replace('mountBgmRegistration(api,base64);',''),context);
$('token').value='fixture';
Object.defineProperty($('audio'),'files',{value:[file]});
$('script').value=JSON.stringify({scenes:[{text:'こんにちは',hook_text:'実際の\nタイトル'}],global_settings:{bgm:{enabled:true,category:'calm',start_seconds:30,delay_seconds:3}}});
$('audioPreview').click();
for(let i=0;i<200&&!$('status').textContent.includes('実行受付完了');i++)await new Promise(r=>setTimeout(r,5));
assert.match($('status').textContent,/実行受付完了/);
assert.equal(dispatches[0].inputs.job_kind,'audio-preview');
const payload=JSON.parse(blobs.find(b=>b.encoding==='utf-8').content);
assert.equal(payload.global_settings.bgm.delay_seconds,3);
finished=true;await context.refresh();
assert.equal($('mixedPlayer').hidden,false);
assert.match($('previewStatus').textContent,/試聴した曲を固定/);
const pin=vm.runInContext('previewPin',context);assert.equal(pin.track.id,'calm_01');
const next=JSON.parse($('script').value);await context.checkPreviewPin(next,file);
assert.equal(next.global_settings.bgm.selection_mode,'track');assert.equal(next.global_settings.bgm.expected_sha256,'f'.repeat(64));
$('script').dispatchEvent(new window.Event('input'));assert.match($('previewStatus').textContent,/再生成/);
console.log('Studio DOM integration passed: preview dispatch, inline playback, curve pin and stale notice.');
await window.happyDOM.abort();
