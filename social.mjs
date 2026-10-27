import {identity,matches,newest,sourceLink,previewLink} from './video-list.mjs?v=posting-20261022';
import {socialBody} from './builder/social-data.mjs?v=tarot-display-20261021';
const $=id=>document.getElementById(id);
const STATE='contents/state.json?ref=social-state';
const WORKFLOW='social_publish.yml';
const LABELS={ready:'未送信',waiting:'予約枠待ち',api_wait:'API利用上限による保留',channel_wait:'投稿先の対応待ち',unknown:'結果確認中（再送保留）',scheduled:'予約済み',sending:'公開処理中',published:'投稿完了',failed:'失敗',expired:'日時の再設定が必要',approval_required:'Bufferで承認が必要',manual_required:'手動投稿の設定です',withdrawn:'取り下げ済み'};
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
 const related=Object.values(posts).filter(p=>p.video_id===video.id);
 const targets=video.management?.target_channels||[...new Set(related.map(p=>p.channel_id))];
 return targets.length>0&&targets.every(id=>video.management?.skipped_channels?.includes(id)||related.some(p=>p.channel_id===id&&p.status==='published'));
}

export function canWithdrawVideo(video, posts){
 if(!['uploaded','pending','setup_required','error'].includes(video.cloud.status))return false;
 return !Object.values(posts).some(post=>post.video_id===video.id&&(post.buffer_id||!['ready','waiting','api_wait','channel_wait','failed','expired'].includes(post.status)));
}

export function reviewRows(rows, posts){
 return rows.flatMap(row=>{
  const old=Object.values(posts).find(p=>p.video_id===row.video_id&&p.channel_id===row.channel_id);
  if(!old)return [row];
  if(['failed','expired'].includes(old.status)&&old.buffer_id)return [{...row,retry_buffer_id:old.buffer_id}];
  if(!old.buffer_id&&['ready','waiting','api_wait','channel_wait','failed','expired'].includes(old.status))return [row];
  return [];
 });
}

export function mountSocial(){
 const panel=$('socialPanel');if(!panel)return;
 let state={videos:{},posts:{},channels:[],settings:{}},rows=[],queueReview=false,busy=false,pending=null,poll=null;
 const refillPanel=el('section');refillPanel.id='socialRefillPanel';refillPanel.className='item';
 refillPanel.append(el('h3','予約枠待ちの補充'));
 const autoLabel=el('label'),auto=el('input');auto.id='socialAutoRefill';auto.type='checkbox';autoLabel.className='check';autoLabel.append(auto,el('span','待機分を自動登録（約6時間ごと）'));
 const refillButton=el('button','空き枠を確認して待機分を登録');refillButton.id='socialRefill';refillButton.dataset.socialAction='refill';
 const summary=el('p');summary.id='socialRefillSummary';const last=el('p');last.id='socialRefillResult';const receipts=el('details');receipts.id='socialReceipts';
 refillPanel.append(autoLabel,el('p','Buffer未登録の補充対象だけを登録します。希望日時までの登録は保証されません。API・GitHub Actionsの上限時は手動でも処理できません。'),refillButton,summary,last,receipts);panel.prepend(refillPanel);
 const api=(...args)=>{if(!window.videoStudioApi)throw Error('GitHubへ接続してください');return window.videoStudioApi(...args);};
 const key=()=>`social-request-v1:${$('repo').value.trim()}`;
 const say=t=>{$('socialStatus').textContent=t;if(!$('productionPanel').hidden)$('status').textContent=t;};
 const savePending=()=>{if(pending)localStorage.setItem(key(),JSON.stringify(pending));else localStorage.removeItem(key());};
 const loadPending=()=>{try{pending=JSON.parse(localStorage.getItem(key())||'null');}catch{pending=null;}};
 const control=()=>{for(const b of panel.querySelectorAll('button[data-social-action]'))b.disabled=busy||Boolean(pending);$('socialSubmit').disabled=!rows.length||busy||Boolean(pending);$('socialResume').hidden=!pending;$('socialResume').disabled=busy;auto.disabled=busy||Boolean(pending);};
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
  auto.checked=state.settings?.auto_refill===true;
  const waiting=Object.values(state.posts).filter(p=>!p.buffer_id&&['waiting','api_wait','channel_wait'].includes(p.status));
  summary.textContent=`補充対象 ${waiting.filter(p=>p.refill_eligible).length}件 ／ 補充停止・確認待ち ${waiting.filter(p=>!p.refill_eligible).length}件 ／ 日時再設定 ${Object.values(state.posts).filter(p=>p.status==='expired').length}件`;
  const result=state.last_refill;
  const jst=value=>new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'});
  last.textContent=result?`最終補充：${jst(result.at)}（${result.source==='automatic'?'自動':'手動'}） ${result.status==='running'?'処理中・中断時は再確認してください':result.status==='failed'?'確認失敗':result.status==='deferred'?'保留':'確認完了'} ／ 登録 ${result.registered||0}件・補充待ち ${result.remaining||0}件・日時再設定 ${result.expired||0}件${result.error?' ／ '+result.error:''}${result.reasons?` ／ 枠待ち ${result.reasons.waiting||0}件・API保留 ${result.reasons.api_wait||0}件・投稿先保留 ${result.reasons.channel_wait||0}件・結果不明 ${result.reasons.unknown||0}件・失敗 ${result.reasons.failed||0}件`:''}`:'補充はまだ実行していません。';
  if(state.buffer_api?.retry_at)last.textContent+=` ／ API再確認目安：${jst(state.buffer_api.retry_at)}`;
  receipts.replaceChildren(el('summary','受付履歴・中断した依頼の復旧'));
  for(const [id,receipt] of Object.entries(state.requests||{}).slice(-100).reverse()){
   const item=el('div');item.append(el('p',`${id}：${receipt.status==='completed'?'処理完了（個別の予約結果は一覧で確認）':receipt.status==='failed'?'処理失敗': '処理中・中断時は再依頼可能'}${receipt.message?' ／ '+receipt.message:''}`));
   if(receipt.run_id){const link=el('a','GitHub Actionsで実行結果を確認');link.href=`https://github.com/${$('repo').value.trim()}/actions/runs/${receipt.run_id}`;link.target='_blank';link.rel='noopener noreferrer';item.append(link);}
   if(receipt.status!=='completed'&&receipt.sha){const retry=el('button','この受付IDで確認・再依頼');retry.dataset.socialAction='recover';retry.onclick=()=>{if(busy||pending)return;pending={id,sha:receipt.sha};savePending();$('socialResume').click();};item.append(retry);}receipts.append(item);
  }
  const selected=new Set(selectedVideos().map(v=>v.id));
  $('socialSetup').textContent=`Cloudinary：${state.setup?.cloudinary?'Secrets登録済み（実接続は転送時に確認）':'Secrets未設定'} ／ Buffer：${state.setup?.buffer?'Secrets登録済み':'Secrets未設定'}`;
  const previous=new Set(selectedChannels().map(c=>c?.id));$('socialChannels').replaceChildren();
  for(const c of state.channels.filter(c=>c.service!=='x')){const l=el('label'),input=el('input');input.type='checkbox';input.value=c.id;input.checked=previous.size?previous.has(c.id):false;input.disabled=c.isDisconnected||c.isLocked||c.isQueuePaused;l.className='check';l.append(input,el('span',`${MEDIA[c.service]}：${c.name}${input.disabled?'（接続・停止状態を確認）':''}`));$('socialChannels').append(l);}
  if(!state.channels.length)$('socialChannels').append(el('p','Secrets登録後、「投稿先を取得」を押してください。'));
  $('socialLocationStatus').textContent=state.settings?.instagram_location?`Instagramの場所：${state.settings.instagram_location.text}（取得済み）`:'Instagramの場所：未設定（場所なしで予約できます）';
  $('socialVideos').replaceChildren();
  let availableVideoCount=0;
  for(const v of newest(state.videos)){
   const group=v.cloud.status==='withdrawn'?'withdrawn':v.archived_at?'archived':isCompletedVideo(v,state.posts,state.channels)?'completed':'active';
   if(!matches(v,$('socialSearch').value)||($('socialFilter').value!=='all'&&$('socialFilter').value!==group))continue;
   const box=el('article');box.className='item';const l=el('label'),input=el('input');input.type='checkbox';input.dataset.video=v.id;const completed=isCompletedVideo(v,state.posts,state.channels);input.disabled=v.cloud.status!=='uploaded'||completed||Boolean(v.archived_at)||['skipped','private_complete'].includes(v.management?.decision);input.checked=selected.has(v.id)&&!input.disabled;l.className='check';l.append(input,el('strong',v.title));box.append(l,el('p',identity(v)),el('p',v.archived_at?'一覧から取り下げ済み':CLOUD[v.cloud.status]||v.cloud.status));
   const href=previewLink(v)||sourceLink(v,$('repo').value.trim());
   if(href){const a=el('a',previewLink(v)?'動画をプレビュー':'元動画をダウンロードして確認');a.href=href;a.target='_blank';a.rel='noopener noreferrer';box.append(a);}
   const archive=el('button',v.archived_at?'一覧に戻す':'一覧から取り下げる');archive.className='secondary';archive.dataset.socialAction='archive';
   archive.onclick=()=>run({action:'archive',video_id:v.id,archived:!v.archived_at});box.append(archive);
   if(v.cloud.error)box.append(el('p',v.cloud.error));if(v.cloud.delete_error)box.append(el('p',v.cloud.delete_error));
   if(['error','setup_required','pending'].includes(v.cloud.status)){const retry=el('button','この動画の生成結果から転送を再試行');retry.className='secondary';retry.dataset.socialAction='import';retry.onclick=()=>run({action:'import',run_id:v.run_id});box.append(retry);}
   if(canWithdrawVideo(v,state.posts)){const withdraw=el('button','投稿せずCloudinaryのファイルを削除する');withdraw.className='secondary';withdraw.dataset.socialAction='withdraw';withdraw.onclick=()=>{if(!confirm('この動画を投稿一覧から取り下げ、Cloudinary上のファイルを削除します。元に戻せません。実行しますか？'))return;run({action:'withdraw',video_id:v.id});};box.append(withdraw);}
   $('socialVideos').append(box);if(!input.disabled)availableVideoCount++;
  }
  if(!$('socialVideos').children.length)$('socialVideos').append(el('p','該当する動画はありません。'));
  $('socialSelectAll').disabled=!availableVideoCount;
  if(!Object.keys(state.videos).length)$('socialVideos').append(el('p','新しく生成した動画は、生成完了後にここへ登録されます。生成履歴の「縦型動画をSNS投稿管理へ取り込む」からも取り込めます。'));
  $('socialPosts').replaceChildren();
  const completedPosts=el('details'),completedPostList=el('div');
  let completedPostCount=0;
  for(const p of Object.values(state.posts).reverse()){
   if(p.status==='withdrawn')continue;
   const box=el('article');box.className='item';box.dataset.postingVideo=p.video_id;box.append(el('strong',p.title),el('p',`${MEDIA[p.service]} · ${LABELS[p.status]||p.status}`),el('p',`日本時間：${jstInput(p.remote_due_at||p.due_at).replace('T',' ')}`));
   if(state.videos[p.video_id])box.append(el('p',identity(state.videos[p.video_id])));
   const c=state.channels.find(c=>c.id===p.channel_id);if(c)box.append(el('p',c.name));
   if(p.error&&['failed','unknown','waiting','api_wait','channel_wait','expired'].includes(p.status))box.append(el('p',p.error));
   if((['failed','expired'].includes(p.status)||(['ready','waiting','api_wait','channel_wait'].includes(p.status)&&!p.buffer_id))&&state.videos[p.video_id]?.cloud.status==='uploaded'){const retry=el('button',p.buffer_id?'この投稿先だけ再予約':['waiting','api_wait','channel_wait'].includes(p.status)?'内容を確認して待機に戻す':'日時・投稿文を確認して追加予約');retry.className='secondary';retry.dataset.socialAction='retry';retry.onclick=()=>{if(busy||pending)return;queueReview=!p.buffer_id&&['waiting','api_wait','channel_wait','expired'].includes(p.status);rows=[{...p,...(p.buffer_id?{retry_buffer_id:p.buffer_id}:{})}];renderRows();$('socialReview').scrollIntoView({behavior:'smooth'});};box.append(retry);}
   if(!p.buffer_id&&['waiting','api_wait','channel_wait','expired'].includes(p.status)){
    box.append(el('p',p.refill_eligible?'補充対象（自動登録OFFでも手動補充できます）':'補充停止・内容確認待ち'));
    if(p.refill_eligible){const pause=el('button','この投稿の補充を停止');pause.dataset.socialAction='pause';pause.onclick=()=>run({action:'pause_waiting',post_id:p.id});box.append(pause);}
   }
   if(p.buffer_id){const a=el('a','Bufferで確認・変更');a.href='https://publish.buffer.com/';a.target='_blank';a.rel='noopener noreferrer';box.append(a);}
   if(p.status==='published'){completedPostList.append(box);completedPostCount++;}else $('socialPosts').append(box);
  }
  if(completedPostCount){completedPosts.append(el('summary',`投稿完了の履歴（${completedPostCount}件）を表示`),completedPostList);$('socialPosts').append(completedPosts);}
  control();
  window.dispatchEvent(new window.Event('posting-state'));
 }
 function renderRows(){
  $('socialSubmit').textContent=queueReview?'確認した内容で補充待機に戻す':'確認した内容で一括予約（公開投稿）';
  $('socialReview').replaceChildren();$('socialCount').textContent=`${new Set(rows.map(r=>r.video_id)).size}動画・${rows.length}投稿を確認中。予約枠不足の分はBuffer未登録で保存します。補充は${state.settings?.auto_refill?'自動（約6時間ごと）または手動':'手動（自動登録はOFF）'}です。`;
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
  const repository=$('repo').value.trim();
  try{const result=await api(STATE);if(repository!==$('repo').value.trim())return;state=decode(result.content);for(const v of Object.values(state.videos))v.title=filenameTitle(v.filename);}catch(e){if(e.status!==404)throw e;}
  if(pending&&state.requests?.[pending.id]){
   const result=state.requests[pending.id];say(result.message||'処理中です。受付後は画面を閉じられます。');
   if(['completed','failed'].includes(result.status)){pending=null;savePending();}
  }
  if(pending?.sha){
   try{const data=await api(`actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=100`);const latest=data?.workflow_runs?.find(r=>r.display_title===`Social ${pending.id}`);
    const status=latest?.status==='completed'?(['cancelled','failure','timed_out','action_required','startup_failure'].includes(latest.conclusion)?'中断・失敗しました。同じ受付IDで確認・再依頼できます。':'実行終了。記録を更新して個別結果を確認してください。'):latest?.status==='in_progress'?'処理中です。':'受付済み・実行待ちです。';
    say(`受付ID：${pending.id} ／ ${status}`);
   }catch{say(`受付ID：${pending.id} ／ 実行状態を取得できません。同じ受付IDで確認・再依頼できます。`);}
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
  if(busy||pending)return;busy=true;control();let receiptId;
  try{
   const repository=await api('');if(!repository.private)throw Error('非公開リポジトリへ接続してください');
   pending={id:crypto.randomUUID()};receiptId=pending.id;savePending();
   const blob=await api('git/blobs','POST',{content:JSON.stringify(request),encoding:'utf-8'});
   const tree=await api('git/trees','POST',{tree:[{path:'request.json',mode:'100644',type:'blob',sha:blob.sha}]});
   const commit=await api('git/commits','POST',{message:`Social input ${pending.id}`,tree:tree.sha,parents:[]});
   pending.sha=commit.sha;savePending();
   await api('git/refs','POST',{ref:`refs/heads/social-input/${pending.id}`,sha:commit.sha});await dispatch();await refresh();
  }catch(e){say(e.message+'。受付情報を保持しました。確認後に同じ受付IDで再依頼できます。');}
  finally{busy=false;control();renderRows();if(pending&&!poll)poll=setInterval(()=>{if(!document.hidden)refresh().catch(e=>say(e.message));},15000);}
  return receiptId;
 }
 auto.onchange=()=>run({action:'refill_settings',enabled:auto.checked});
 refillButton.onclick=()=>run({action:'refill'});
 $('socialSearch').oninput=render;
 $('socialFilter').onchange=render;
 $('socialLocationImport').onclick=()=>run({action:'location'});
 $('socialConnect').onclick=()=>run({action:'connect'});
 $('socialSync').onclick=()=>run({action:'sync'});
 $('socialRefresh').onclick=()=>refresh().catch(e=>say(e.message));
 $('socialResume').onclick=async()=>{if(busy)return;busy=true;const previous=pending;try{await refresh();if(!pending&&previous&&state.requests?.[previous.id]?.status==='failed'){pending=previous;savePending();}if(pending){if(!pending.sha){pending=null;savePending();say('未送信の受付情報を取り消しました。操作をやり直してください');}else{try{await api(`git/refs`,'POST',{ref:`refs/heads/social-input/${pending.id}`,sha:pending.sha});}catch(e){if(e.status!==422)throw e;}await dispatch();}}}catch(e){say(e.message);}finally{busy=false;control();}};
 $('socialSaveBody').onclick=()=>run({action:'settings',body:$('socialBody').value});
 $('socialLoadBody').onclick=()=>{$('socialBody').value=state.settings?.body||'';say('保存済み定型文を読み込みました');};
 $('socialSelectAll').onclick=()=>{for(const input of $('socialVideos').querySelectorAll('input[data-video]'))input.checked=!input.disabled;};
 $('socialBuild').onclick=()=>{queueReview=false;try{const videos=selectedVideos(),channels=selectedChannels();if(!videos.length||!channels.length)throw Error('動画と投稿先を選んでください');const all=composeRows(videos,channels,$('socialBody').value,$('socialStart').value,Number($('socialInterval').value));rows=reviewRows(all.filter(r=>!(r.service==='youtube'&&state.videos[r.video_id]?.youtube_route==='direct')&&!state.videos[r.video_id]?.management?.skipped_channels?.includes(r.channel_id)),state.posts);const skipped=all.length-rows.length;renderRows();const descriptions=videos.map(v=>v.social?.description).filter(Boolean);const duplicate=descriptions.length>1&&new Set(descriptions).size===1?'全動画の説明文が完全一致しています。内容を確認してください。 ':'';say(`${duplicate}各投稿を開いて日時・本文を確認し、一括予約を押してください。投稿は公開設定で予約します。予約済み・成功済み・結果確認中など${skipped}件は対象から除外しました。`);}catch(e){say(e.message);}};
 $('socialSubmit').onclick=()=>{if(rows.length)run({action:queueReview?'queue_waiting':'submit',posts:rows.map(({video_id,channel_id,title,body,due_at,retry_buffer_id})=>({video_id,channel_id,title,body,due_at,retry_buffer_id}))});};
 $('socialStart').value=jstInput(new Date(Date.now()+3600000).toISOString());
 window.addEventListener('social-prepare',e=>{if(e.detail.navigate!==false)navigate('social');run({action:'import',run_id:e.detail.runId});});
 $('repo').addEventListener('change',()=>{state={videos:{},posts:{},channels:[],settings:{}};rows=[];queueReview=false;loadPending();render();renderRows();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!panel.hidden)refresh().catch(e=>say(e.message));});
 window.postingAdapters ||= {};
 window.postingAdapters.social={snapshot:()=>state,refresh,xAction:request=>run(request),saveDraft:draft=>run({action:'foundation_save',draft}),cancelDraft:draft=>run({action:'foundation_cancel',draft}),withdraw:id=>run({action:'withdraw',video_id:id}),withdrawBulk:ids=>run({action:'withdraw_bulk',video_ids:ids}),canWithdraw:id=>canWithdrawVideo(state.videos[id],state.posts),manage:request=>run({action:'manage',...request}),select:ids=>{ const old=selectedVideos().map(v=>v.id).sort().join('|');if(old!==[...ids].sort().join('|')){rows=[];renderRows();} $('socialFilter').value='all';render();for(const input of $('socialVideos').querySelectorAll('input[data-video]'))input.checked=ids.includes(input.dataset.video)&&!input.disabled;},busy:()=>busy||Boolean(pending)};
 loadPending();navigate($('token').value.trim()?'production':'settings');control();
}

