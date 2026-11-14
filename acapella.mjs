const $=id=>document.getElementById(id);
const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const status=s=>{$('acStatus').textContent=s;};
const api=(...args)=>window.videoStudioApi(...args);
let file=null,url=null,rows=[],source=null,busy=false;
const pendingKey=()=>`acapella-pending-v2:${repo()}`;
function pendingItems(){
 try{
  const current=JSON.parse(localStorage.getItem(pendingKey())||'[]');
  const legacy=JSON.parse(localStorage.getItem(`acapella-pending:${repo()}`)||'null');
  return [...(Array.isArray(current)?current:[]),...(legacy?.receipt&&legacy?.sha?[{...legacy,legacy:true}]:[])];
 }catch{return [];}
}
function savePending(items){localStorage.setItem(pendingKey(),JSON.stringify(items.filter(item=>!item.legacy)));}
function forgetPending(item){
 if(item.legacy)localStorage.removeItem(`acapella-pending:${repo()}`);
 else savePending(pendingItems().filter(entry=>entry.receipt!==item.receipt));
}
const repo=()=>$('repo').value.trim();
const lip=()=>$('acMode').value!=='original';
const fullMode=()=>$('acMode').value==='full';
const stock=()=>lip()&&$('acVisualMode').value==='stock_mix';
const preparedKey=()=>`acapella-prepared:${repo()}:${$('acMode').value}`;
let prepared=null;
function ready(){
 const matches=prepared?.mode===$('acMode').value&&prepared?.stock===stock()&&
  (stock()?prepared.imageName===$('acImage').value.trim():prepared.videoIdentity===identity(file?.blob))&&
  (!lip()||prepared.audioIdentity===identity(chorus));
 $('acSubmit').disabled=busy||!matches;
 return matches;
}
function restorePrepared(){
 try{prepared=JSON.parse(localStorage.getItem(preparedKey())||'null');}catch{prepared=null;}
 ready();
}
let imageFile=null,imageUrl=null;
function imageName(){
 const name=$('acImage').value.trim();
 if(!name||name==='.'||name==='..'||name.startsWith('.')||/[\\/\x00-\x1f]/.test(name)||name.length>180||!/\.(png|jpe?g|webp)$/i.test(name))
  throw Error('media/ 内の画像ファイル名（PNG/JPG/WebP）を入力してください。');
 return name;
}
async function repositoryImage(){
 const name=imageName();
 const head=await api('git/ref/heads/main');
 const commit_sha=head.object.sha;
 const item=await api(`contents/media/${encodeURIComponent(name)}?ref=${commit_sha}`);
 if(item.type!=='file'||item.name!==name||item.path!==`media/${name}`||!Number.isInteger(item.size)||item.size<1||item.size>20_000_000||!/^[a-f0-9]{40}$/.test(item.sha))
  throw Error(`media/${name} の画像情報を確認できません。形式・容量（20 MB以下）を確認してください。`);
 return {path:item.path,commit_sha,blob_sha:item.sha,format:name.split('.').at(-1).toLowerCase().replace('jpeg','jpg'),bytes:item.size};
}
async function previewRepositoryImage(asset){
 const blob=await api(`git/blobs/${asset.blob_sha}`);
 if(blob.encoding!=='base64')throw Error('画像のプレビューを取得できません。');
 const data=bytes(blob.content.replace(/\s/g,''));
 if(data.length!==asset.bytes)throw Error('画像の容量が一致しません。');
 if(imageUrl)URL.revokeObjectURL(imageUrl);
 imageUrl=URL.createObjectURL(new Blob([data],{type:`image/${asset.format==='jpg'?'jpeg':asset.format}`}));
 $('acStockPreview').src=imageUrl;
}
const chorusPlayer=$('acChorusPlayer');
const offset=()=>Math.round(Number($('acOffset').value)*1000)/1000;
let chorus=null, decoded=null, fullUrl=null, chorusUrl=null, previewEnd=null;
const textDefaults=()=>({vertical:{hook:{font_size:70,center_x:540,center_y:384,max_width_ratio:.82,lines:'single'},caption:{font_size:52,center_x:540,center_y:1190,max_width_ratio:.82}},landscape:{hook:{font_size:86,center_x:960,center_y:216,max_width_ratio:.82,lines:'single'},caption:{font_size:60,center_x:960,center_y:670,max_width_ratio:.82}}});
let textLayouts=textDefaults();
const textDimensions=fmt=>fmt==='vertical'?[1080,1920]:[1920,1080];
const textFields={hook:{font_size:'acHookSize',center_x:'acHookX',center_y:'acHookY',max_width_ratio:'acHookWidth',lines:'acHookLines'},caption:{font_size:'acCaptionSize',center_x:'acCaptionX',center_y:'acCaptionY',max_width_ratio:'acCaptionWidth'}};
function loadTextFields(){
 const fmt=$('acTextFormat').value,[width,height]=textDimensions(fmt),slot=textLayouts[fmt];
 for(const [kind,fields] of Object.entries(textFields))for(const [key,id] of Object.entries(fields)){
  const value=slot[kind][key];$(id).value=key==='center_x'?(value/width*100).toFixed(1):key==='center_y'?(value/height*100).toFixed(1):key==='max_width_ratio'?Math.round(value*100):value;
 }
 paintTextStyle();
}
function saveTextFields(){
 const fmt=$('acTextFormat').value,[width,height]=textDimensions(fmt),slot=textLayouts[fmt];
 for(const [kind,fields] of Object.entries(textFields))for(const [key,id] of Object.entries(fields)){
  if(key==='lines'){slot[kind][key]=$(id).value;continue;}
  const n=Number($(id).value);if($(id).value===''||!Number.isFinite(n))continue;
  slot[kind][key]=key==='center_x'?Math.round(n/100*width):key==='center_y'?Math.round(n/100*height):key==='max_width_ratio'?n/100:Math.round(n);
 }
 saveDraft();paintTextStyle();
}
function paintTextStyle(){
 const fmt=$('acPreviewFormat').value,[width,height]=textDimensions(fmt),box=$('acPreviewBox');
 if(!box?.clientWidth)return;
 const slot=textLayouts[fmt],scale=box.clientWidth/width;
 const actual=[];
 for(const [id,kind] of [['acLipTitle','hook'],['acOverlay',lip()?'caption':Number($('acPreview')?.currentTime||0)<Number($('acHook').value)*1?'hook':'caption']]){
  const node=$(id),style=slot[kind];if(!node)continue;
  const parts=kind==='hook'&&style.lines==='double'?[$('acTitle').value,$('acArtist').value]:[kind==='hook'?`${$('acTitle').value}  /  ${$('acArtist').value}`:node.textContent];
  let effective=style.font_size;
  const context=document.createElement('canvas').getContext?.('2d');
  const measure=(part,size)=>{if(context){context.font=`700 ${size}px sans-serif`;return context.measureText(part).width+6;}return part.length*size;};
  while(parts.some(part=>measure(part,effective)>width*style.max_width_ratio)&&effective>16)effective-=2;
  actual.push(`${kind==='hook'?'フック':'歌詞'} ${effective}px${effective<style.font_size?'（幅に合わせ縮小）':''}`);
  node.style.left=`${style.center_x/width*100}%`;node.style.top=`${style.center_y/height*100}%`;
  node.style.maxWidth=`${style.max_width_ratio*100}%`;node.style.width=`${style.max_width_ratio*100}%`;
  node.style.fontSize=`${Math.max(12,effective*scale)}px`;
  node.style.whiteSpace=kind==='hook'&&style.lines==='double'?'pre-line':'nowrap';
  if(kind==='hook'&&style.lines==='double')node.textContent=node.textContent.replace(' / ','\n');
 }
 const hook=slot.hook,caption=slot.caption;
 $('acTextStatus').textContent=`${fmt==='vertical'?'縦型':'横型'}：設定 フック ${hook.font_size}px・歌詞 ${caption.font_size}px。表示目安 ${actual.join('／')}。端末と生成環境のフォント差は完成動画で確認してください。`;
}
function val(){if(lip())return chorusPlayer.currentTime;return Number($('acPreview').currentTime||0);}
function repaint(){
 if(lip()&&chorus&&!stock()){
  const video=$('acPreview'), target=offset()+val();
  if(!chorusPlayer.paused&&video.paused)video.play().catch(()=>{});
  if(chorusPlayer.paused&&!video.paused&&syncPlaying)video.pause();
  if((!chorusPlayer.paused||syncPlaying)&&Math.abs(video.currentTime-target)>.045)video.currentTime=target;
  if(chorusPlayer.paused)syncPlaying=false;
 }
 const overlay=$('acOverlay'),t=val()*1000;
 const background=$('acBackground');
 if(Number.isFinite(t)&&Math.abs(background.currentTime-t/1000)>.15)background.currentTime=t/1000;
 const hook=t<Number($('acHook').value)*1000;
 let lyricText='';
 if(lip()){try{lyricText=compiledLyrics(true).find(r=>t>=r.start_ms&&t<r.end_ms)?.text||'';}catch{}}
 const lyric=rows.find(r=>t>=Number(r.start.value)*1000&&t<Number(r.end.value)*1000);
 overlay.textContent=hook?`${$('acTitle').value} / ${$('acArtist').value}`:lip()?lyricText:lyric?.text.value||'';
 overlay.className=hook&&!lip()?'ac-overlay hook':'ac-overlay lyric';
 if(lip()&&hook)overlay.textContent=lyricText;
 if(lip())paintMask();
 $('acLipTitle').textContent=lip()&&hook?`${$('acTitle').value} / ${$('acArtist').value}`:'';
 paintTextStyle();
}
function buildRows(){
 const root=$('acLines');root.replaceChildren();rows=[];
 for(const line of $('acLyrics').value.split('\n').map(s=>s.trim()).filter(Boolean)){
  const box=document.createElement('div');box.className='ac-line';
  const text=document.createElement('input');text.value=line;text.setAttribute('aria-label','歌詞');
  const start=document.createElement('input');start.type='number';start.step='.01';start.min='0';start.value=lip()?'':'0';start.setAttribute('aria-label','開始秒');
  const end=document.createElement('input');end.type='number';end.step='.01';end.min='0';end.value=lip()?'':'0';end.setAttribute('aria-label','終了秒');
  const a=document.createElement('button');a.type='button';a.textContent='開始を記録';a.className='secondary';a.onclick=()=>{start.value=val().toFixed(2);repaint();};
  const z=document.createElement('button');z.type='button';z.textContent='終了を記録';z.className='secondary';z.onclick=()=>{end.value=val().toFixed(2);repaint();};
  box.append(text,start,end,a,z);root.append(box);rows.push({text,start,end});
 }
 status(lip()?'サビを再生し、各行の開始を記録してください。':`${rows.length}行を取り込みました。動画を再生し、各行の開始・終了を記録してください。`);
}
function compiledLyrics(partial=false){
 const clears=$('acClears').value.split(',').filter(v=>v.trim()).map(v=>Math.round(Number(v)*1000));
 const duration=Math.floor(chorusPlayer.duration*1000);
 if(!Number.isFinite(duration)||clears.some(v=>!Number.isInteger(v)||v<0||v>duration))throw Error('サビ音源または歌詞を消す時刻を確認してください。');
 const selected=partial?rows.filter(r=>r.start.value!==''):rows;
 return lyricIntervals(selected.map(r=>({text:r.text.value.trim(),
  start_ms:r.start.value===''?null:Math.round(Number(r.start.value)*1000),
  end_ms:r.end.value===''?null:Math.round(Number(r.end.value)*1000)})),clears,duration);
}
function script(id,meta){
 validateLocalText();
 const title=$('acTitle').value.trim(),artist=$('acArtist').value.trim(),end=Math.round(Number($('acHook').value)*1000);
 const lyrics=lip()?compiledLyrics():rows.map(r=>({start_ms:Math.round(Number(r.start.value)*1000),end_ms:Math.round(Number(r.end.value)*1000),text:r.text.value.trim()}));
 const output=lip()?(fullMode()?'horizontal_only':'vertical_only'):$('acOutput').value,framing=$('acFraming').value;
 const result={schema_version:1,production_type:'acapella',title,artist,hook_end_ms:end,lyrics,
   framing:{vertical:framing,landscape:framing},text_layout:structuredClone(textLayouts),global_settings:{format:'vertical',output_mode:output},auto_link:$('acAutoLink').checked};
 if(stock()){
  const pct=Number($('acStockPercent').value),keywords=$('acStockKeywords').value.split('\n').map(v=>v.trim()).filter(Boolean);
  if($('acStockPercent').value===''||!Number.isInteger(pct)||pct<0||pct>100||!['pexels','pixabay'].includes($('acStockProvider').value)||keywords.length<1||keywords.length>12||keywords.some(k=>!/^[A-Za-z0-9 _,-]{2,100}$/.test(k)))throw Error('外部映像の割合、提供元、英語の検索語を確認してください。');
  if(!chorus||!meta?.path||!rows.length||!Number.isFinite(chorusPlayer.duration)||end<1000||end>10000||end>=chorusPlayer.duration*1000)throw Error('冒頭画像・楽曲・歌詞・冒頭表示の長さを確認してください。');
  return {...result,schema_version:4,image_source:meta,music_visuals:{stock_percent:pct,provider:$('acStockProvider').value,keywords}};
 }
 result.source={public_id:`v-generator/acapella/${id}`,...meta};
 if(lip()){
  if(!chorus||!Number.isFinite(file?.duration)||!Number.isFinite(offset())||offset()<0)throw Error('映像とサビ音源を確認してください。');
  const length=chorusPlayer.duration;
  if(file.duration>(fullMode()?360:120))throw Error('撮影動画の時間上限を超えています。');
  if(!(length>0&&length<=(fullMode()?360:120))||end<0||end>length*1000)throw Error('サビまたは冒頭表示の長さを確認してください。');
  const trim=numberMs('acTrimEnd');
  if(trim!==null&&(trim<=offset()*1000||trim>file.duration*1000+1))throw Error('映像の終了位置を確認してください。');
  const shortage=offset()+length-(trim===null?file.duration:trim/1000);
  if(shortage>.001)throw Error(`映像が ${shortage.toFixed(3)} 秒不足しています。`);
  if(end>0&&(!title||!artist))throw Error('冒頭表示には曲名とアーティスト名が必要です。');
  if(!rows.length||rows.length>100)throw Error('歌詞を1〜100行で入力してください。');
  return {...result,title:title||'口パク動画',artist:artist||'未設定',schema_version:2,video_start_ms:Math.round(offset()*1000),video_end_ms:trim,face_mask:readMask(length)};
 }
 if(title.length<1||artist.length<1||!rows.length||!file)throw Error('動画・曲名・アーティスト名・歌詞を入力してください。');
 if(!Number.isFinite(file.duration)||file.duration>120||end>file.duration*1000)throw Error('動画またはフックの長さを確認してください。');
 let previous=0;
 for(const line of lyrics){if(!line.text||line.start_ms<previous||line.end_ms<=line.start_ms||line.end_ms>file.duration*1000+50)throw Error('歌詞の時刻が重複または動画の範囲外です。');previous=line.end_ms;}
 return result;
}
function validateLocalText(){
 for(const fmt of ['vertical','landscape']){
  const [width,height]=textDimensions(fmt);
  for(const name of ['hook','caption']){
   const slot=textLayouts[fmt][name];
   if(!Number.isInteger(slot.font_size)||slot.font_size<16||slot.font_size>300||!Number.isInteger(slot.center_x)||slot.center_x<0||slot.center_x>width||!Number.isInteger(slot.center_y)||slot.center_y<0||slot.center_y>height||!Number.isFinite(slot.max_width_ratio)||slot.max_width_ratio<.1||slot.max_width_ratio>1)throw Error('冒頭フック・歌詞の文字サイズ、位置、表示幅を確認してください。');
  }
 }
}
async function fileMeta(f,audio=false,image=false){
 if(!f||!(image?['png','jpg','jpeg','webp']:audio?['wav']:['mp4','mov']).includes(f.name.split('.').at(-1).toLowerCase())||!f.size||f.size>(image?20_000_000:fullMode()?(audio?64_000_000:100_000_000):(audio?24_000_000:80_000_000)))throw Error('素材の形式と容量上限を確認してください。');
 const digest=await crypto.subtle.digest('SHA-256',await f.arrayBuffer());
 const ext=f.name.split('.').at(-1).toLowerCase();
 return {bytes:f.size,sha256:Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join(''),format:image&&ext==='jpeg'?'jpg':ext};
}
async function keyPair(){
 const keys=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['encrypt','decrypt']);
 const k=await crypto.subtle.exportKey('jwk',keys.publicKey);return {privateKey:keys.privateKey,public_jwk:{kty:k.kty,n:k.n,e:k.e}};
}
async function permission(id,meta,pair){
 let prior=null;
 try{prior=(await api(`git/ref/heads/ui-upload/${id}`)).object.sha;}
 catch(e){if(e.status!==404)throw e;}
 await api('actions/workflows/acapella-upload.yml/dispatches','POST',{ref:'main',inputs:{upload_id:id,metadata:JSON.stringify({...meta,public_jwk:pair.public_jwk})}});
 for(let n=0;n<40;n++){
  try{
   const branch=await api(`git/ref/heads/ui-upload/${id}`);
   if(branch.object.sha===prior){await sleep(3000);continue;}
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
  const resource=['png','jpg','jpeg','webp'].includes(p.metadata.format)?'image':'video';
  const xhr=new XMLHttpRequest();xhr.open('POST',`https://api.cloudinary.com/v1_1/${p.cloud_name}/${resource}/upload`);xhr.timeout=300000;
  xhr.upload.onprogress=e=>{if(e.lengthComputable)status(`素材を送信中：${Math.round(e.loaded/e.total*100)}%`);};
  xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300){try{const v=JSON.parse(xhr.responseText);if(v.public_id!==p.params.public_id||v.bytes!==p.metadata.bytes||v.format!==p.metadata.format)throw Error('登録結果が一致しません。');resolve(v);}catch(e){reject(e);}}else reject(Error('転送の結果を確認できません。新規受付で再送せずCloudinaryの素材を確認してください。'));};
  xhr.onerror=xhr.ontimeout=()=>reject(Error('転送結果が不明です。Cloudinaryの素材を確認してください。'));
  xhr.send(form);
 });
}
async function transferSource(blob,id,meta,pair){
 source={id,meta};
 status('アップロード許可を準備しています。');
 await upload(blob,await decrypt(await permission(id,meta,pair),pair.privateKey));
}
async function prepare(){
 if(busy)return;busy=true;ready();$('acPrepare').disabled=true;
 try{
  const mode=$('acMode').value,visual=stock();
  if(!stock()&&!file)throw Error('先に動画を選択してください。');
  const videoFile=stock()?null:file.blob,audioFile=chorus;
  const meta=stock()?await repositoryImage():await fileMeta(videoFile);
  const audioMeta=lip()?await fileMeta(audioFile,true):null;
  const saved=JSON.parse(localStorage.getItem(`acapella-transfer:${repo()}:${$('acMode').value}`)||'null');
  const existing=lip()&&!stock()?project?.layouts?.[layoutKey()]?.video:null;
  const savedVideo=existing?.sha256===meta.sha256?existing:null;
  const id=savedVideo?.public_id.split('/').at(-1)??(saved?.videoSha===meta.sha256?saved.videoId:null)??crypto.randomUUID().replaceAll('-','');
  const payload=script(id,meta);
  const repository=await api('');if(!repository.private)throw Error('非公開リポジトリへ接続してください。');
  const audioId=lip()?(saved?.audioSha===audioMeta.sha256?saved.audioId:crypto.randomUUID().replaceAll('-','')):null;
  const retryKey=`acapella-transfer:${repo()}:${$('acMode').value}`;
  localStorage.setItem(retryKey,JSON.stringify({videoSha:meta.sha256,videoId:id,audioSha:audioMeta?.sha256,audioId}));
  const pair=await keyPair();
  if(!stock()&&!savedVideo)await transferSource(videoFile,id,meta,pair);
  if(lip())await transferSource(audioFile,audioId,audioMeta,pair);
  if(mode!==$('acMode').value||visual!==stock()||identity(videoFile)!==identity(file?.blob)||
     (lip()&&identity(audioFile)!==identity(chorus)))
   throw Error('準備中に素材または制作モードが変わりました。もう一度準備してください。');
  prepared={mode:$('acMode').value,stock:stock(),imageName:stock()?imageName():null,
   videoIdentity:identity(videoFile),audioIdentity:identity(audioFile),meta,id,
   audioMeta,audioId,preparedAt:Date.now()};
  if(lip())payload.audio_source={...audioMeta,public_id:`v-generator/acapella/${audioId}`};
  localStorage.setItem(preparedKey(),JSON.stringify(prepared));
  localStorage.removeItem(retryKey);
  status('素材の準備が完了しました。生成ボタンを押し、「受付済み」の表示を確認してから別アプリへ切り替えられます。');
 }catch(e){prepared=null;localStorage.removeItem(preparedKey());status(`素材の準備が完了していません。 ${e.message}`);}
 finally{busy=false;$('acPrepare').disabled=false;ready();}
}
async function ensureInputRef(item){
 const ref=`git/ref/heads/ui-input/${item.receipt}`;
 try{
  const current=await api(ref);
  if(current.object?.sha!==item.sha)throw Error('受付IDの入力コミットが一致しません。生成を中止しました。');
  return;
 }catch(e){if(e.status!==404)throw e;}
 try{await api('git/refs','POST',{ref:`refs/heads/ui-input/${item.receipt}`,sha:item.sha});}
 catch(e){
  if(e.status!==422)throw e;
  const current=await api(ref);
  if(current.object?.sha!==item.sha)throw Error('受付IDの入力コミットが一致しません。生成を中止しました。');
 }
}
async function submit(){
 if(busy||!ready())return;busy=true;ready();
 try{
  const current=prepared;
  const meta=stock()?await repositoryImage():await fileMeta(file.blob);
  if(JSON.stringify(meta)!==JSON.stringify(current.meta)||
     (lip()&&(await fileMeta(chorus,true)).sha256!==current.audioMeta?.sha256))
   throw Error('素材が準備時から変わりました。もう一度「素材を準備」を押してください。');
  const payload=script(current.id,meta);
  if(lip())payload.audio_source={...current.audioMeta,public_id:`v-generator/acapella/${current.audioId}`};
  const signature=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)))),v=>v.toString(16).padStart(2,'0')).join('');
  if(pendingItems().some(item=>item.signature===signature))
   throw Error('同じ内容の生成受付を確認中です。「前回の受付を確認・再開」から確認してください。');
  const repository=await api('');if(!repository.private)throw Error('非公開リポジトリへ接続してください。');
  const runs=await api('actions/workflows/generate_video_ui.yml/runs?per_page=30');
  if(runs.workflow_runs.some(r=>r.status!=='completed'))throw Error('生成中の処理が完了してから実行してください。');
  const receipt=crypto.randomUUID(),input=await api('git/blobs','POST',{content:JSON.stringify(payload),encoding:'utf-8'});
  const tree=await api('git/trees','POST',{tree:[{path:'input/script.json',mode:'100644',type:'blob',sha:input.sha}]});
  const commit=await api('git/commits','POST',{message:`Pages input ${receipt}`,tree:tree.sha,parents:[]});
  const item={receipt,sha:commit.sha,signature,mode:$('acMode').value,title:payload.title,createdAt:Date.now()};
  savePending([...pendingItems().filter(entry=>!entry.legacy),item]);
  await ensureInputRef(item);
  status(`受付ID ${receipt} を保存しました。GitHubへの受付を確認しています。`);
  await api('actions/workflows/generate_video_ui.yml/dispatches','POST',{ref:'main',inputs:{receipt_id:receipt,input_sha:commit.sha,job_kind:'video'}});
  status(`受付依頼を送信しました（${receipt}）。「受付済み」になるまで画面を開いてください。`);
  await reconcilePending(false);
  if(lip()&&project){
   project.layouts[layoutKey()]??={};
   project.layouts[layoutKey()][stock()?'image':'video']=stock()?{...meta,name:imageName()}:{...payload.source,name:file.blob.name};
   project.runs??={};const key=layoutKey();
   project.runs[key]=[...runList(project.runs[key]),receipt];
   try{await saveProject();}catch(e){status(`受付依頼済み ${receipt}。曲プロジェクトの保存に失敗しました。 ${e.message}`);}
  }
 }catch(e){status(e.message);}finally{busy=false;ready();}
}
$('acPrepare').onclick=prepare;
$('acFile').onchange=()=>selectVideo($('acFile').files[0]);
function selectImage(blob){
 if(imageUrl)URL.revokeObjectURL(imageUrl);
 imageFile=blob||null;imageUrl=blob?URL.createObjectURL(blob):null;
 const view=$('acStockPreview');if(imageUrl)view.src=imageUrl;else view.removeAttribute('src');
 updateVisualMode();
}
$('acImagePreview').onclick=async()=>{try{await previewRepositoryImage(await repositoryImage());status('冒頭画像を確認しました。');}catch(e){status(e.status===404?'指定した画像が media/ に見つかりません。':e.message);}};
$('acImage').onchange=()=>{selectImage(null);$('acImagePreview').click();};
function updateVisualMode(){
 const enabled=stock();
 $('acStockControls').hidden=!enabled;$('acFilmedControls').hidden=enabled;
 $('acPreview').hidden=enabled;$('acBackground').hidden=enabled;$('acStockPreview').hidden=!enabled;
 $('acFraming').parentElement.hidden=enabled;
 if(enabled&&Number($('acHook').value)<1)$('acHook').value='3';
 ready();
 repaint();
}
$('acVisualMode').onchange=()=>{updateVisualMode();saveDraft();};
function selectVideo(blob){
 if(url)URL.revokeObjectURL(url);
 if(!blob){file=null;ready();return;}url=URL.createObjectURL(blob);file={blob,duration:NaN};$('acPreview').src=url;$('acBackground').src=url;ready();
 $('acPreview').onloadedmetadata=()=>{file.duration=$('acPreview').duration;status(`${file.duration.toFixed(1)}秒の動画を読み込みました。`);};
}
$('acPreview').ontimeupdate=repaint;
function previewLayout(){const box=$('acPreviewBox');box.classList.toggle('landscape',$('acPreviewFormat').value==='landscape');box.classList.toggle('crop',$('acFraming').value==='crop');paintTextStyle();}
$('acPreviewFormat').onchange=previewLayout;$('acFraming').onchange=previewLayout;
previewLayout();
for(const id of ['acTitle','acArtist','acHook'])$(id).oninput=repaint;
$('acTextFormat').onchange=()=>{if(!lip()){$('acPreviewFormat').value=$('acTextFormat').value;previewLayout();}loadTextFields();};
for(const fields of Object.values(textFields))for(const id of Object.values(fields))$(id).addEventListener('input',()=>{saveTextFields();repaint();});
$('acTextReset').onclick=()=>{const fmt=$('acTextFormat').value;textLayouts[fmt]=textDefaults()[fmt];loadTextFields();saveDraft();repaint();};
$('acTextDrag').onchange=()=>{$('acPreviewBox').classList.toggle('text-edit',$('acTextDrag').checked);};
for(const id of ['acOverlay','acLipTitle']){
 const node=$(id);let dragging=false;
 node.onpointerdown=e=>{if(!$('acTextDrag').checked||!node.textContent)return;dragging=true;node.setPointerCapture(e.pointerId);e.preventDefault();};
 node.onpointermove=e=>{if(!dragging)return;const rect=$('acPreviewBox').getBoundingClientRect(),fmt=$('acPreviewFormat').value,[width,height]=textDimensions(fmt);
  const kind=id==='acLipTitle'||id==='acOverlay'&&!lip()&&val()<Number($('acHook').value)?'hook':'caption';
  textLayouts[fmt][kind].center_x=Math.round(Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*width);
  textLayouts[fmt][kind].center_y=Math.round(Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))*height);
  $('acTextFormat').value=fmt;loadTextFields();saveDraft();repaint();};
 node.onpointerup=node.onpointercancel=()=>{dragging=false;};
}
$('acBuildLines').onclick=buildRows;$('acSubmit').onclick=submit;
async function recover(){
 await reconcilePending(true);
}
$('acRecover').onclick=recover;
let reconciling=false;
async function reconcilePending(resend){
 if(reconciling)return;
 const items=pendingItems();
 if(!items.length){if(resend)status('確認待ちの生成受付はありません。');return;}
 reconciling=true;
 try{
  const runs=await api('actions/workflows/generate_video_ui.yml/runs?per_page=100');
  let found=0,remaining=0;
  for(const item of items){
   const run=runs.workflow_runs.find(r=>r.display_title===`Pages ${item.receipt}`);
   if(run){forgetPending(item);found++;continue;}
   try{
    await api(`git/ref/tags/ui-accepted-${item.receipt}`);
    forgetPending(item);found++;continue;
   }catch(e){if(e.status!==404)throw e;}
   remaining++;
   if(resend){
    await ensureInputRef(item);
    await api('actions/workflows/generate_video_ui.yml/dispatches','POST',{ref:'main',inputs:{receipt_id:item.receipt,input_sha:item.sha,job_kind:'video'}});
   }
  }
  status(found?`受付済み ${found} 件。生成履歴の「更新」で進捗・結果を確認してください。`:
   resend?`同じ受付IDで ${remaining} 件の受付を再依頼しました。少し後に確認してください。`:
   `受付確認中 ${remaining} 件。「前回の受付を確認・再開」で同じIDを確認できます。`);
 }catch(e){status(`受付の照合に失敗しました。受付IDを保持しています。 ${e.message}`);}
 finally{reconciling=false;}
}
if(pendingItems().length)status(`確認待ちの受付が ${pendingItems().length} 件あります。`);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconcilePending(false);});
window.addEventListener('pageshow',()=>reconcilePending(false));
const pendingTimer=setInterval(()=>{if(pendingItems().length&&!document.hidden)reconcilePending(false);},5000);
pendingTimer.unref?.();

let syncPlaying=false;
const full=$('acFullPlayer');
const draftFields=['acTitle','acArtist','acHook','acLyrics','acFraming','acOffset','acClears','acTrimEnd','acMaskKind','acMaskStrength','acMaskStart','acMaskEnd','acMaskKeys','acVisualMode','acImage','acStockPercent','acStockProvider','acStockKeywords'];
const draftKey=()=>`acapella-lip-draft:${repo()}:${$('acMode').value}`;
let audioIdentity=null;
function identity(file){return file?[file.name,file.size,file.lastModified].join(':'):null;}
function saveDraft(){
 const fields=Object.fromEntries(draftFields.map(id=>[id,$(id).value]));
 try{localStorage.setItem(draftKey(),JSON.stringify({fields,textLayouts,audioIdentity,rows:rows.map(row=>[row.text.value,row.start.value,row.end.value])}));}catch{}
}
function restoreDraft(){
 try{
  const draft=JSON.parse(localStorage.getItem(draftKey()));
  if(!draft)return;
  for(const id of draftFields)if(draft.fields[id]!==undefined)$(id).value=draft.fields[id];
   textLayouts=mergeTextLayouts(draft.textLayouts);loadTextFields();
  audioIdentity=draft.audioIdentity;
  buildRows();
  for(const [i,values] of draft.rows.entries()){
   if(!rows[i])break;
   [rows[i].text.value,rows[i].start.value,rows[i].end.value]=values;
  }
 }catch{}
}
function mergeTextLayouts(saved){
 const defaults=textDefaults();
 if(!saved||typeof saved!=='object')return defaults;
 for(const fmt of ['vertical','landscape'])for(const kind of ['hook','caption']){
  if(saved[fmt]?.[kind]&&typeof saved[fmt][kind]==='object')Object.assign(defaults[fmt][kind],saved[fmt][kind]);
 }
 return defaults;
}
function setChorus(file){
 const next=identity(file);
 if(audioIdentity&&audioIdentity!==next){
  $('acOffset').value='0';$('acClears').value='';
  for(const row of rows){row.start.value='';row.end.value='';}
  status('サビ音源を変更しました。映像と歌詞の時刻を再設定してください。');
 }
 audioIdentity=next;
 chorus=file;
 ready();
 saveDraft();
 if(chorusUrl)URL.revokeObjectURL(chorusUrl);
 chorusUrl=URL.createObjectURL(file.slice(0,file.size,'audio/wav'));
 chorusPlayer.src=chorusUrl;
 chorusPlayer.load();
 const link=$('acWavDownload');
 link.href=chorusUrl;link.download=file.name;link.hidden=false;
 $('acWavShare').hidden=!navigator.canShare?.({files:[file]});
}
function cut(){
 if(!decoded)throw Error('先にフル音源を読み込んでください。');
 if(fullMode())return chorusWav(decoded,0,decoded.duration,360);
 return chorusWav(decoded,Number($('acCutStart').value),Number($('acCutEnd').value));
}
$('acMode').onchange=()=>{
 if(project&&previousMode!=='original'){
  const key=previousMode==='full'?'full':'short';
  project.layouts[key]={...project.layouts[key],...projectSnapshot()};
 }
 previousMode=$('acMode').value;
 $('acVisualMode').value='filmed';
 selectImage(null);$('acImage').value='';$('acAutoLink').checked=false;
 $('acCutFields').hidden=fullMode();
 $('acLip').hidden=!lip();$('acPreview').muted=lip();
 $('acHook').min=lip()?'0':'0.1';$('acHook').value=lip()?'0':'3';
 $('acOutput').disabled=lip();$('acPreviewFormat').disabled=lip();
 const videoLabel=$('acFile').parentElement;
 if(lip()){ $('acFilmedControls').insertBefore(videoLabel,$('acOffset').parentElement);$('acPreviewFormat').value=fullMode()?'landscape':'vertical';$('acTextFormat').value=$('acPreviewFormat').value;$('acTextFormat').disabled=true;if(project){file=null;chorus=null;audioIdentity=null;$('acFile').value='';$('acChorus').value='';restoreProjectLayout();if(decoded){if(fullMode())setChorus(chorusWav(decoded,0,decoded.duration,360));else if(project.range)setChorus(chorusWav(decoded,...project.range));}}else restoreDraft();previewLayout();}
 else { $('acPreviewFormat').parentElement.before(videoLabel);$('acTextFormat').disabled=false;chorusPlayer.pause();restoreDraft();}
 loadTextFields();
 updateVisualMode();
 $('acSubmit').textContent=lip()?(fullMode()?'横型フルMVを生成':'縦型サビショートを生成'):'アカペラ動画を生成';
 restorePrepared();
 repaint();
};
$('acFull').onchange=()=>readFull($('acFull').files[0]).catch(e=>status(e.message));
function seekAudio(player,delta){const duration=player.duration;if(!Number.isFinite(duration))return;player.currentTime=Math.min(duration,Math.max(0,player.currentTime+delta));repaint();}
for(const [id,player,delta] of [['acFullBack',full,-5],['acFullForward',full,5],['acChorusBack',chorusPlayer,-5],['acChorusForward',chorusPlayer,5]])$(id).onclick=()=>seekAudio(player,delta);
async function readFull(f){
 decoded=null;
 if(!f)return;
  if(!/\.(mp3|wav|m4a)$/i.test(f.name))throw Error('MP3、WAV、M4Aを選択してください。');
  if(f.size>100_000_000)throw Error('フル音源は100 MB以下にしてください。');
  if(fullUrl)URL.revokeObjectURL(fullUrl);
  fullUrl=URL.createObjectURL(f);full.src=fullUrl;
  const context=new OfflineAudioContext(2,1,44100);
  const buffer=await context.decodeAudioData(await f.arrayBuffer());
  if(buffer.duration>600)throw Error('フル音源は10分以下にしてください。');
  if(project?.audio){
   const digest=await crypto.subtle.digest('SHA-256',await f.arrayBuffer());
   const sha=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
   if(sha!==project.audio.sha256)throw Error('保存済みのフル音源と一致しません。');
  }
  projectAudio=f;decoded=buffer;
  if(fullMode())setChorus(chorusWav(buffer,0,buffer.duration,360));
  else if(project?.range)setChorus(chorusWav(buffer,...project.range));
  if(!project?.range)$('acCutEnd').value=Math.min(60,buffer.duration);
  const canvas=$('acWave'), ctx=canvas.getContext('2d'), data=buffer.getChannelData(0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for(let x=0;x<canvas.width;x++){
   const begin=Math.floor(x*data.length/canvas.width), end=Math.floor((x+1)*data.length/canvas.width);
   let peak=0;
   for(let i=begin;i<end;i+=16)peak=Math.max(peak,Math.abs(data[i]));
   ctx.fillRect(x,32-peak*30,1,Math.max(1,peak*60));
  }
  status('音源を読み込みました。開始と終了を指定してください。');
}
$('acWave').onclick=e=>{if(decoded)full.currentTime=e.offsetX/$('acWave').clientWidth*decoded.duration;};
$('acCutMarkStart').onclick=()=>$('acCutStart').value=full.currentTime.toFixed(3);
$('acCutMarkEnd').onclick=()=>$('acCutEnd').value=full.currentTime.toFixed(3);
full.ontimeupdate=()=>{if(previewEnd!==null&&full.currentTime>=previewEnd){full.pause();previewEnd=null;}};
$('acCutPreview').onclick=async()=>{try{
 const start=Number($('acCutStart').value),end=Number($('acCutEnd').value);
 if(!decoded||!(start>=0&&end>start&&end<=decoded.duration&&end-start<=120))throw Error('切り出し範囲を確認してください。');
 full.currentTime=start;previewEnd=end;await full.play();
}catch(e){status(e.message);}};
const cutStatus=message=>{$('acCutStatus').textContent=message;};
$('acCutSave').onclick=()=>{
 try{
  setChorus(cut());
  cutStatus('サビを確定しました。このまま動画制作に進めます。端末に保存する場合は下のボタンを使ってください。');
 }catch(e){cutStatus(e.message);}
};
$('acWavShare').onclick=async()=>{
 try{if(chorus)await navigator.share({files:[chorus]});}
 catch(e){if(e.name!=='AbortError')cutStatus('共有できませんでした。「WAVをダウンロード」を使ってください。');}
};
chorusPlayer.addEventListener('error',()=>{
 if(chorus)cutStatus('サビWAVを再生できません。WAVをダウンロードして端末で再生できるか確認してください。');
});
$('acChorus').onchange=()=>{const selected=$('acChorus').files[0];if(selected)setChorus(selected);};
$('acMarkOffset').onclick=()=>{$('acOffset').value=$('acPreview').currentTime.toFixed(2);};
chorusPlayer.onplay=()=>{
 if(!lip())return;
 syncPlaying=true;const video=$('acPreview');video.currentTime=offset()+val();
 video.play().catch(()=>{});repaint();
};
chorusPlayer.onpause=repaint;
chorusPlayer.onseeked=()=>{if(lip()&&file)$('acPreview').currentTime=offset()+val();repaint();};
chorusPlayer.ontimeupdate=repaint;
$('acNextLyric').onclick=()=>{
 const row=rows.find(r=>r.start.value==='');
 if(row)row.start.value=val().toFixed(3);
 repaint();
};
$('acClearLyric').onclick=()=>{
 const field=$('acClears');field.value=[field.value,val().toFixed(3)].filter(Boolean).join(',');
 repaint();
};
function chorusWav(buffer, start, end, limit=120) {
 const rate=buffer.sampleRate, first=Math.round(start*rate), last=Math.round(end*rate);
 if(!Number.isFinite(first)||!Number.isFinite(last)||first<0||last<=first||last>buffer.length||last-first>limit*rate)
  throw Error(`${limit}秒以内の音源範囲を指定してください。`);
 const channels=Array.from({length:Math.min(buffer.numberOfChannels,2)},(_,i)=>buffer.getChannelData(i));
 const size=(last-first)*channels.length*2, bytes=new ArrayBuffer(44+size), view=new DataView(bytes);
 const tag=(offset,value)=>[...value].forEach((char,i)=>view.setUint8(offset+i,char.charCodeAt(0)));
 tag(0,'RIFF');view.setUint32(4,size+36,true);tag(8,'WAVE');tag(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels.length,true);
 view.setUint32(24,rate,true);view.setUint32(28,rate*channels.length*2,true);
 view.setUint16(32,channels.length*2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,size,true);
 let position=44;
 for(let i=first;i<last;i++)for(const channel of channels){
  view.setInt16(position,Math.max(-32768,Math.min(32767,Math.round(channel[i]*32768))),true);
  position+=2;
 }
 return new File([bytes],'chorus.wav',{type:'audio/wav'});
}

function lyricIntervals(lines, clears, duration) {
 let previous=-1;
 return lines.map((line,i)=>{
  const start=line.start_ms;
  const boundary=Math.min(lines[i+1]?.start_ms??duration,...clears.filter(time=>time>start),duration);
  const end=line.end_ms??boundary;
  if(!Number.isInteger(start)||start<0||start<=previous||!Number.isInteger(end)||end<=start||end>boundary||!line.text)
   throw Error(`歌詞 ${i+1} 行目の表示時刻を確認してください。`);
  previous=start;
  return {text:line.text,start_ms:start,end_ms:end};
 });
}

$('acapellaArea').addEventListener('input',()=>{saveDraft();ready();repaint();});
$('acapellaArea').addEventListener('click',saveDraft);

let project=null, projectSha=null, projectAudio=null, previousMode='original';
const projectDir='contents/config/music-projects';
async function assetHash(file){
 const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
async function downloadProjectAsset(asset){
 const id=asset.public_id.split('/').at(-1);
 const pair=await keyPair();
 const signed=await decrypt(await permission(id,{bytes:asset.bytes,sha256:asset.sha256,format:asset.format,download:true},pair),pair.privateKey);
 const response=await fetch(signed.download_url);
 if(!response.ok)throw Error('保存済みの音源を取得できません。元のファイルを選択してください。');
 const restored=new File([await response.blob()],asset.name);
 if(await assetHash(restored)!==asset.sha256)throw Error('保存済み素材の照合に失敗しました。');
 return restored;
}

const projectFile=id=>`${projectDir}/${id}.json`;
const projectFields=[...draftFields,'acCutStart','acCutEnd','acCandidate'];
const layoutKey=()=>fullMode()?'full':'short';
function projectSnapshot(){
 return {fields:Object.fromEntries(projectFields.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value])),
   textLayouts:structuredClone(textLayouts),rows:rows.map(row=>[row.text.value,row.start.value,row.end.value])};
}
function applySnapshot(snapshot){
 textLayouts=mergeTextLayouts(snapshot?.textLayouts);loadTextFields();
 for(const id of projectFields){
  const field=$(id),value=snapshot?.fields?.[id];
  if(field.type==='checkbox')field.checked=!!value;
 else field.value=value??({acHook:'0',acOffset:'0',acCutStart:'0',acMaskStrength:'8',acMaskStart:'0',acFraming:'contain_blur',acVisualMode:'filmed',acStockPercent:'50',acStockProvider:'pexels'}[id]??'');
 }
 buildRows();
 for(const [i,values] of (snapshot?.rows??[]).entries()){
  if(rows[i])[rows[i].text.value,rows[i].start.value,rows[i].end.value]=values;
 }
 updateVisualMode();
}
function restoreProjectLayout(){
 const saved=project?.layouts?.[layoutKey()];
 applySnapshot(saved);
 if(stock()&&saved?.image?.path)previewRepositoryImage(saved.image).catch(e=>status(e.message));
 if(!project)return;
 $('acTitle').value=project.title;
 $('acArtist').value=project.artist;
 $('acCandidate').checked=project.candidate;
 if(project.range){$('acCutStart').value=project.range[0];$('acCutEnd').value=project.range[1];}
 if(fullMode()&&!saved&&project.lyrics?.length){
  $('acLyrics').value=project.lyrics.map(line=>line.text).join('\n');
  buildRows();
  project.lyrics.forEach((line,i)=>{rows[i].start.value=line.start_ms/1000;rows[i].end.value=line.end_ms/1000;});
 }
 renderProjectHistory();
}
const runList=value=>Array.isArray(value)?value:value?[value]:[];
async function postingState(path){
 try{
  const result=await api(path);
  return JSON.parse(new TextDecoder().decode(bytes(result.content.replace(/\s/g,''))));
 }catch{return {};}
}
async function renderProjectHistory(){
 const history=$('acProjectHistory'), current=project;
 history.replaceChildren();
 if(!current||!Object.keys(current.runs??{}).length)return;
 const [shorts,youtube]=await Promise.all([
  postingState('contents/state.json?ref=social-state'),
  postingState('contents/view.json?ref=youtube-state')
 ]);
 if(project!==current)return;
 const labels={published:'公開済み',scheduled:'予約済み',private_ready:'非公開',ready:'未送信',failed:'失敗',waiting:'予約枠待ち'};
 const services={tiktok:'TikTok',instagram:'Instagramリール',youtube:'YouTubeショート'};
 for(const [layout,receipts] of Object.entries(project?.runs??{}))for(const receipt of runList(receipts)){
  const link=document.createElement('a');
  link.href=`https://github.com/${repo()}/actions?query=${encodeURIComponent(receipt)}`;
  link.textContent=layout==='full'?'横型の生成受付':'縦型の生成受付';
  history.append(link,document.createTextNode(' '));
  const state=layout==='full'?youtube:shorts;
  const videos=Object.values(state.videos??{}).filter(v=>v.receipt_id===receipt);
  const ids=new Set(videos.map(v=>v.id));
  const posts=Object.values(layout==='full'?(state.uploads??{}):(state.posts??{}))
   .filter(post=>ids.has(layout==='full'?post.source_id:post.video_id));
  for(const post of posts){
   const name=layout==='full'?'YouTube通常動画':(services[post.service]??post.service);
   const label=`${name} ${labels[post.status]??post.status}`;
   const url=layout==='full'&&post.status==='published'&&/^[\w-]{11}$/.test(post.video_id)
    ?`https://www.youtube.com/watch?v=${post.video_id}`:post.published_url;
   if(/^https:\/\//.test(url??'')){
    const published=document.createElement('a');published.href=url;published.textContent=label;history.append(published);
   }else history.append(document.createTextNode(label));
   history.append(document.createTextNode(' '));
  }
  if(!posts.length)history.append(document.createTextNode(videos.length?'投稿管理に登録済み ':'生成履歴で確認 '));
  history.append(document.createElement('br'));
 }
}
async function saveProject(){
 const repository=await api('');
 if(!repository.private)throw Error('非公開リポジトリへ接続してください。');
 const title=$('acTitle').value.trim();
 if(!title)throw Error('曲名を入力してください。');
 const next=structuredClone(project??{version:1,id:crypto.randomUUID(),layouts:{},lyrics:[],runs:{}});
 next.title=title;next.artist=$('acArtist').value.trim();next.candidate=$('acCandidate').checked;
 next.layouts[layoutKey()]={...next.layouts[layoutKey()],...projectSnapshot()};
 if(!stock()&&file?.blob){
  const videoMeta=await fileMeta(file.blob);
  if(next.layouts[layoutKey()].video?.sha256!==videoMeta.sha256){
   const id=crypto.randomUUID().replaceAll('-','');
   await transferSource(file.blob,id,videoMeta,await keyPair());
   next.layouts[layoutKey()].video={...videoMeta,name:file.blob.name,public_id:`v-generator/acapella/${id}`};
  }
 }
 if(stock())next.layouts[layoutKey()].image={...await repositoryImage(),name:imageName()};
 const start=Number($('acCutStart').value),end=Number($('acCutEnd').value);
 if(end>start&&start>=0&&end-start<=120)next.range=[start,end];
 if(chorus&&rows.length&&rows.every(row=>row.start.value!=='')){
  const shift=fullMode()?0:Math.round(start*1000);
  const timed=compiledLyrics().map(line=>({...line,start_ms:line.start_ms+shift,end_ms:line.end_ms+shift}));
  next.lyrics=fullMode()?timed:[...next.lyrics.filter(line=>line.end_ms<=shift||line.start_ms>=Math.round(end*1000)),...timed].sort((a,b)=>a.start_ms-b.start_ms);
 }
 if(projectAudio&&!next.audio?.public_id){
  const format=projectAudio.name.split('.').at(-1).toLowerCase();
  const meta={format,bytes:projectAudio.size,sha256:await assetHash(projectAudio)};
  const id=crypto.randomUUID().replaceAll('-','');
  await transferSource(projectAudio,id,meta,await keyPair());
  next.audio={...meta,name:projectAudio.name,public_id:`v-generator/acapella/${id}`};
 }
 const data=new TextEncoder().encode(JSON.stringify(next));
 let binary='';
 for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));
 const response=await api(projectFile(next.id),'PUT',{message:'Save music project',content:btoa(binary),...(projectSha?{sha:projectSha}:{})});
 project=next;projectSha=response.content.sha;
 const select=$('acProjects');
 let option=Array.from(select.options).find(item=>item.value===next.id);
 if(!option){option=new Option('',next.id);select.add(option);}
 option.textContent=next.title+(next.candidate?'（フルMV候補）':'');select.value=next.id;
 renderProjectHistory();
}
$('acProjectSave').onclick=async()=>{try{await saveProject();status('曲プロジェクトを保存しました。');}catch(e){status(e.message);}};
$('acProjectList').onclick=async()=>{try{
 let files=[];
 try{files=await api(projectDir);}catch(e){if(e.status!==404)throw e;}
 const entries=await Promise.all(files.filter(f=>/^[a-f0-9-]{36}\.json$/.test(f.name)).map(async f=>{
  const result=await api(projectFile(f.name.slice(0,-5)));
  return JSON.parse(new TextDecoder().decode(bytes(result.content.replace(/\s/g,''))));
 }));
 $('acProjects').replaceChildren(new Option('新規',''),...entries.map(p=>new Option(p.title+(p.candidate?'（フルMV候補）':''),p.id)));
 $('acProjects').value=project?.id??'';
 status(`${entries.length}曲を読み込みました。`);
}catch(e){status(e.message);}};
$('acProjects').onchange=async()=>{try{
 const id=$('acProjects').value;
 const entry=id?await api(projectFile(id)):null;
 project=entry?JSON.parse(new TextDecoder().decode(bytes(entry.content.replace(/\s/g,'')))):null;
 projectSha=entry?.sha??null;projectAudio=null;decoded=null;chorus=null;file=null;imageFile=null;audioIdentity=null;
 $('acWavDownload').hidden=true;$('acWavShare').hidden=true;cutStatus('');
 for(const field of ['acFile','acImage','acFull','acChorus'])$(field).value='';
 $('acAutoLink').checked=false;selectImage(null);
 for(const media of [$('acPreview'),$('acBackground'),full,chorusPlayer]){media.pause();media.removeAttribute('src');media.load();}
 restoreProjectLayout();
 ready();
 if(project?.audio?.public_id){
  status('保存済みのフル音源を取得しています。');
  await readFull(await downloadProjectAsset(project.audio));
  const layout=project.layouts?.[layoutKey()]??{};
  if(stock()&&layout.image?.public_id){
   selectImage(await downloadProjectAsset(layout.image));
   status('旧方式の画像を表示しています。新規生成には同じ画像を media/ に登録してファイル名を入力してください。');
  }
  else if(!stock()&&layout.video)selectVideo(await downloadProjectAsset(layout.video));
 }else status(project?.audio?`フル音源「${project.audio.name}」を再選択してください。`:'曲の情報と素材を選択してください。');
}catch(e){status(e.message);}};

const maskCanvas=$('acMaskPreview');
maskCanvas.style.touchAction='none';
const numberMs=id=>$(id).value===''?null:Math.round(Number($(id).value)*1000);
let dragStart=null,dragMask=null,compareMask=false;
function readMask(duration){
 const kind=$('acMaskKind').value;
 if(!kind)return null;
 const start_ms=numberMs('acMaskStart')??0,end_ms=numberMs('acMaskEnd')??Math.round(duration*1000);
 const strength=Number($('acMaskStrength').value);
 const keys=$('acMaskKeys').value.split('\n').filter(line=>line.trim()).map(line=>line.split(',').map((v,i)=>v.trim()?Math.round(Number(v)*(i?100:1000)):NaN));
 if(!Number.isInteger(strength)||strength<1||strength>10||!(start_ms>=0&&end_ms>start_ms&&end_ms<=duration*1000+1)||!keys.length||keys.length>60||
 keys.some(([t,x,y,w,h,...rest],i)=>rest.length||![t,x,y,w,h].every(Number.isInteger)||t<start_ms||t>end_ms||(i&&t<=keys[i-1][0])||x<0||y<0||w<=0||h<=0||x+w>10000||y+h>10000))
  throw Error('顔モザイクの枠・適用時刻・強度を確認してください。');
 return {kind,strength,start_ms,end_ms,keys};
}
function paintMask(){
 if(!maskCanvas?.offsetWidth)return;
 const video=$('acPreview');
 if(!video.videoWidth||video.readyState<2)return;
 maskCanvas.height=Math.round(maskCanvas.width*video.videoHeight/video.videoWidth);
 const ctx=maskCanvas.getContext('2d'), W=maskCanvas.width,H=maskCanvas.height;
 ctx.drawImage(video,0,0,W,H);
 let currentRect=null;
 try{
  const mask=readMask(chorusPlayer.duration);
  const time=(video.currentTime-offset())*1000;
  if(mask&&time>=mask.start_ms&&time<mask.end_ms){
   const i=mask.keys.findIndex(k=>k[0]>time);
   const a=mask.keys[i<0?mask.keys.length-1:Math.max(0,i-1)],b=mask.keys[i<0?mask.keys.length-1:i];
   const fraction=a===b?0:(time-a[0])/(b[0]-a[0]);
   const [x,y,w,h]=a.slice(1).map((v,n)=>(v+(b[n+1]-v)*fraction)*(n%2?H:W)/10000);
   currentRect={x,y,w,h};
   if(!compareMask){
    if(mask.kind==='black'){ctx.fillStyle='black';ctx.fillRect(x,y,w,h);}
    else{
     ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
     if(mask.kind==='blur'){ctx.filter=`blur(${mask.strength*2}px)`;ctx.drawImage(video,0,0,W,H);}
     else{
      const small=document.createElement('canvas');small.width=Math.max(1,Math.round(W/(mask.strength*2+2)));small.height=Math.max(1,Math.round(H/(mask.strength*2+2)));
      small.getContext('2d').drawImage(video,0,0,small.width,small.height);
      ctx.imageSmoothingEnabled=false;ctx.drawImage(small,0,0,W,H);
     }
     ctx.restore();
    }
   }
  }
  $('acMaskNow').textContent=`映像 ${video.currentTime.toFixed(2)}秒／完成動画 ${Math.max(0,time/1000).toFixed(2)}秒：${mask?(currentRect?'枠を表示中':'適用時間外'):'枠未設定'}。記録済み ${mask?.keys.length||0}件`;
 }catch{$('acMaskNow').textContent='モザイクの枠・適用時刻を確認してください。';}
 const outline=dragMask||currentRect;
 if(outline){ctx.save();ctx.strokeStyle='#00f5bd';ctx.lineWidth=Math.max(3,W/120);ctx.strokeRect(outline.x,outline.y,outline.w,outline.h);ctx.fillStyle='#00f5bd';ctx.fillRect(outline.x+outline.w-7,outline.y+outline.h-7,14,14);ctx.restore();}
}
function maskPoint(event){
 const box=maskCanvas.getBoundingClientRect();
 return [Math.min(100,Math.max(0,(event.clientX-box.left)/box.width*100)),Math.min(100,Math.max(0,(event.clientY-box.top)/box.height*100))];
}
maskCanvas.onpointerdown=event=>{
 if(!$('acPreview').videoWidth)return;
 event.preventDefault();maskCanvas.setPointerCapture(event.pointerId);
 const [px,py]=maskPoint(event),x=px/100*maskCanvas.width,y=py/100*maskCanvas.height;
 let rect=null;try{const mask=readMask(chorusPlayer.duration),time=($('acPreview').currentTime-offset())*1000;
  if(mask&&time>=mask.start_ms&&time<mask.end_ms){const i=mask.keys.findIndex(k=>k[0]>time),a=mask.keys[i<0?mask.keys.length-1:Math.max(0,i-1)],b=mask.keys[i<0?mask.keys.length-1:i],fraction=a===b?0:(time-a[0])/(b[0]-a[0]);
   const [rx,ry,rw,rh]=a.slice(1).map((v,n)=>(v+(b[n+1]-v)*fraction)*(n%2?maskCanvas.height:maskCanvas.width)/10000);rect={x:rx,y:ry,w:rw,h:rh};}}
 catch{}
 const corner=rect&&Math.abs(x-(rect.x+rect.w))<25&&Math.abs(y-(rect.y+rect.h))<25;
 const inside=rect&&x>=rect.x&&x<=rect.x+rect.w&&y>=rect.y&&y<=rect.y+rect.h;
 dragStart={x,y,rect,mode:corner?'resize':inside?'move':'new'};
};
maskCanvas.onpointermove=event=>{
 if(!dragStart)return;
 const [px,py]=maskPoint(event),x=px/100*maskCanvas.width,y=py/100*maskCanvas.height;
 const start=dragStart,base=start.rect;
 if(start.mode==='move')dragMask={x:Math.max(0,Math.min(maskCanvas.width-base.w,base.x+x-start.x)),y:Math.max(0,Math.min(maskCanvas.height-base.h,base.y+y-start.y)),w:base.w,h:base.h};
 else if(start.mode==='resize')dragMask={x:base.x,y:base.y,w:Math.max(1,Math.min(maskCanvas.width-base.x,x-base.x)),h:Math.max(1,Math.min(maskCanvas.height-base.y,y-base.y))};
 else dragMask={x:Math.min(start.x,x),y:Math.min(start.y,y),w:Math.abs(x-start.x),h:Math.abs(y-start.y)};
 paintMask();
};
maskCanvas.onpointerup=event=>{
 if(!dragStart)return;
 maskCanvas.onpointermove(event);
 const frame=dragMask;dragStart=null;dragMask=null;
 if(!frame)return;
 const time=Math.max(0,$('acPreview').currentTime-offset()).toFixed(3);
 const values=[frame.x/maskCanvas.width*100,frame.y/maskCanvas.height*100,frame.w/maskCanvas.width*100,frame.h/maskCanvas.height*100].map(v=>v.toFixed(2));
 if(Number(values[2])<.1||Number(values[3])<.1)return;
 const field=$('acMaskKeys');
 field.value=[...field.value.split('\n').filter(line=>line.trim()&&Number(line.split(',')[0])!==Number(time)),[time,...values].join(',')].sort((a,b)=>Number(a.split(',')[0])-Number(b.split(',')[0])).join('\n');
 if(!$('acMaskKind').value)$('acMaskKind').value='pixel';
 saveDraft();repaint();
};
maskCanvas.onpointercancel=()=>{dragStart=null;dragMask=null;paintMask();};
$('acMaskDelete').onclick=()=>{
 const time=Math.max(0,$('acPreview').currentTime-offset());
 const lines=$('acMaskKeys').value.split('\n').filter(Boolean),index=lines.findIndex(line=>Math.abs(Number(line.split(',')[0])-time)<.51);
 if(index<0){$('acMaskNow').textContent='現在位置の前後0.5秒に記録された枠がありません。';return;}
 lines.splice(index,1);$('acMaskKeys').value=lines.join('\n');saveDraft();paintMask();
};
$('acMaskBefore').onclick=()=>{compareMask=!compareMask;$('acMaskBefore').textContent=compareMask?'モザイク表示に戻す':'元映像と比較';paintMask();};
function maskControls(){const hidden=!$('acMaskKind').value||$('acMaskKind').value==='black';$('acMaskStrength').parentElement.hidden=hidden;paintMask();}
$('acMaskKind').addEventListener('change',maskControls);
$('acMaskStrength').addEventListener('input',paintMask);
maskControls();
$('acMarkTrimEnd').onclick=()=>{$('acTrimEnd').value=$('acPreview').currentTime.toFixed(2);};
$('acPlayTrim').onclick=async()=>{
 try{
  if(!file||!Number.isFinite(chorusPlayer.duration))throw Error('撮影映像と曲を選択してください。');
  const end=numberMs('acTrimEnd')??file.duration*1000;
  if(end>file.duration*1000+1||offset()+chorusPlayer.duration>end/1000+.001)
   throw Error('選択した映像範囲が曲の長さに合いません。');
  chorusPlayer.currentTime=0;await chorusPlayer.play();
 }catch(e){status(e.message);}
};
$('acPreview').addEventListener('seeked',paintMask);
$('acPreview').addEventListener('loadeddata',paintMask);
maskCanvas.closest('details').addEventListener('toggle',paintMask);

const standardAreas=['pbSaveSection','autoLinkArea','pbSingleNarration','audioUpload','promptBuilder','pbSingleScript','standardGenerate'];
let shownMode='standard';
function showProductionMode(){
 const mode=$('productionMode').value,ac=mode!=='standard';
 $('acapellaArea').hidden=!ac;
 for(const id of standardAreas)$(id).hidden=ac;
 if(ac){$('acapellaArea').querySelector('details').open=true;if(shownMode!==mode){$('acMode').value=mode;$('acMode').dispatchEvent(new Event('change'));}}
 shownMode=mode;
}
$('productionMode').onchange=showProductionMode;
showProductionMode();
restorePrepared();

