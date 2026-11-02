const $=id=>document.getElementById(id);
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const status=s=>{$('acStatus').textContent=s;};
const api=(...args)=>window.videoStudioApi(...args);
let file=null,url=null,rows=[],source=null,busy=false;
const pendingKey=()=>`acapella-pending:${repo()}`;
function savedPending(){try{return JSON.parse(localStorage.getItem(pendingKey())||'null');}catch{return null;}}
const repo=()=>$('repo').value.trim();
function val(){return Number($('acPreview').currentTime||0);}
function repaint(){
 const overlay=$('acOverlay'),t=val()*1000;
 const background=$('acBackground');
 if(Number.isFinite(t)&&Math.abs(background.currentTime-t/1000)>.15)background.currentTime=t/1000;
 const hook=t<Number($('acHook').value)*1000;
 const lyric=rows.find(r=>t>=Number(r.start.value)*1000&&t<Number(r.end.value)*1000);
 overlay.textContent=hook?`${$('acTitle').value} / ${$('acArtist').value}`:lyric?.text.value||'';
 overlay.className=hook?'ac-overlay hook':'ac-overlay lyric';
}
function buildRows(){
 const root=$('acLines');root.replaceChildren();rows=[];
 for(const line of $('acLyrics').value.split('\n').map(s=>s.trim()).filter(Boolean)){
  const box=document.createElement('div');box.className='ac-line';
  const text=document.createElement('input');text.value=line;text.setAttribute('aria-label','歌詞');
  const start=document.createElement('input');start.type='number';start.step='.01';start.min='0';start.value='0';start.setAttribute('aria-label','開始秒');
  const end=document.createElement('input');end.type='number';end.step='.01';end.min='0';end.value='0';end.setAttribute('aria-label','終了秒');
  const a=document.createElement('button');a.type='button';a.textContent='開始を記録';a.className='secondary';a.onclick=()=>{start.value=val().toFixed(2);repaint();};
  const z=document.createElement('button');z.type='button';z.textContent='終了を記録';z.className='secondary';z.onclick=()=>{end.value=val().toFixed(2);repaint();};
  box.append(text,start,end,a,z);root.append(box);rows.push({text,start,end});
 }
 status(`${rows.length}行を取り込みました。動画を再生し、各行の開始・終了を記録してください。`);
}
function script(id,meta){
 const title=$('acTitle').value.trim(),artist=$('acArtist').value.trim(),end=Math.round(Number($('acHook').value)*1000);
 const lyrics=rows.map(r=>({start_ms:Math.round(Number(r.start.value)*1000),end_ms:Math.round(Number(r.end.value)*1000),text:r.text.value.trim()}));
 const output=$('acOutput').value,framing=$('acFraming').value;
 const result={schema_version:1,production_type:'acapella',title,artist,hook_end_ms:end,lyrics,
  source:{public_id:`v-generator/acapella/${id}`,format:meta.format,bytes:meta.bytes,sha256:meta.sha256},
  framing:{vertical:framing,landscape:framing},global_settings:{format:'vertical',output_mode:output},auto_link:false};
 if(title.length<1||artist.length<1||!rows.length||!file)throw Error('動画・曲名・アーティスト名・歌詞を入力してください。');
 if(!Number.isFinite(file.duration)||file.duration>120||end>file.duration*1000)throw Error('動画またはフックの長さを確認してください。');
 let previous=0;
 for(const line of lyrics){if(!line.text||line.start_ms<previous||line.end_ms<=line.start_ms||line.end_ms>file.duration*1000+50)throw Error('歌詞の時刻が重複または動画の範囲外です。');previous=line.end_ms;}
 return result;
}
async function fileMeta(f){
 if(!f||!['mp4','mov'].includes(f.name.split('.').at(-1).toLowerCase())||!f.size||f.size>80_000_000)throw Error('80 MB以下のMP4またはMOVを選択してください。');
 const digest=await crypto.subtle.digest('SHA-256',await f.arrayBuffer());
 return {bytes:f.size,sha256:Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join(''),format:f.name.split('.').at(-1).toLowerCase()};
}
async function keyPair(){
 const keys=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['encrypt','decrypt']);
 const k=await crypto.subtle.exportKey('jwk',keys.publicKey);return {privateKey:keys.privateKey,public_jwk:{kty:k.kty,n:k.n,e:k.e}};
}
async function permission(id,meta,pair){
 await api('actions/workflows/acapella-upload.yml/dispatches','POST',{ref:'main',inputs:{upload_id:id,metadata:JSON.stringify({...meta,public_jwk:pair.public_jwk})}});
 for(let n=0;n<40;n++){
  try{
   const branch=await api(`git/ref/heads/ui-upload/${id}`);
   const ref=await api(`git/trees/${branch.object.sha}`);
   const entry=ref.tree.find(e=>e.path==='permission.json');
   if(entry){const blob=await api(`git/blobs/${entry.sha}`);return JSON.parse(new TextDecoder().decode(bytes(blob.content.replace(/\s/g,''))));}
  }catch(e){if(e.status!==404)throw e;}
  await sleep(3000);
 }
 throw Error('アップロード許可の発行を確認できません。Actionsの実行結果を確認してください。');
}
async function decrypt(envelope,privateKey){
 const key=await crypto.subtle.decrypt({name:'RSA-OAEP'},privateKey,bytes(envelope.wrapped));
 const aes=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['decrypt']);
 const combined=new Uint8Array([...bytes(envelope.ciphertext),...bytes(envelope.tag)]);
 return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(envelope.iv)},aes,combined)));
}
function upload(f,p){
 return new Promise((resolve,reject)=>{
  if(p.expires_at<Date.now()/1000||p.params?.type!=='authenticated'||p.params?.public_id!==`v-generator/acapella/${source.id}`)return reject(Error('アップロード許可が無効です。'));
  const form=new FormData();form.append('file',f);for(const [k,v] of Object.entries(p.params))form.append(k,String(v));form.append('api_key',p.api_key);form.append('signature',p.signature);
  const xhr=new XMLHttpRequest();xhr.open('POST',`https://api.cloudinary.com/v1_1/${p.cloud_name}/video/upload`);xhr.timeout=300000;
  xhr.upload.onprogress=e=>{if(e.lengthComputable)status(`動画を送信中：${Math.round(e.loaded/e.total*100)}%`);};
  xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300){try{const v=JSON.parse(xhr.responseText);if(v.public_id!==p.params.public_id||v.bytes!==p.metadata.bytes||v.format!==p.metadata.format)throw Error('登録結果が一致しません。');resolve(v);}catch(e){reject(e);}}else reject(Error('転送の結果を確認できません。新規受付で再送せずCloudinaryの素材を確認してください。'));};
  xhr.onerror=xhr.ontimeout=()=>reject(Error('転送結果が不明です。Cloudinaryの素材を確認してください。'));
  xhr.send(form);
 });
}
async function submit(){
 if(busy)return;busy=true;$('acSubmit').disabled=true;
 try{
  if(savedPending())throw Error('前回の生成受付を確認してください。新しい動画を再送しません。');
  if(!file)throw Error('先に動画を選択してください。');
  const meta=await fileMeta(file.blob);const id=crypto.randomUUID().replaceAll('-','');
  const payload=script(id,meta);
  const repository=await api('');if(!repository.private)throw Error('非公開リポジトリへ接続してください。');
  const runs=await api('actions/workflows/generate_video_ui.yml/runs?per_page=30');
  if(runs.workflow_runs.some(r=>r.status!=='completed'))throw Error('生成中の処理が完了してから実行してください。');
  source={id,meta};status('アップロード許可を準備しています。');
  const pair=await keyPair();const sealed=await permission(id,meta,pair);const p=await decrypt(sealed,pair.privateKey);
  await upload(file.blob,p);
  status('動画登録完了。生成を受け付けています。');
  const receipt=crypto.randomUUID(),input=await api('git/blobs','POST',{content:JSON.stringify(payload),encoding:'utf-8'});
  const tree=await api('git/trees','POST',{tree:[{path:'input/script.json',mode:'100644',type:'blob',sha:input.sha}]});
  const commit=await api('git/commits','POST',{message:`Pages input ${receipt}`,tree:tree.sha,parents:[]});
  await api('git/refs','POST',{ref:`refs/heads/ui-input/${receipt}`,sha:commit.sha});
  localStorage.setItem(pendingKey(),JSON.stringify({receipt,sha:commit.sha}));
  await api('actions/workflows/generate_video_ui.yml/dispatches','POST',{ref:'main',inputs:{receipt_id:receipt,input_sha:commit.sha,job_kind:'video'}});
  status(`生成を受け付けました。受付ID：${receipt}。生成履歴の「更新」で結果を確認してください。`);
 }catch(e){status(e.message);}finally{busy=false;$('acSubmit').disabled=false;}
}
$('acFile').onchange=()=>{
 const blob=$('acFile').files[0];if(url)URL.revokeObjectURL(url);
 if(!blob)return;url=URL.createObjectURL(blob);file={blob,duration:NaN};$('acPreview').src=url;$('acBackground').src=url;
 $('acPreview').onloadedmetadata=()=>{file.duration=$('acPreview').duration;status(`${file.duration.toFixed(1)}秒の動画を読み込みました。`);};
};
$('acPreview').ontimeupdate=repaint;
function previewLayout(){const box=$('acPreviewBox');box.classList.toggle('landscape',$('acPreviewFormat').value==='landscape');box.classList.toggle('crop',$('acFraming').value==='crop');}
$('acPreviewFormat').onchange=previewLayout;$('acFraming').onchange=previewLayout;
previewLayout();
for(const id of ['acTitle','acArtist','acHook'])$(id).oninput=repaint;
$('acBuildLines').onclick=buildRows;$('acSubmit').onclick=submit;
async function recover(){
 const item=savedPending();if(!item){status('確認待ちの生成受付はありません。');return;}
 try{
  const runs=await api('actions/workflows/generate_video_ui.yml/runs?per_page=100');
  const run=runs.workflow_runs.find(r=>r.display_title===`Pages ${item.receipt}`);
  if(run){localStorage.removeItem(pendingKey());status(`受付済み：${item.receipt}。生成履歴を更新してください。`);return;}
  await api('actions/workflows/generate_video_ui.yml/dispatches','POST',{ref:'main',inputs:{receipt_id:item.receipt,input_sha:item.sha,job_kind:'video'}});
  status(`同じ受付IDで照会を依頼しました：${item.receipt}。少し後で再確認してください。`);
 }catch(e){status(e.message+'。受付IDは保持しています。');}
}
$('acRecover').onclick=recover;
if(savedPending())status(`前回の受付 ${savedPending().receipt} の確認が必要です。`);
