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
 $('acSubmit').disabled=busy;
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
let confirmedCut=null;
const selectedCut=()=>`${$('acCutStart').value}:${$('acCutEnd').value}`;
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
  if(kind==='hook'&&$('acReleaseLabel').value.trim())parts.push($('acReleaseLabel').value.trim());
  let effective=style.font_size;
  const context=document.createElement('canvas').getContext?.('2d');
  const measure=(part,size)=>{if(context){context.font=`700 ${size}px sans-serif`;return context.measureText(part).width+6;}return part.length*size;};
  while(parts.some((part,index)=>measure(part,effective*(kind==='hook'&&index===parts.length-1&&$('acReleaseLabel').value.trim()?.6:1))>width*style.max_width_ratio)&&effective>16)effective-=2;
  actual.push(`${kind==='hook'?'フック':'歌詞'} ${effective}px${effective<style.font_size?'（幅に合わせ縮小）':''}`);
  node.style.left=`${style.center_x/width*100}%`;node.style.top=`${style.center_y/height*100}%`;
  node.style.maxWidth=`${style.max_width_ratio*100}%`;node.style.width=`${style.max_width_ratio*100}%`;
  node.style.fontSize=`${Math.max(12,effective*scale)}px`;
  node.style.whiteSpace=kind==='hook'&&style.lines==='double'?'pre-line':'nowrap';
  if(kind==='hook')node.dataset.releaseLabel=$('acReleaseLabel').value.trim();else delete node.dataset.releaseLabel;
  if(kind==='hook'&&style.lines==='double')node.textContent=node.textContent.replace(' / ','\n');
 }
 const hook=slot.hook,caption=slot.caption;
 $('acTextStatus').textContent=`${fmt==='vertical'?'縦型':'横型'}：設定 フック ${hook.font_size}px・歌詞 ${caption.font_size}px。表示目安 ${actual.join('／')}。端末と生成環境のフォント差は完成動画で確認してください。`;
}
function val(){if(lip())return chorusPlayer.currentTime;return Number($('acPreview').currentTime||0);}
function repaint(){
 paintLyricRows();
 if(lip()&&chorus&&file&&!stock()){
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
let builtLyrics;
function updateLyricNumbers(){
 const lines=$('acLyrics').value.split('\n');
 let number=0;
 $('acLyricNumbers').textContent=lines.map(line=>line.trim()?String(++number):' ').join('\n');
 $('acLyricNumbers').scrollTop=$('acLyrics').scrollTop;
}
$('acLyrics').addEventListener('input',updateLyricNumbers);
$('acLyrics').addEventListener('scroll',()=>{$('acLyricNumbers').scrollTop=$('acLyrics').scrollTop;});
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{$('acLyricNumbers').style.height=`${$('acLyrics').offsetHeight}px`;}).observe($('acLyrics'));
function focusLyricError(message){
 const match=String(message).match(/歌詞\s*(\d+)\s*行目/);
 if(!match)return;
 const row=rows[Number(match[1])-1];if(!row)return;
 editorStep=1;furthestStep=Math.max(furthestStep,1);updateEditor();
 rows.forEach(item=>item.box.classList.remove('ac-line-error'));
 row.box.classList.add('ac-line-error');row.box.querySelector('details').open=true;
 row.box.scrollIntoView({block:'center'});row.start.focus();
}
function buildRows(){
 builtLyrics=$('acLyrics').value;
 updateLyricNumbers();
 const root=$('acLines');root.replaceChildren();rows=[];
 for(const line of $('acLyrics').value.split('\n').map(s=>s.trim()).filter(Boolean)){
  const number=rows.length+1;
  const box=document.createElement('div');box.className='ac-line';
  const numberLabel=document.createElement('strong');numberLabel.className='ac-line-number';numberLabel.textContent=`${number}行目`;
  const text=document.createElement('input');text.value=line;text.setAttribute('aria-label',`${number}行目の歌詞`);
  const start=document.createElement('input');start.type='number';start.step='.01';start.min='0';start.value='';start.setAttribute('aria-label','開始秒');
  const end=document.createElement('input');end.type='number';end.step='.01';end.min='0';end.value='';end.setAttribute('aria-label','終了秒');
  const a=document.createElement('button');a.type='button';a.textContent='開始を記録';a.className='secondary';a.onclick=()=>{start.value=val().toFixed(2);saveDraft();repaint();};
  const z=document.createElement('button');z.type='button';z.textContent='終了を記録';z.className='secondary';z.onclick=()=>{end.value=val().toFixed(2);saveDraft();repaint();};
  const seek=document.createElement('button');seek.type='button';seek.textContent='この行から再生';seek.className='secondary';
  seek.onclick=()=>{if(start.value==='')return;const player=lip()?chorusPlayer:$('acPreview');
   player.currentTime=Number(start.value);player.play().catch(e=>status(e.message));};
  const timing=document.createElement('details');
  const label=document.createElement('summary');label.textContent='歌詞の時刻';
  timing.append(label,start,end,a,z);box.append(numberLabel,text,seek,timing);root.append(box);
  rows.push({text,start,end,box,label,seek});
 }

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
 if(builtLyrics!==$('acLyrics').value)throw Error('歌詞が変更されました。歌詞を自動同期してください。');
 validateLocalText();
 const title=$('acTitle').value.trim(),artist=$('acArtist').value.trim(),releaseLabel=$('acReleaseLabel').value.trim(),end=Math.round(Number($('acHook').value)*1000);
 if(releaseLabel.length>40||[...releaseLabel].some(c=>c.charCodeAt(0)<32))throw Error('リリース表記は40文字以内で入力してください。');
 const lyrics=lip()?compiledLyrics():rows.map(r=>({start_ms:Math.round(Number(r.start.value)*1000),end_ms:Math.round(Number(r.end.value)*1000),text:r.text.value.trim()}));
 const output=lip()?(fullMode()?'horizontal_only':'vertical_only'):$('acOutput').value,framing=$('acFraming').value;
 const result={schema_version:1,production_type:'acapella',title,artist,...(releaseLabel?{release_label:releaseLabel}:{}),hook_end_ms:end,lyrics,
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
 if(rows.some(row=>row.start.value===''||row.end.value===''))throw Error('各行の開始・終了を設定してください。');
 for(const [i,line] of lyrics.entries()){if(!line.text||line.start_ms<previous||line.end_ms<=line.start_ms||line.end_ms>file.duration*1000+50)throw Error(`歌詞 ${i+1} 行目の時刻が重複または動画の範囲外です。`);previous=line.end_ms;}
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
 if(busy)return false;busy=true;ready();
 status('素材を転送しています。この画面を開いたままお待ちください。');
 try{
  const mode=$('acMode').value,visual=stock();
  if(!stock()&&!file)throw Error('先に動画を選択してください。');
  const videoFile=stock()?null:file.blob,audioFile=chorus;
  const meta=stock()?await repositoryImage():await fileMeta(videoFile);
  const audioMeta=lip()?await fileMeta(audioFile,true):null;
  const saved=JSON.parse(localStorage.getItem(`acapella-transfer:${repo()}:${$('acMode').value}`)||'null');
  const existing=lip()&&!stock()?project?.layouts?.[layoutKey()]?.video:null;
  const savedVideo=existing?.sha256===meta.sha256?existing:null;
  const id=savedVideo?.public_id.split('/').at(-1)??(saved && meta.sha256 && saved.videoSha===meta.sha256?saved.videoId:null)??lyricSource(meta)?.id??crypto.randomUUID().replaceAll('-','');
  const payload=script(id,meta);
  const repository=await api('');if(!repository.private)throw Error('非公開リポジトリへ接続してください。');
  const audioId=lip()?(saved?.audioSha===audioMeta.sha256?saved.audioId:lyricSource(audioMeta)?.id??crypto.randomUUID().replaceAll('-','')):null;
  const retryKey=`acapella-transfer:${repo()}:${$('acMode').value}`;
  localStorage.setItem(retryKey,JSON.stringify({videoSha:meta.sha256,videoId:id,audioSha:audioMeta?.sha256,audioId}));
  const pair=await keyPair();
  if(!stock()&&!savedVideo&&id!==lyricSource(meta)?.id)await transferSource(videoFile,id,meta,pair);
  if(lip()&&audioId!==lyricSource(audioMeta)?.id)await transferSource(audioFile,audioId,audioMeta,pair);
  if(mode!==$('acMode').value||visual!==stock()||identity(videoFile)!==identity(file?.blob)||
     (lip()&&identity(audioFile)!==identity(chorus)))
   throw Error('準備中に素材または制作モードが変わりました。もう一度準備してください。');
  prepared={mode:$('acMode').value,stock:stock(),imageName:stock()?imageName():null,
   videoIdentity:identity(videoFile),audioIdentity:identity(audioFile),meta,id,
   audioMeta,audioId,preparedAt:Date.now()};
  if(lip())payload.audio_source={...audioMeta,public_id:`v-generator/acapella/${audioId}`};
  localStorage.setItem(preparedKey(),JSON.stringify(prepared));
  localStorage.removeItem(retryKey);
  return true;
 }catch(e){prepared=null;localStorage.removeItem(preparedKey());status(`素材の準備が完了していません。 ${e.message}`);}
 finally{busy=false;ready();}
 return false;
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
const lyricJobKey=()=>`acapella-lyric-job:${repo()}:${$('acMode').value}`;
const lyricSourceKey=sha=>`acapella-lyric-source:${repo()}:${sha}`;
function lyricSource(meta){
 try{
  const item=JSON.parse(localStorage.getItem(lyricSourceKey(meta.sha256))||'null');
  return item?.sha===meta.sha256?item:null;
 }catch{return null;}
}
function lyricInput(){
 const pasted=$('acLyrics').value.split('\n').map(line=>line.trim()).filter(Boolean);
 return builtLyrics===$('acLyrics').value&&rows.length===pasted.length?rows.map(row=>row.text.value.trim()):pasted;
}
function currentLyricMedia(){
 return lip()?{blob:chorus,duration:chorusPlayer.duration}:{blob:file?.blob,duration:file?.duration};
}
async function checkLyricResult(key, {receipt, sha, signature, lines, input, requestedAt}, wait){
 for(let attempt=0;attempt<(wait?80:1);attempt++){
  try{
   const data=await api(`contents/lyric-preview.json?ref=ui-preview%2F${receipt}`);
   const timings=JSON.parse(new TextDecoder().decode(bytes(data.content.replace(/\s/g,''))));
   if(key!==lyricJobKey())throw Error('照合した制作モードに戻って確認してください。');
   if(input!==JSON.stringify(lyricInput())){
    localStorage.removeItem(key);
    throw Error('歌詞が変わりました。現在の歌詞で自動設定をやり直してください。');
   }
   const media=currentLyricMedia();
   if(!media.blob)throw Error('照合時の動画または音源を選択してください。');
   if((await fileMeta(media.blob,lip())).sha256!==signature){
    localStorage.removeItem(key);
    throw Error('素材が変わりました。現在の素材で自動設定をやり直してください。');
   }
   if(key!==lyricJobKey()||media.blob!==currentLyricMedia().blob||input!==JSON.stringify(lyricInput()))
    throw Error('制作モード・素材・歌詞が変更されました。もう一度確認してください。');
   if(timings.length!==lines.length||timings.some((line,i)=>line.text!==lines[i]))
    throw Error('照合結果の歌詞が一致しません。');
   if(builtLyrics!==$('acLyrics').value)buildRows();
   let matched=0;
   for(const [i,line] of timings.entries()){
    if(line.start_ms===undefined){rows[i].start.value='';rows[i].end.value='';continue;}
    rows[i].start.value=line.start_ms/1000;
    rows[i].end.value=Math.min(line.end_ms,Math.floor(media.duration*1000))/1000;
    matched++;
   }
   saveDraft();repaint();localStorage.removeItem(key);
   status(`${matched}/${lines.length}行の時刻を設定しました。${matched<lines.length?'照合できなかった行の時刻を確認・入力してください。':'再生して確認し、必要に応じて修正してください。'}`);
   return;
  }catch(e){if(e.status!==404)throw e;}
  if(attempt%5===0){
   const runs=await api('actions/workflows/generate_video_ui.yml/runs?event=workflow_dispatch&per_page=30');
   const run=runs.workflow_runs.find(entry=>entry.display_title===`Pages ${receipt}`);
   if(!run&&sha&&!wait&&Date.now()-requestedAt>30000){
    await ensureInputRef({receipt,sha});
    await dispatchLyrics(receipt,sha);
   }
   if(run?.status==='completed'&&run.conclusion!=='success'){
    localStorage.removeItem(key);
    throw Error(`歌詞の照合に失敗しました。GitHub Actionsで受付ID ${receipt} の結果を確認してください。`);
   }
  }
  if(wait)await sleep(3000);
 }
 status('照合を実行中です。時間をおいて「照合結果を確認」を押してください。');
}
function dispatchLyrics(receipt,sha){
 return api('actions/workflows/generate_video_ui.yml/dispatches','POST',{ref:'main',inputs:{receipt_id:receipt,input_sha:sha,job_kind:'lyric-preview'}});
}
async function reuseFullLyrics(vocal, media, lines){
 const fullTiming=project?.fullLyricTiming;
 if(vocal||!lip()||fullMode()||!fullTiming||!decoded||!projectAudio)return false;
 const start=Number($('acCutStart').value),end=Number($('acCutEnd').value);
 const currentProject=project, audio=projectAudio;
 if(!(start>=0&&end>start&&end<=decoded.duration&&end-start<=120))return false;
 if(await assetHash(audio)!==fullTiming.audioSha||currentProject!==project||audio!==projectAudio||
    await assetHash(chorusWav(decoded,start,end))!==await assetHash(media.blob))return false;
 if(currentProject!==project||audio!==projectAudio||fullMode()||!lip()||media.blob!==currentLyricMedia().blob||
    JSON.stringify(lines)!==JSON.stringify(lyricInput()))return false;
 const shift=Math.round(Math.round(start*decoded.sampleRate)*1000/decoded.sampleRate);
 const duration=Math.floor(media.duration*1000);
 const selected=fullTiming.lyrics.filter(line=>line.end_ms>shift&&line.start_ms<shift+duration);
 if(selected.length!==lines.length||selected.some((line,i)=>line.text!==lines[i]))return false;
 for(const [i,line] of selected.entries()){
  rows[i].start.value=Math.max(0,line.start_ms-shift)/1000;
  rows[i].end.value=Math.min(duration,line.end_ms-shift)/1000;
 }
 saveDraft();repaint();
 status('保存済みのフルMVの時刻をサビに反映しました。再生して確認してください。');
 return true;
}
async function autoLyrics(resume=false){
 if(busy)return;
 busy=true;ready();$('acLyricAuto').disabled=true;$('acLyricResult').disabled=true;
 const key=lyricJobKey();
 try{
  const previous=JSON.parse(localStorage.getItem(key)||'null');
  if(previous){await checkLyricResult(key,previous,!resume);return;}
  if(resume){status('確認待ちの照合はありません。');return;}
  const repository=await api('');
  if(!repository.private)throw Error('非公開リポジトリへ接続してください。');
  const media=currentLyricMedia(),isSong=lip(),limit=fullMode()?360:120;
  const duration_ms=Math.floor(media.duration*1000);
  if(!media.blob||!Number.isFinite(duration_ms)||duration_ms<=0||duration_ms>limit*1000)
   throw Error('先に完成動画に使う動画または音源を選択してください。');
  if(!resume&&rows.some(row=>row.start.value!=='')&&!window.confirm('現在の歌詞の時刻を自動同期の結果で更新しますか？'))return;
  if(builtLyrics!==$('acLyrics').value)buildRows();
  const requestLines=lyricInput();
  if(!requestLines.length||requestLines.length>100||requestLines.some(line=>!line||line.length>100))
   throw Error('歌詞を1〜100行、各行1〜100文字で入力してください。');
  const input=JSON.stringify(lyricInput());
  const vocal=$('acLyricVocal').files[0], blob=vocal||media.blob;
  if(await reuseFullLyrics(vocal,media,requestLines))return;
  const meta=await fileMeta(blob,!!vocal||isSong);
  const mainMeta=vocal?await fileMeta(media.blob,isSong):meta;
  const saved=lyricSource(meta);
  const existing=ready()&&!vocal?(isSong?prepared.audioId:prepared.id):null;
  const id=existing??saved?.id??crypto.randomUUID().replaceAll('-','');
  if(!existing&&!saved){
   await transferSource(blob,id,meta,await keyPair());
   if(key===lyricJobKey())localStorage.setItem(lyricSourceKey(meta.sha256),JSON.stringify({sha:meta.sha256,id}));
  }
  if(key!==lyricJobKey()||currentLyricMedia().blob!==media.blob||vocal!==$('acLyricVocal').files[0]||input!==JSON.stringify(lyricInput()))
   throw Error('素材・制作モード・歌詞が変更されました。');
  const runs=await api('actions/workflows/generate_video_ui.yml/runs?per_page=30');
  if(runs.workflow_runs.some(run=>run.status!=='completed'))
   throw Error('生成中の処理が完了してから歌詞を照合してください。');
  const payload={source:{...meta,public_id:`v-generator/acapella/${id}`},duration_ms,limit,lines:requestLines};
  const receipt=crypto.randomUUID();
  const uploaded=await api('git/blobs','POST',{content:JSON.stringify(payload),encoding:'utf-8'});
  const tree=await api('git/trees','POST',{tree:[{path:'input/script.json',mode:'100644',type:'blob',sha:uploaded.sha}]});
  const commit=await api('git/commits','POST',{message:`Lyric preview ${receipt}`,tree:tree.sha,parents:[]});
  await ensureInputRef({receipt,sha:commit.sha});
  const item={receipt,sha:commit.sha,signature:mainMeta.sha256,lines:requestLines,input,requestedAt:Date.now()};
  localStorage.setItem(key,JSON.stringify(item));saveDraft();
  await dispatchLyrics(receipt,commit.sha);
  status('歌詞を照合しています。画面を離れた場合は「照合結果を確認」で再開できます。');
  await checkLyricResult(key,item,true);
 }catch(e){status(e.message);}
 finally{busy=false;ready();$('acLyricAuto').disabled=false;$('acLyricResult').disabled=false;}
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
  saveCurrentRun(item);
  await ensureInputRef(item);
  status(`受付ID ${receipt} を保存しました。GitHubへの受付を確認しています。`);
  await api('actions/workflows/generate_video_ui.yml/dispatches','POST',{ref:'main',inputs:{receipt_id:receipt,input_sha:commit.sha,job_kind:'video'}});
  status(`受付依頼を送信しました（${receipt}）。「受付済み」になるまで画面を開いてください。`);
  await reconcilePending(false);
  if(lip()&&(project||projectAudio)&&payload.title!=='口パク動画'&&$('acTitle').value.trim()){
   project??={version:1,id:crypto.randomUUID(),layouts:{},lyrics:[],runs:{}};
   project.layouts[layoutKey()]??={};
   project.layouts[layoutKey()][stock()?'image':'video']=stock()?{...meta,name:imageName()}:{...payload.source,name:file.blob.name};
   project.runs??={};const key=layoutKey();
   project.runs[key]=[...runList(project.runs[key]),receipt];
   try{await saveProject();if(project.audio&&currentRun()?.receipt===receipt)saveCurrentRun({...currentRun(),projectId:project.id});}
   catch(e){status(`受付依頼済み ${receipt}。曲プロジェクトの保存に失敗しました。 ${e.message}`);}
  }
 }catch(e){status(e.message);focusLyricError(e.message);}finally{busy=false;ready();}
}
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
 $('acPreview').onloadedmetadata=()=>{if(!file||file.blob!==blob)return;file.duration=$('acPreview').duration;status(`${blob.name}（${file.duration.toFixed(1)}秒）`);updateEditor();};
}
$('acPreview').ontimeupdate=repaint;
function previewLayout(){const box=$('acPreviewBox');box.classList.toggle('landscape',$('acPreviewFormat').value==='landscape');box.classList.toggle('crop',$('acFraming').value==='crop');paintTextStyle();}
$('acPreviewFormat').onchange=previewLayout;$('acFraming').onchange=previewLayout;
previewLayout();
for(const id of ['acTitle','acArtist','acReleaseLabel','acHook'])$(id).oninput=repaint;
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
$('acLyricAuto').onclick=()=>autoLyrics();$('acLyricResult').onclick=()=>autoLyrics(true);
$('acBuildLines').onclick=()=>{if(builtLyrics!==$('acLyrics').value)buildRows();repaint();};
async function recover(){
 await reconcilePending(true);
}
$('acRecover').onclick=recover;
let reconciling=false;
async function reconcilePending(resend){
 if(reconciling)return;
 const items=pendingItems().filter(item=>!resend||!item.mode||item.mode===$('acMode').value);
 if(!items.length){if(resend)status('確認待ちの生成受付はありません。');return;}
 reconciling=true;
 try{
  const runs=await api('actions/workflows/generate_video_ui.yml/runs?per_page=100');
  let found=0,remaining=0;
  for(const item of items){
   const run=runs.workflow_runs.find(r=>r.display_title===`Pages ${item.receipt}`);
   if(run){forgetPending(item);found++;if(currentRun()?.receipt===item.receipt)showRun(item,run);continue;}
   try{
    await api(`git/ref/tags/ui-accepted-${item.receipt}`);
    forgetPending(item);found++;if(currentRun()?.receipt===item.receipt)showRun(item);continue;
   }catch(e){if(e.status!==404)throw e;}
   remaining++;
   if(resend){
    await ensureInputRef(item);
    await api('actions/workflows/generate_video_ui.yml/dispatches','POST',{ref:'main',inputs:{receipt_id:item.receipt,input_sha:item.sha,job_kind:'video'}});
   }
  }
  if(!currentRun()?.accepted||!found)status(found?`受付済み ${found} 件。別アプリに切り替えられます。`:
   resend?`同じ受付IDで ${remaining} 件の受付を再依頼しました。少し後に確認してください。`:
   `受付確認中 ${remaining} 件。「前回の受付を確認・再開」で同じIDを確認できます。`);
 }catch(e){status(`受付の照合に失敗しました。受付IDを保持しています。 ${e.message}`);}
 finally{reconciling=false;}
}
if(pendingItems().length)status(`確認待ちの受付が ${pendingItems().length} 件あります。`);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconcilePending(false);});
window.addEventListener('pageshow',()=>reconcilePending(false));
const pendingTimer=setInterval(()=>{if(document.hidden)return;if(pendingItems().length)reconcilePending(false);else if(editorStep===3)refreshCurrentRun();},5000);
pendingTimer.unref?.();

let syncPlaying=false;
const full=$('acFullPlayer');
const draftFields=['acCutStart','acCutEnd','acOutput','acTitle','acArtist','acReleaseLabel','acHook','acLyrics','acFraming','acOffset','acClears','acTrimEnd','acMaskKind','acMaskStrength','acMaskStart','acMaskEnd','acMaskKeys','acVisualMode','acImage','acStockPercent','acStockProvider','acStockKeywords'];
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
  if(!draft){applySnapshot(null);$('acHook').value=lip()?'0':'3';$('acOutput').value='vertical_only';return;}
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
 if(!project){decoded=null;projectAudio=null;$('acFull').value='';full.pause();full.removeAttribute('src');full.load();}
 $('acChorus').value='';
 const videoLabel=$('acFile').parentElement;
 file=null;chorus=null;audioIdentity=null;videoLabel.querySelector('input').value='';
 for(const media of [$('acPreview'),$('acBackground'),chorusPlayer]){media.pause();media.removeAttribute('src');media.load();}
 if(lip()){ $('acFilmedControls').insertBefore(videoLabel,$('acOffset').parentElement);$('acPreviewFormat').value=fullMode()?'landscape':'vertical';$('acTextFormat').value=$('acPreviewFormat').value;$('acTextFormat').disabled=true;if(project){file=null;chorus=null;audioIdentity=null;$('acFile').value='';$('acChorus').value='';restoreProjectLayout();if(decoded){if(fullMode())setChorus(chorusWav(decoded,0,decoded.duration,360));else if(project.range){setChorus(chorusWav(decoded,...project.range));confirmedCut=selectedCut();}}}else restoreDraft();previewLayout();}
 else { $('acOriginalSource').append(videoLabel);$('acTextFormat').disabled=false;chorusPlayer.pause();restoreDraft();}
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
  chorus=null;confirmedCut=null;
  chorusPlayer.pause();chorusPlayer.removeAttribute('src');chorusPlayer.load();
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
  else if(project?.range){setChorus(chorusWav(buffer,...project.range));confirmedCut=selectedCut();}
  if(!project?.range)$('acCutEnd').value=Math.min(60,buffer.duration);
  const canvas=$('acWave'), ctx=canvas.getContext('2d'), data=buffer.getChannelData(0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for(let x=0;x<canvas.width;x++){
   const begin=Math.floor(x*data.length/canvas.width), end=Math.floor((x+1)*data.length/canvas.width);
   let peak=0;
   for(let i=begin;i<end;i+=16)peak=Math.max(peak,Math.abs(data[i]));
   ctx.fillRect(x,32-peak*30,1,Math.max(1,peak*60));
  }
  status(fullMode()?`${f.name}（${buffer.duration.toFixed(1)}秒）`:`${f.name}を読み込みました。サビの開始と終了を指定してください。`);
}
$('acWave').onclick=e=>{if(decoded)full.currentTime=e.offsetX/$('acWave').clientWidth*decoded.duration;};
$('acCutMarkStart').onclick=()=>$('acCutStart').value=full.currentTime.toFixed(3);
$('acCutMarkEnd').onclick=()=>$('acCutEnd').value=full.currentTime.toFixed(3);
full.ontimeupdate=()=>{if(previewEnd!==null&&full.currentTime>=previewEnd)full.currentTime=Number($('acCutStart').value);};
full.addEventListener('pause',()=>{previewEnd=null;});
$('acCutPreview').onclick=async()=>{try{
 const start=Number($('acCutStart').value),end=Number($('acCutEnd').value);
 if(!decoded||!(start>=0&&end>start&&end<=decoded.duration&&end-start<=120))throw Error('切り出し範囲を確認してください。');
 full.currentTime=start;previewEnd=end;await full.play();
}catch(e){status(e.message);}};
const cutStatus=message=>{$('acCutStatus').textContent=message;};
$('acCutSave').onclick=()=>{
 try{
  setChorus(cut());
  confirmedCut=selectedCut();
  full.pause();
  cutStatus('サビを確定しました。このまま動画制作に進めます。端末に保存する場合は下のボタンを使ってください。');
 }catch(e){cutStatus(e.message);}
};
$('acWavShare').onclick=async()=>{
 try{if(chorus)await navigator.share({files:[chorus]});}
 catch(e){if(e.name!=='AbortError')cutStatus('共有できませんでした。「WAVをダウンロード」を使ってください。');}
};
chorusPlayer.addEventListener('loadedmetadata',()=>updateEditor());
chorusPlayer.addEventListener('error',()=>{
 if(chorus)cutStatus('サビWAVを再生できません。WAVをダウンロードして端末で再生できるか確認してください。');
});
$('acChorus').onchange=()=>{const selected=$('acChorus').files[0];if(selected)setChorus(selected);};
$('acMarkOffset').onclick=()=>{$('acOffset').value=$('acPreview').currentTime.toFixed(2);};
chorusPlayer.onplay=()=>{
 if(!lip())return;
 syncPlaying=true;const video=$('acPreview');video.currentTime=offset()+val();
 if(file&&!stock())video.play().catch(()=>{});repaint();
};
chorusPlayer.onpause=repaint;
chorusPlayer.onseeked=()=>{if(lip()&&file)$('acPreview').currentTime=offset()+val();repaint();};
chorusPlayer.ontimeupdate=repaint;
$('acNextLyric').onclick=()=>{
 const row=rows.find(r=>r.start.value==='');
 if(row)row.start.value=val().toFixed(3);
 saveDraft();repaint();
};
$('acClearLyric').onclick=()=>{
 const field=$('acClears');field.value=[field.value,val().toFixed(3)].filter(Boolean).join(',');
 saveDraft();repaint();
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
const projectFields=[...draftFields.filter(id=>id!=='acOutput'),'acCandidate'];
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
 $('acReleaseLabel').value=saved?.fields?.acReleaseLabel??project.release_label??'';
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
 next.title=title;next.artist=$('acArtist').value.trim();next.release_label=$('acReleaseLabel').value.trim();next.candidate=$('acCandidate').checked;
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
 if(!fullMode()&&$('acSource').value!=='wav'&&confirmedCut===selectedCut()&&end>start&&start>=0&&end-start<=120)next.range=[start,end];
 if(chorus&&(fullMode()||($('acSource').value!=='wav'&&confirmedCut===selectedCut()))&&rows.length&&rows.every(row=>row.start.value!=='')){
  const shift=fullMode()?0:Math.round(start*1000);
  const timed=compiledLyrics().map(line=>({...line,start_ms:line.start_ms+shift,end_ms:line.end_ms+shift}));
  if(fullMode()){
   delete next.fullLyricTiming;
   if(decoded&&projectAudio&&await assetHash(chorus)===await assetHash(chorusWav(decoded,0,decoded.duration,360)))
    next.fullLyricTiming={audioSha:await assetHash(projectAudio),lyrics:timed};
  }
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
$('acProjects').onchange=async()=>{
 if(busy||submitting)return;
 busy=true;ready();
 try{
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
}catch(e){status(e.message);}finally{busy=false;ready();updateEditor();}};

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
let shownMode='standard', openedMusicMode=null;
let standardVisibility;
function showProductionMode(){
 const mode=$('productionMode').value;
 if(mode===shownMode)return;
 const feedback=$('productionModeStatus');
 if(busy||submitting||!mode||(
   shownMode==='standard'&&window.videoConfigurator?.canLeave?.()===false)){
  $('productionMode').value=shownMode;
  feedback.textContent=busy||submitting?'処理が完了してから動画の種類を切り替えてください。':'通常動画の設定にある入力エラーを修正してください。';
  feedback.hidden=false;
  return;
 }
 feedback.hidden=true;
 const music=mode!=='standard';
 if(shownMode==='standard')standardVisibility=standardAreas.map(id=>$(id).hidden);
 standardAreas.forEach((id,index)=>{$(id).hidden=music||standardVisibility[index];});
 $('acapellaArea').hidden=!music;
 $('standardProduction').hidden=music;
 for(const button of $('acModeCards').querySelectorAll('[data-ac-mode]'))
  button.setAttribute('aria-pressed',String(button.dataset.acMode===mode));
 shownMode=mode;
 if(!music){for(const player of [full,chorusPlayer,$('acPreview')])player.pause();return;}
 if(openedMusicMode!==mode){
  $('acMode').value=mode;
  $('acMode').dispatchEvent(new Event('change'));
  openedMusicMode=mode;
  openMusicEditor();
 }
}

const musicTitles={original:'アカペラ動画',lip:'縦型サビショート',full:'横型フルMV'};
const lastMusicModeKey=()=>`acapella-editor-last-mode:${repo()}`;
const stageKey=()=>`acapella-editor-step:${repo()}:${$('acMode').value}`;
const runKey=()=>`acapella-editor-run:${repo()}:${$('acMode').value}`;
let editorStep=0, furthestStep=0, latestRunRefreshing=false, submitting=false;
function currentRun(){
 try{return JSON.parse(localStorage.getItem(runKey())||'null');}catch{return null;}
}
function saveCurrentRun(run){localStorage.setItem(runKey(),JSON.stringify(run));}
function showRun(item,run){
 const completed=run?.status==='completed';
 const successful=completed&&run.conclusion==='success';
 saveCurrentRun({...currentRun(),...item,accepted:true,completed,successful});
 $('acOpenHistory').hidden=false;
 $('acOpenHistory').textContent=successful?'完成動画を確認':'生成履歴を確認';
 $('acRecover').hidden=true;
 $('acDerive').hidden=!(successful&&lip()&&(run?.projectId||project?.audio));
 status(successful?'動画が完成しました。':completed?'生成が終了しました。生成履歴で結果を確認してください。':'受付済み・生成中。別アプリに切り替えられます。');
}
async function refreshCurrentRun(){
 const item=currentRun();
 if(!item?.accepted||item.completed||latestRunRefreshing)return;
 const key=runKey();
 latestRunRefreshing=true;
 try{
  const response=await api('actions/workflows/generate_video_ui.yml/runs?per_page=100');
  const run=response.workflow_runs.find(entry=>entry.display_title===`Pages ${item.receipt}`);
  if(run&&key===runKey()&&currentRun()?.receipt===item.receipt)showRun(item,run);
 }catch{/* Keep the last confirmed status while disconnected. */}
 finally{latestRunRefreshing=false;}
}
function paintLyricRows(){
 const now=val();
 let missing=0,invalid=0,previous=0;
 for(const row of rows){
  const start=Number(row.start.value),end=Number(row.end.value);
  const absent=row.start.value===''||row.end.value==='';
  const overlaps=!absent&&(start<previous||end<=start);
  if(absent)missing++;
  if(overlaps)invalid++;
  if(!absent)previous=Math.max(previous,end);
  row.label.textContent=absent?'時刻を入力':overlaps?'重複・時間を確認':`${start.toFixed(2)}–${end.toFixed(2)} 秒`;
  row.seek.disabled=row.start.value==='';
  row.box.classList.toggle('ac-line-active',!absent&&now>=start&&now<end);
 }
 $('acLyricSummary').textContent=rows.length?`${rows.length}行${missing?` · 未設定 ${missing}行`:''}${invalid?` · 時刻を確認 ${invalid}行`:''}`:'';
}
function updateSourceFields(){
 const source=$('acSource').value;
 $('acProjectPicker').hidden=source!=='saved';
 $('acFullSource').hidden=source==='wav';
 $('acWavSource').hidden=source!=='wav'||fullMode();
 $('acCutGroup').hidden=fullMode()||source==='wav';
 $('acWavSource').querySelector('input').disabled=fullMode();
}
function updateEditor(){
 const run=currentRun();
 const title=musicTitles[$('acMode').value];
 $('acEditorTitle').textContent=title;
 $('acRatio').textContent=lip()?(fullMode()?'横 16:9':'縦 9:16'):
  ({vertical_only:'縦 9:16',horizontal_only:'横 16:9',vertical_horizontal:'縦 9:16 ＋ 横 16:9'})[$('acOutput').value];
 $('acOffsetLabel').textContent=fullMode()?'映像の曲開始位置（秒）':'映像のサビ開始位置（秒）';
 $('acMarkOffset').textContent=fullMode()?'現在位置を曲開始にする':'現在位置をサビ開始にする';
 $('acPreviewFormat').parentElement.hidden=lip()||editorStep!==2||$('acOutput').value!=='vertical_horizontal';
 $('acTextFormat').parentElement.hidden=lip()||$('acOutput').value!=='vertical_horizontal';
 $('acOutput').parentElement.hidden=lip();
 $('acProjectOptions').hidden=!lip();
 $('acSafeToggle').hidden=editorStep!==2;
 $('acManualLyrics').hidden=!lip();
 $('acSource').options[1].hidden=fullMode();
 $('acMediaSummary').textContent=chorus&&Number.isFinite(chorusPlayer.duration)?`${chorus.name}（${chorusPlayer.duration.toFixed(1)}秒）`:'';
 updateSourceFields();
 document.querySelectorAll('[data-ac-panel]').forEach(panel=>{panel.hidden=Number(panel.dataset.acPanel)!==editorStep;});
 for(const button of $('acSteps').querySelectorAll('button')){
  const step=Number(button.dataset.acStep);
  button.disabled=step>furthestStep;
  if(step===editorStep)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');
 }
 $('acPreviewDock').hidden=editorStep===3||(editorStep===0&&(!lip()||(!chorus&&!file)));
 $('acAudioDock').hidden=!lip();
 $('acBack').hidden=editorStep===0;
 $('acNext').hidden=editorStep===3;
 $('acNext').textContent=['歌詞へ','仕上げへ','生成内容を確認'][editorStep]??'';
 $('acLyricAuto').hidden=editorStep!==1;
 $('acLyricAuto').classList.toggle('secondary',rows.length>0);
 $('acNext').classList.toggle('secondary',editorStep===1&&!rows.length);
 $('acSubmit').hidden=editorStep!==3;
 $('acRecover').hidden=!pendingItems().some(item=>!item.mode||item.mode===$('acMode').value);
 $('acOpenHistory').hidden=!run?.accepted;
 $('acOpenHistory').textContent=run?.successful?'完成動画を確認':'生成履歴を確認';
 $('acDerive').hidden=!(run?.successful&&lip()&&(item.projectId||project?.audio));
 $('acDerive').textContent=fullMode()?'同じ曲でサビショートを作る':'同じ曲でフルMVを作る';
 if(editorStep===3){
  const details=$('acReview');
  details.replaceChildren();
  const duration=lip()?chorusPlayer.duration:file?.duration;
  for(const [label,value] of [
   ['出力',$('acRatio').textContent],['尺',Number.isFinite(duration)?`${duration.toFixed(1)} 秒`:'素材の再選択が必要'],
   ['曲名',$('acTitle').value||'未入力'],['リリース表記',$('acReleaseLabel').value.trim()||'なし'],['音声',lip()?chorus?.name??'未選択':'撮影動画の音声'],
   ['映像',stock()?$('acImage').value:file?.blob.name??'未選択'],['歌詞',$('acLyricSummary').textContent||'未入力']
  ]){
   const term=document.createElement('dt');term.textContent=label;
   const description=document.createElement('dd');description.textContent=value;
   details.append(term,description);
  }
 }
}
function goToStep(next){
 if(busy||submitting)return;
 for(const player of [full,chorusPlayer,$('acPreview')])player.pause();
 editorStep=next;
 furthestStep=Math.max(furthestStep,next);
 localStorage.setItem(stageKey(),String(next));
 updateEditor();
 $('acEditorTitle').focus();
}
function openMusicEditor(){
 $('acSource').value=project&&lip()?'saved':fullMode()?'full':localStorage.getItem(`${stageKey()}:source`)||'full';
 if(!lip())$('acOutput').onchange();
 localStorage.setItem(lastMusicModeKey(),$('acMode').value);
 updateContinueButton();
 const stored=Number(localStorage.getItem(stageKey()));
 editorStep=Number.isInteger(stored)&&stored>=0&&stored<=3?stored:0;
 furthestStep=editorStep;
 updateEditor();
 const run=currentRun();
 if($('acRecover').hidden&&run?.accepted){
  status(run.successful?'動画が完成しました。':'受付済み。生成履歴で進捗を確認できます。');
  refreshCurrentRun();
 }else if(!$('acRecover').hidden)status('受付を確認中です。前回の受付を確認できます。');
 else if(editorStep>0&&!currentLyricMedia().blob)status('下書きを復元しました。「素材」で使用するファイルを選び直してください。');
 else status('');
}
function checkSources(){
 if(lip()&&!fullMode()&&chorus&&$('acSource').value!=='wav'&&confirmedCut!==selectedCut())throw Error('サビの開始と終了を確認し、「この区間を使う」を押してください。');
 if(lip()&&(!chorus||!Number.isFinite(chorusPlayer.duration)))throw Error(fullMode()?'フル音源を選んでください。':'サビ音源を選ぶか、切り出し範囲を確定してください。');
 if(stock()){imageName();return;}
 if(!Number.isFinite(file?.duration))throw Error('撮影動画を選んで、読み込みが完了するまでお待ちください。');
}
$('acNext').onclick=()=>{
 try{
  if(editorStep===0)checkSources();
  if(editorStep===1){
   if(builtLyrics!==$('acLyrics').value)buildRows();
   if(!rows.length)throw Error('歌詞を入力してください。');
   repaint();
  }
  goToStep(editorStep+1);
 }catch(e){status(e.message);}
};
$('acBack').onclick=()=>goToStep(editorStep-1);
for(const button of $('acSteps').querySelectorAll('button'))button.onclick=()=>{
 const step=Number(button.dataset.acStep);
 if(step<=furthestStep)goToStep(step);
};
function chooseProductionMode(mode){
 if(!mode)return;
 $('productionMode').value=mode;
 $('productionMode').dispatchEvent(new Event('change'));
 if(shownMode===mode&&mode!=='standard')$('acEditorTitle').focus();
}
function updateContinueButton(){
 const title=musicTitles[localStorage.getItem(lastMusicModeKey())];
 $('acContinue').hidden=!title;
 if(title)$('acContinue').textContent='前回の続き：'+title;
}
for(const button of $('acModeCards').querySelectorAll('[data-ac-mode]'))
 button.onclick=()=>chooseProductionMode(button.dataset.acMode);
updateContinueButton();
$('repo').addEventListener('input',updateContinueButton);
$('acContinue').onclick=()=>chooseProductionMode(localStorage.getItem(lastMusicModeKey()));
$('acSource').onchange=()=>{
 const source=$('acSource').value;
 localStorage.setItem(`${stageKey()}:source`,source);
 if(source==='saved')$('acProjectList').click();
 else {
  project=null;projectSha=null;projectAudio=null;decoded=null;confirmedCut=null;
  $('acProjects').value='';$('acFull').value='';$('acChorus').value='';
  for(const player of [full,chorusPlayer]){player.pause();player.removeAttribute('src');player.load();}
  chorus=null;
 }
 updateSourceFields();
};
$('acOutput').onchange=()=>{
 const output=$('acOutput').value;
 if(output!=='vertical_horizontal'){
  $('acTextFormat').value=output==='horizontal_only'?'landscape':'vertical';
  $('acTextFormat').onchange();
 }
 updateEditor();
};
$('acSafeToggle').onclick=()=>{
 const button=$('acSafeToggle'),enabled=button.getAttribute('aria-pressed')!=='true';
 button.setAttribute('aria-pressed',String(enabled));
 $('acPreviewBox').classList.toggle('show-safe-area',enabled);
};
$('acOpenHistory').onclick=()=>{
 $('refresh').click();
 $('history').scrollIntoView?.({block:'start'});
};
$('acDerive').onclick=async()=>{
 if(busy||submitting)return;
 const projectId=currentRun()?.projectId??project?.id;
 if(!projectId)return;
 chooseMusicMode(fullMode()?'lip':'full');
 goToStep(0);
 $('acSource').value='saved';
 updateSourceFields();
 const select=$('acProjects');
 if(!Array.from(select.options).some(option=>option.value===projectId))select.add(new Option('同じ曲',projectId));
 select.value=projectId;
 await select.onchange();
};
$('acSubmit').onclick=async()=>{
 if(busy||submitting)return;
 submitting=true;
 const generate=async()=>{
  try{
   checkSources();
   script('preview',stock()?{path:`media/${imageName()}`}:null);
   if(ready()||await prepare())await submit();
  }catch(e){status(e.message);}
  finally{updateEditor();}
 };
 try{
  if(navigator.locks)await navigator.locks.request(`v-generator-music:${repo()}`,{ifAvailable:true},async lock=>{
   if(lock)await generate();else status('別のタブで動画の生成を受け付けています。');
  });
  else await generate();
 }finally{submitting=false;ready();}
};
window.addEventListener('pageshow',refreshCurrentRun);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCurrentRun();});

$('productionMode').onchange=showProductionMode;
showProductionMode();
restorePrepared();
