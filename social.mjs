import {socialBody} from './builder/social-data.mjs?v=mbti-20261019';
const $=id=>document.getElementById(id);
const STATE='contents/state.json?ref=social-state';
const WORKFLOW='social_publish.yml';
const LABELS={ready:'未送信',waiting:'予約枠待ち',unknown:'結果確認中（再送保留）',scheduled:'予約済み',sending:'公開処理中',published:'投稿完了',failed:'失敗',expired:'日時の再設定が必要',approval_required:'Bufferで承認が必要',manual_required:'手動投稿の設定です',withdrawn:'取り下げ済み'};
const MEDIA={tiktok:'TikTok',instagram:'Instagramリール',youtube:'YouTubeショート'};
const CLOUD={pending:'転送待ち',setup_required:'Cloudinary設定待ち',error:'転送失敗',uploaded:'転送済み',deleted:'投稿後削除済み',withdrawn:'取り下げ済み（Cloudinaryから削除）'};
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
function decode(content){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g,'')),c=>c.charCodeAt(0))));}
export function jstInput(iso){return new Date(new Date(iso).getTime()+9*3600000).toISOString().slice(0,16);}
export function utcFromJst(value){if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))throw Error('日本時間の投稿日時を指定してください');const d=new Date(value+':00+09:00');if(!Number.isFinite(d.getTime()))throw Error('投稿日時が不正です');return d.toISOString();}
export function filenameTitle(filename){if(typeof filename!=='string'||!filename.toLowerCase().endsWith('.mp4')||filename.length<=4||/[\\/]/.test(filename))throw Error('動画ファイル名が不正です');return filename.slice(0,-4);}
export function composeRows(videos,channels,body,start,interval){
 const base=new Date(utcFromJst(start)).getTime();if(!Number.isFinite(interval)||interval<1||interval>10080)throw Error('投稿間隔は1〜10080分にしてください');
 return videos.flatMap((v,i)=>channels.map(c=>({video_id:v.id,channel_id:c.id,service:c.service,title:filenameTitle(v.filename),body:socialBody(v.social,v.tarot?.zodiac,body),due_at:new Date(base+i*interval*60000).toISOString()})));
}

export function isCompletedVideo(video, posts, channels){
 if(video.cloud.status==='deleted')return true;
 return channels.length>0&&channels.every(channel=>Object.values(posts).some(post=>post.video_id===video.id&&post.channel_id===channel.id&&post.status==='published'));
}

export function canWithdrawVideo(video, posts){
 if(!['uploaded','pending','setup_required','error'].includes(video.cloud.status))return false;
 return !Object.values(posts).some(post=>post.video_id===video.id&&(post.buffer_id||!['ready','waiting','failed','expired'].includes(post.status)));
}

export function reviewRows(rows, posts){
 return rows.flatMap(row=>{
  const old=Object.values(posts).find(p=>p.video_id===row.video_id&&p.channel_id===row.channel_id);
  if(!old)return [row];
  if(['failed','expired'].includes(old.status)&&old.buffer_id)return [{...row,retry_buffer_id:old.buffer_id}];
  if(!old.buffer_id&&['ready','waiting','failed','expired'].includes(old.status))return [row];
  return [];
 });
}

export function mountSocial(){
 const panel=$('socialPanel');if(!panel)return;
 let state={videos:{},posts:{},channels:[],settings:{}},rows=[],busy=false,pending=null,poll=null;
 const api=(...args)=>{if(!window.videoStudioApi)throw Error('GitHubへ接続してください');return window.videoStudioApi(...args);};
 const key=()=>`social-request-v1:${$('repo').value.trim()}`;
 const say=t=>$('socialStatus').textContent=t;
 const savePending=()=>{if(pending)localStorage.setItem(key(),JSON.stringify(pending));else localStorage.removeItem(key());};
 const loadPending=()=>{try{pending=JSON.parse(localStorage.getItem(key())||'null');}catch{pending=null;}};
 const control=()=>{for(const b of panel.querySelectorAll('button[data-social-action]'))b.disabled=busy||Boolean(pending);$('socialSubmit').disabled=!rows.length||busy||Boolean(pending);$('socialResume').hidden=!pending;$('socialResume').disabled=busy;};
 const navigate=target=>{
  $('productionPanel').hidden=target!=='production';panel.hidden=target!=='social';$('connection').hidden=target!=='settings';
  for(const b of document.querySelectorAll('[data-studio-tab]'))b.setAttribute('aria-pressed',String(b.dataset.studioTab===target));
  if(target==='settings')$('connection').open=true;
  if(target==='social'){loadPending();refresh().catch(e=>say(e.message));}
 };
 for(const b of document.querySelectorAll('[data-studio-tab]'))b.addEventListener('click',()=>navigate(b.dataset.studioTab));
 const field=(parent,label,value,type='text')=>{const l=el('label',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value||'';l.append(input);parent.append(l);return input;};
 const selectedVideos=()=>[...$('socialVideos').querySelectorAll('input[data-video]:checked')].map(e=>state.videos[e.dataset.video]);
 const selectedChannels=()=>[...$('socialChannels').querySelectorAll('input:checked')].map(e=>state.channels.find(c=>c.id===e.value));
 function render(){
  const selected=new Set(selectedVideos().map(v=>v.id));
  $('socialSetup').textContent=`Cloudinary：${state.setup?.cloudinary?'Secrets登録済み（実接続は転送時に確認）':'Secrets未設定'} ／ Buffer：${state.setup?.buffer?'Secrets登録済み':'Secrets未設定'}`;
  const previous=new Set(selectedChannels().map(c=>c?.id));$('socialChannels').replaceChildren();
  for(const c of state.channels){const l=el('label'),input=el('input');input.type='checkbox';input.value=c.id;input.checked=previous.size?previous.has(c.id):false;input.disabled=c.isDisconnected||c.isLocked||c.isQueuePaused;l.className='check';l.append(input,el('span',`${MEDIA[c.service]}：${c.name}${input.disabled?'（接続・停止状態を確認）':''}`));$('socialChannels').append(l);}
  if(!state.channels.length)$('socialChannels').append(el('p','Secrets登録後、「投稿先を取得」を押してください。'));
  $('socialLocationStatus').textContent=state.settings?.instagram_location?`Instagramの場所：${state.settings.instagram_location.text}（取得済み）`:'Instagramの場所：未設定（場所なしで予約できます）';
  $('socialVideos').replaceChildren();
  const completedVideos=el('details'),completedVideoList=el('div');
  const withdrawnVideos=el('details'),withdrawnVideoList=el('div');
  let completedVideoCount=0,availableVideoCount=0,withdrawnVideoCount=0;
  for(const v of Object.values(state.videos).reverse()){
   const box=el('article');box.className='item';const l=el('label'),input=el('input');input.type='checkbox';input.dataset.video=v.id;const completed=isCompletedVideo(v,state.posts,state.channels);input.disabled=v.cloud.status!=='uploaded'||completed;input.checked=selected.has(v.id)&&!input.disabled;l.className='check';l.append(input,el('strong',v.title));box.append(l,el('p',CLOUD[v.cloud.status]||v.cloud.status));
   if(v.cloud.error)box.append(el('p',v.cloud.error));if(v.cloud.delete_error)box.append(el('p',v.cloud.delete_error));
   if(['error','setup_required','pending'].includes(v.cloud.status)){const retry=el('button','この動画の生成結果から転送を再試行');retry.className='secondary';retry.dataset.socialAction='import';retry.onclick=()=>run({action:'import',run_id:v.run_id});box.append(retry);}
   if(canWithdrawVideo(v,state.posts)){const withdraw=el('button','投稿せず動画を取り下げる');withdraw.className='secondary';withdraw.dataset.socialAction='withdraw';withdraw.onclick=()=>{if(!confirm('この動画を投稿一覧から取り下げ、Cloudinary上のファイルを削除します。元に戻せません。実行しますか？'))return;run({action:'withdraw',video_id:v.id});};box.append(withdraw);}
   if(v.cloud.status==='withdrawn'){withdrawnVideoList.append(box);withdrawnVideoCount++;}
   else if(completed){completedVideoList.append(box);completedVideoCount++;}
   else{$('socialVideos').append(box);availableVideoCount++;}
  }
  if(completedVideoCount){completedVideos.append(el('summary',`投稿完了した動画（${completedVideoCount}件）を表示`),completedVideoList);$('socialVideos').append(completedVideos);}
  if(withdrawnVideoCount){withdrawnVideos.append(el('summary',`取り下げ済みの動画（${withdrawnVideoCount}件）を表示`),withdrawnVideoList);$('socialVideos').append(withdrawnVideos);}
  $('socialSelectAll').disabled=!availableVideoCount;
  if(!Object.keys(state.videos).length)$('socialVideos').append(el('p','新しく生成した動画は、生成完了後にここへ登録されます。生成履歴の「投稿を準備する」からも取り込めます。'));
  $('socialPosts').replaceChildren();
  const completedPosts=el('details'),completedPostList=el('div');
  let completedPostCount=0;
  for(const p of Object.values(state.posts).reverse()){
   if(p.status==='withdrawn')continue;
   const box=el('article');box.className='item';box.append(el('strong',p.title),el('p',`${MEDIA[p.service]} · ${LABELS[p.status]||p.status}`),el('p',`日本時間：${jstInput(p.remote_due_at||p.due_at).replace('T',' ')}`));
   const c=state.channels.find(c=>c.id===p.channel_id);if(c)box.append(el('p',c.name));
   if(p.error&&['failed','unknown','waiting','expired'].includes(p.status))box.append(el('p',p.error));
   if((['failed','expired'].includes(p.status)||(['ready','waiting'].includes(p.status)&&!p.buffer_id))&&state.videos[p.video_id]?.cloud.status==='uploaded'){const retry=el('button',p.buffer_id?'この投稿先だけ再予約':'日時・投稿文を確認して追加予約');retry.className='secondary';retry.dataset.socialAction='retry';retry.onclick=()=>{if(busy||pending)return;rows=[{...p,...(p.buffer_id?{retry_buffer_id:p.buffer_id}:{})}];renderRows();$('socialReview').scrollIntoView({behavior:'smooth'});};box.append(retry);}
   if(p.buffer_id){const a=el('a','Bufferで確認・変更');a.href='https://publish.buffer.com/';a.target='_blank';a.rel='noopener noreferrer';box.append(a);}
   if(p.status==='published'){completedPostList.append(box);completedPostCount++;}else $('socialPosts').append(box);
  }
  if(completedPostCount){completedPosts.append(el('summary',`投稿完了の履歴（${completedPostCount}件）を表示`),completedPostList);$('socialPosts').append(completedPosts);}
  control();
 }
 function renderRows(){
  $('socialReview').replaceChildren();$('socialCount').textContent=`${new Set(rows.map(r=>r.video_id)).size}動画・${rows.length}投稿を確認中。予約枠不足の分は待機します。`;
  rows.forEach((r,i)=>{
   const video=state.videos[r.video_id];if(video?.filename)r.title=filenameTitle(video.filename);
   const box=el('details');box.open=rows.length===1;box.className='item';const c=state.channels.find(c=>c.id===r.channel_id);box.append(el('summary',`${i+1}. ${r.title} ／ ${MEDIA[r.service]}・${c?.name||r.channel_id}`));
   box.append(el('p',r.service==='youtube'?'場所・0秒カバー：Buffer経由では非対応':`カバー：開始0秒${r.service==='instagram'?` ／ 場所：${state.settings?.instagram_location?.text||'未設定（場所を付けずに予約）'}`:''}`));
   if(r.retry_buffer_id)box.append(el('p','失敗したBuffer投稿を同じIDで再予約します。成功済みの投稿先には再送しません。'));
   const time=field(box,'投稿日時（日本時間）',jstInput(r.due_at),'datetime-local');time.onchange=()=>{try{r.due_at=utcFromJst(time.value);}catch(e){say(e.message);}};
   const title=field(box,'タイトル（動画ファイル名・拡張子なし）',r.title);title.readOnly=true;
   const body=field(box,r.service==='youtube'?'説明文':'本文（冒頭にタイトルを自動追加）',r.body,'textarea');body.rows=4;body.oninput=()=>r.body=body.value;
   const remove=el('button','この投稿を対象から外す');remove.className='secondary';remove.onclick=()=>{rows.splice(i,1);renderRows();};box.append(remove);$('socialReview').append(box);
  });
  $('socialSubmit').disabled=!rows.length||busy||Boolean(pending);
 }
 async function refresh(){
  try{state=decode((await api(STATE)).content);for(const v of Object.values(state.videos))v.title=filenameTitle(v.filename);}catch(e){if(e.status!==404)throw e;}
  if(pending&&state.requests?.[pending.id]){
   const result=state.requests[pending.id];say(result.message||'処理中です。受付後は画面を閉じられます。');
   if(['completed','failed'].includes(result.status)){pending=null;savePending();}
  }
  render();if(pending&&!poll)poll=setInterval(()=>{if(!document.hidden)refresh().catch(e=>say(e.message));},15000);
  if(!pending&&poll){clearInterval(poll);poll=null;}
 }
 async function dispatch(){
  if(!pending?.sha)throw Error('入力の保存が未完了です。「受付情報を取り消す」で準備をやり直してください');
  await api(`actions/workflows/${WORKFLOW}/dispatches`,'POST',{ref:'main',inputs:{receipt_id:pending.id,input_sha:pending.sha}});
  say('実行を依頼しました。画面を閉じても処理が続きます。「一覧を更新」で結果を確認できます。');
 }
 async function run(request){
  if(busy||pending)return;busy=true;control();
  try{
   const repository=await api('');if(!repository.private)throw Error('非公開リポジトリへ接続してください');
   pending={id:crypto.randomUUID()};savePending();
   const blob=await api('git/blobs','POST',{content:JSON.stringify(request),encoding:'utf-8'});
   const tree=await api('git/trees','POST',{tree:[{path:'request.json',mode:'100644',type:'blob',sha:blob.sha}]});
   const commit=await api('git/commits','POST',{message:`Social input ${pending.id}`,tree:tree.sha,parents:[]});
   pending.sha=commit.sha;savePending();
   await api('git/refs','POST',{ref:`refs/heads/social-input/${pending.id}`,sha:commit.sha});await dispatch();await refresh();
  }catch(e){say(e.message+'。受付情報を保持しました。確認後に同じ受付IDで再依頼できます。');}
  finally{busy=false;control();renderRows();if(pending&&!poll)poll=setInterval(()=>{if(!document.hidden)refresh().catch(e=>say(e.message));},15000);}
 }
 $('socialLocationImport').onclick=()=>run({action:'location'});
 $('socialConnect').onclick=()=>run({action:'connect'});
 $('socialSync').onclick=()=>run({action:'sync'});
 $('socialRefresh').onclick=()=>refresh().catch(e=>say(e.message));
 $('socialResume').onclick=async()=>{if(busy)return;busy=true;try{await refresh();if(pending){if(!pending.sha){pending=null;savePending();say('未送信の受付情報を取り消しました。操作をやり直してください');}else{try{await api(`git/refs`,'POST',{ref:`refs/heads/social-input/${pending.id}`,sha:pending.sha});}catch(e){if(e.status!==422)throw e;}await dispatch();}}}catch(e){say(e.message);}finally{busy=false;control();}};
 $('socialSaveBody').onclick=()=>run({action:'settings',body:$('socialBody').value});
 $('socialLoadBody').onclick=()=>{$('socialBody').value=state.settings?.body||'';say('保存済み定型文を読み込みました');};
 $('socialSelectAll').onclick=()=>{for(const input of $('socialVideos').querySelectorAll('input[data-video]'))input.checked=!input.disabled;};
 $('socialBuild').onclick=()=>{try{const videos=selectedVideos(),channels=selectedChannels();if(!videos.length||!channels.length)throw Error('動画と投稿先を選んでください');const all=composeRows(videos,channels,$('socialBody').value,$('socialStart').value,Number($('socialInterval').value));rows=reviewRows(all,state.posts);const skipped=all.length-rows.length;renderRows();const descriptions=videos.map(v=>v.social?.description).filter(Boolean);const duplicate=descriptions.length>1&&new Set(descriptions).size===1?'全動画の説明文が完全一致しています。内容を確認してください。 ':'';say(`${duplicate}各投稿を開いて日時・本文を確認し、一括予約を押してください。投稿は公開設定で予約します。予約済み・成功済み・結果確認中など${skipped}件は対象から除外しました。`);}catch(e){say(e.message);}};
 $('socialSubmit').onclick=()=>{if(rows.length)run({action:'submit',posts:rows.map(({video_id,channel_id,title,body,due_at,retry_buffer_id})=>({video_id,channel_id,title,body,due_at,retry_buffer_id}))});};
 $('socialStart').value=jstInput(new Date(Date.now()+3600000).toISOString());
 window.addEventListener('social-prepare',e=>{navigate('social');run({action:'import',run_id:e.detail.runId});});
 $('repo').addEventListener('change',()=>{state={videos:{},posts:{},channels:[],settings:{}};rows=[];loadPending();render();renderRows();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!panel.hidden)refresh().catch(e=>say(e.message));});
 loadPending();navigate($('token').value.trim()?'production':'settings');control();
}


