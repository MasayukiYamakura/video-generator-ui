import {generatedTime,sourceLink,previewLink} from './video-list.mjs?v=posting-20261022';
const GROUP={attention:'要対応',progress:'進行中',completed:'完了',skipped:'見送り',all:'すべて'};
const STATUS={rejected:'公開設定の変更が拒否されました',ready:'未送信',waiting:'予約枠待ち',api_wait:'API利用上限による保留',channel_wait:'投稿先の対応待ち',unknown:'結果不明・照合が必要',scheduled:'予約済み',sending:'公開処理中',published:'公開済み',unlisted:'限定公開',failed:'失敗',expired:'期限切れ',approval_required:'承認待ち',manual_required:'手動投稿待ち',private_ready:'非公開・公開判断待ち',processing:'YouTube処理中',overdue:'予約時刻経過・未確認',needs_review:'状態確認が必要',unavailable:'状態を取得できません',uploaded:'非公開送信済み・要照合',resumable:'送信の確認・再開が必要',pending:'転送待ち',setup_required:'接続設定待ち',error:'転送失敗',deleted:'配信用ファイル削除済み',withdrawn:'取り下げ済み'};
const MEDIA={youtube:'YouTubeショート',instagram:'Instagramリール',tiktok:'TikTok'};
const $=id=>document.getElementById(id);
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function fileStatus(kind,video){
 if(kind==='social'){
  const status=video.cloud?.status;
  if(status==='withdrawn')return 'Cloudinary：削除済み（投稿せず）';
  if(status==='deleted')return 'Cloudinary：削除済み（投稿完了後）';
  if(status==='uploaded')return 'Cloudinary：保存中';
  if(status==='pending')return 'Cloudinary：転送待ち';
  if(status==='setup_required')return 'Cloudinary：未転送（設定待ち）';
  if(status==='error')return 'Cloudinary：転送失敗';
  return 'Cloudinary：状態未確認';
 }
 if(video.expires_at){
  return Date.parse(video.expires_at)<=Date.now()?'元動画（GitHub成果物）：保存期限切れ':'元動画（GitHub成果物）：保存期限内';
 }
 return '元動画（GitHub成果物）：保存状態未確認';
}
export function postingRows(adapters){
 const result=[];
 for(const kind of ['social','youtube']){
  const state=adapters[kind]?.snapshot()||{};
  for(const video of Object.values(state.videos||{})){
   const posts=Object.values(state[kind==='youtube'?'uploads':'posts']||{}).filter(p=>p[kind==='youtube'?'source_id':'video_id']===video.id);
   const targets=video.management?.target_channels||[...new Set(posts.map(p=>p.channel_id))];
   const skipped=video.management?.skipped_channels||[];
   const relevant=posts.filter(p=>!skipped.includes(p.channel_id));
   const status=p=>kind==='youtube'?(p.publication&&['unknown','needs_review','rejected','overdue'].includes(p.publication.status)?p.publication.status:p.remote?.state||p.status):p.status;
   const unresolved=posts.some(p=>['unknown','failed','expired','unavailable','needs_review','overdue','rejected','resumable','channel_wait','approval_required','manual_required'].includes(status(p)));
   let group='attention';
   const decision=video.management?.decision;
   if(decision==='skipped'||video.archived_at||video.cloud?.status==='withdrawn')group='skipped';
   else if(decision==='private_complete')group='completed';
   else if(kind==='youtube'){
    if(posts.length&&posts.every(p=>['published','unlisted'].includes(status(p))))group='completed';
    else if(posts.length&&posts.every(p=>['scheduled','processing'].includes(status(p))))group='progress';
   }else if(targets.length&&targets.every(id=>skipped.includes(id)||posts.some(p=>p.channel_id===id&&p.status==='published')))group='completed';
   else if(relevant.length&&!unresolved&&relevant.every(p=>['scheduled','sending','published'].includes(p.status)))group='progress';
   if(kind==='social'&&video.cloud?.status==='deleted'&&!unresolved)group='completed';
   const lines=[fileStatus(kind,video),...posts.map(p=>`${kind==='youtube'?'YouTube':MEDIA[p.service]||p.service}：${(status(p)==='private_ready'&&(decision==='skipped'||decision==='private_complete')?'非公開で保存済み':STATUS[status(p)]||status(p))}${skipped.includes(p.channel_id)?'（この投稿先は見送り）':''}`)];
   if(!posts.length)lines.push(kind==='youtube'?'YouTube：未送信':'投稿先：未登録');
   result.push({key:`${kind}/${video.id}`,kind,video,posts,group,unresolved,lines,type:video.tarot?(video.tarot.subject_kind==='mbti'?'MBTI':'星座'):'思想'});
  }
 }
 return result.sort((a,b)=>(Date.parse(b.video.generated_at)||0)-(Date.parse(a.video.generated_at)||0));
}
export function mountPostingManager(){
 const panel=$('socialPanel');if(!panel)return;
 const adapters=window.postingAdapters||{};
 let selected=null,checked=new Set(),group='attention',ready=false;
 const manager=el('div');manager.id='postingManager';
 const title=el('h2','動画投稿管理'),tabs=el('div');tabs.className='posting-tabs';
 const tools=el('div');tools.className='posting-tools';
 const search=el('input');search.type='search';search.placeholder='動画名・生成日・星座・MBTI・実行IDを検索';search.setAttribute('aria-label','動画を検索');
 const format=el('select');format.setAttribute('aria-label','動画形式');for(const [v,t] of [['all','縦型・横型すべて'],['social','縦型'],['youtube','横型']]){const o=el('option',t);o.value=v;format.append(o);}
 const type=el('select');type.setAttribute('aria-label','動画種類');for(const t of ['すべての種類','思想','星座','MBTI']){const o=el('option',t);o.value=t;type.append(o);}
 const service=el('select');service.setAttribute('aria-label','投稿先で絞り込み');for(const [v,t] of [['all','すべての投稿先'],['youtube','YouTube通常動画'],['shorts','YouTubeショート'],['instagram','Instagram'],['tiktok','TikTok']]){const o=el('option',t);o.value=v;service.append(o);}
 const refresh=el('button','画面を更新');refresh.className='secondary';const sync=el('button','投稿先の最新状態を確認');sync.className='secondary';
 const message=el('p');message.id='postingMessage';message.setAttribute('role','status');
 tools.append(search,format,type,service,refresh,sync);manager.append(title,tabs,tools,message);
 const refillPanel=$('socialRefillPanel');if(refillPanel)manager.append(refillPanel);
 const bulk=el('div');bulk.className='actions';const all=el('button','表示中の動画を全選択'),skip=el('button','選択した動画を見送る'),restore=el('button','選択した動画を作業に戻す'),prepare=el('button','選択した縦型の投稿を準備'),removeSelected=el('button','選択した縦型の配信用ファイルを削除');
 for(const b of [all,skip,restore,prepare,removeSelected]){b.className='secondary';bulk.append(b);}manager.append(bulk);
 const layout=el('div');layout.className='posting-layout';const list=el('div');list.id='postingList';const inspector=el('section');inspector.id='postingInspector';inspector.hidden=true;const back=el('button','一覧に戻る');back.className='secondary';const detail=el('div');inspector.append(back,detail);layout.append(list,inspector);manager.append(layout);
 // Keep the existing, tested editors and request recovery controls as the detail workspace.
 const workspace=el('div');workspace.id='postingWorkspace';workspace.hidden=true;
 while(panel.firstChild)workspace.append(panel.firstChild);
 panel.append(manager);inspector.append(workspace);
 const yt=$('youtubePanel');yt.querySelector('summary').textContent='YouTubeの投稿操作';yt.querySelector('p').hidden=true;
 const children=[...workspace.children];const yi=children.indexOf(yt);const socialEditor=el('div');socialEditor.id='postingSocialEditor';for(const n of children.slice(yi+1))socialEditor.append(n);workspace.append(socialEditor);
 const settings=el('details');settings.id='postingSettings';settings.append(el('summary','接続・定型文・詳細設定'));panel.append(settings);
 // Move settings blocks out of the everyday list. IDs and form handlers are preserved.
 const moveRange=(start,end)=>{let n=start;while(n&&n!==end){const next=n.nextSibling;settings.append(n);n=next;}};
 moveRange($('youtubeSetup'),$('youtubeStatus'));settings.append($('youtubeConnect'),$('socialConnect'));
 moveRange($('socialSetup'),$('socialStatus'));
 moveRange($('socialLocationStatus').previousElementSibling,$('socialChannels').previousElementSibling);
 moveRange($('socialBody').parentElement,$('socialStart').parentElement);
 // The unified list owns discovery; legacy lists remain only as selection plumbing.
 for(const id of ['socialVideos','youtubeVideos','socialSearch','socialFilter','youtubeSearch','youtubeFilter','socialSelectAll','youtubeVideo']){const n=$(id);n.hidden=true;if(n.parentElement.tagName==='LABEL')n.parentElement.hidden=true;}
 for(const editor of [yt,socialEditor])for(const n of editor.querySelectorAll('h2,h3,p.muted'))n.hidden=true;
 const uploadForm=el('div');uploadForm.id='postingUploadForm';yt.insertBefore(uploadForm,$('youtubeSelected'));let uploadNode=$('youtubeSelected');while(uploadNode&&uploadNode!==$('youtubeReview')){const next=uploadNode.nextSibling;uploadForm.append(uploadNode);uploadNode=next;}
 const socialPosts=$('socialPosts'),youtubePosts=$('youtubeUploads');
 function rows(){return postingRows(adapters);}
 function visible(){return rows().filter(r=>(group==='all'||r.group===group)&&(format.value==='all'||r.kind===format.value)&&(type.value==='すべての種類'||r.type===type.value)&&(service.value==='all'||(service.value==='youtube'?r.kind==='youtube':r.kind==='social'&&(r.posts.some(p=>p.service===(service.value==='shorts'?'youtube':service.value))||!r.posts.length)))&&`${r.video.filename} ${r.video.id} ${r.video.run_id} ${generatedTime(r.video)} ${r.video.tarot?.zodiac||''}`.toLowerCase().includes(search.value.trim().toLowerCase()));}
 function render(){
  tabs.replaceChildren();for(const [key,label] of Object.entries(GROUP)){const count=key==='all'?rows().length:rows().filter(r=>r.group===key).length;const b=el('button',`${label} ${count}`);b.className='secondary';b.setAttribute('aria-pressed',String(group===key));b.onclick=()=>{group=key;checked.clear();render();};tabs.append(b);}
  const items=visible();list.replaceChildren();
  for(const r of items){const card=el('article');card.className='posting-card';card.dataset.group=r.group;
   const choice=el('input');choice.type='checkbox';choice.checked=checked.has(r.key);choice.setAttribute('aria-label',`${r.video.filename}を選択`);choice.onchange=()=>{choice.checked?checked.add(r.key):checked.delete(r.key);};
   const open=el('button',r.video.filename?.replace(/\.mp4$/i,'')||r.video.id);open.className='posting-title';open.onclick=()=>select(r);
   const thumb=el('img');thumb.className='posting-thumb';thumb.loading='lazy';thumb.alt='動画のサムネイル';
   const cloud=previewLink(r.video);const remote=r.posts.find(p=>/^[\w-]{11}$/.test(p.video_id||''));
   if(cloud){thumb.src=cloud.replace('/upload/','/upload/so_0,w_160,h_90,c_fill/').replace(/\.[a-z0-9]+(?:\?.*)?$/i,'.jpg');card.append(thumb);}
   else if(r.kind==='youtube'&&remote){thumb.src=`https://i.ytimg.com/vi/${remote.video_id}/default.jpg`;card.append(thumb);}
   thumb.onerror=()=>{thumb.hidden=true;};
   card.append(choice,open,el('p',`${r.kind==='youtube'?'横型':'縦型'} · ${r.type} · ${generatedTime(r.video)} · ${r.video.id.slice(-12)}`),el('span',GROUP[r.group]+(r.unresolved?'・未解決あり':'')));
   for(const line of r.lines)card.append(el('p',line));list.append(card);
  }
  if(!items.length)list.append(el('p','該当する動画はありません。'));
  const r=rows().find(r=>r.key===selected);if(r)renderDetail(r);else if(selected)close();
  const busy=Object.values(adapters).some(a=>a.busy());for(const b of [skip,restore,prepare,removeSelected,sync])b.disabled=busy;
  // Recovery stays visible even when no video has been selected.
  for(const id of ['socialStatus','youtubeStatus','socialResume','youtubeRecover']){const n=$(id);if(n&&n.parentElement!==manager)manager.append(n);}
 }
 function renderDetail(r){
  detail.replaceChildren(el('h3',r.video.filename),el('p',`${GROUP[r.group]} ／ ${fileStatus(r.kind,r.video)}${r.unresolved?'・未解決の結果があります。投稿先を照合してください。':''}`));
  const href=previewLink(r.video)||sourceLink(r.video,$('repo').value.trim());if(href){const a=el('a','動画を確認・ダウンロード');a.href=href;a.target='_blank';a.rel='noopener noreferrer';detail.append(a);}
  const related=rows().filter(v=>v.key!==r.key&&v.video.receipt_id===r.video.receipt_id&&((v.video.target_id||v.video.id.split(':')[1])===(r.video.target_id||r.video.id.split(':')[1])));for(const other of related){const b=el('button',`関連する${other.kind==='youtube'?'横型':'縦型'}を開く`);b.className='secondary';b.onclick=()=>select(other);detail.append(b);}
  const actions=el('div');actions.className='actions';for(const [decision,label] of [['skipped',r.posts.length&&r.kind==='youtube'?'公開を見送る':'投稿を見送る'],['active','投稿作業に戻す'],...(r.kind==='youtube'?[['private_complete','非公開のまま完了する']]:[])]){const b=el('button',label);b.className='secondary';b.disabled=adapters[r.kind].busy();b.onclick=()=>manage([r],decision);actions.append(b);}detail.append(actions);
  if(r.kind==='social')for(const c of adapters.social.snapshot().channels||[]){const skipped=r.video.management?.skipped_channels?.includes(c.id);const intended=(r.video.management?.target_channels||r.posts.map(p=>p.channel_id)).includes(c.id);const b=el('button',`${MEDIA[c.service]}：${skipped?'投稿対象に戻す':intended?'この投稿先を見送る':'投稿対象に追加する'}`);b.className='secondary';b.disabled=adapters.social.busy();b.onclick=()=>manage([r],skipped||!intended?'active':'skipped',c.id);detail.append(b);}
  if(r.kind==='social'&&adapters.social.canWithdraw(r.video.id)){const files=el('details');files.append(el('summary','ファイルの管理'));const remove=el('button','投稿せずCloudinaryのファイルを削除する');remove.className='secondary';remove.disabled=adapters.social.busy();remove.onclick=()=>{if(confirm('Cloudinaryの配信用ファイルを削除します。元に戻せません。元の生成成果物や投稿先の動画は削除しません。実行しますか？'))adapters.social.withdraw(r.video.id);};files.append(remove);detail.append(files);}
  const info=el('details');info.append(el('summary','識別情報・操作履歴'),el('p',`生成実行ID：${r.video.run_id||'不明'} ／ 動画ID：${r.video.id}`));for(const h of r.video.management?.history||[])info.append(el('p',`${h.at} ${h.decision}${h.channel_id?' ／ '+h.channel_id:''}`));detail.append(info);
  yt.hidden=r.kind!=='youtube';yt.open=true;socialEditor.hidden=r.kind!=='social';
  for(const container of [socialPosts,youtubePosts])for(const n of container.querySelectorAll('[data-posting-video]'))n.hidden=n.dataset.postingVideo!==r.video.id;
  for(const container of [socialPosts,youtubePosts])for(const n of container.querySelectorAll('details'))n.open=true;
  const closed=r.group==='skipped'||r.video.management?.decision==='private_complete';
  uploadForm.hidden=closed||r.posts.length>0;
  $('youtubeBuild').hidden=closed||r.posts.length>0;
  $('youtubeSubmit').hidden=!$('youtubeReview').children.length;$('socialBuild').hidden=closed;
  // Only the selected video may be acted on; keep external state changes visible.
  if(r.kind==='youtube')for(const n of yt.querySelectorAll('[data-youtube-operation="review"]'))n.hidden=closed;
 }
 function select(r){selected=r.key;checked.clear();checked.add(r.key);adapters[r.kind].select(r.kind==='youtube'?r.video.id:[r.video.id]);inspector.hidden=false;workspace.hidden=false;render();if(window.matchMedia?.('(max-width: 760px)').matches)inspector.scrollIntoView({behavior:'smooth'});}
 function close(){selected=null;inspector.hidden=true;workspace.hidden=true;}
 async function manage(items,decision,channel){
  if(!items.length){message.textContent='動画を選択してください';return;}
  const text=decision==='active'?'投稿作業に戻します。':'一覧を整理します。予約は取り消されません。YouTubeの動画は現在の公開設定のまま残り、ファイルは削除しません。';
  if(!confirm(`${items.length}件：${items.map(r=>r.video.filename).join('、')}\n${text}`))return;
  for(const kind of ['social','youtube']){const subset=items.filter(r=>r.kind===kind);if(subset.length){if(adapters[kind].busy()){message.textContent='受付中の処理結果を確認してから操作してください';continue;}await adapters[kind].manage({video_ids:subset.map(r=>r.video.id),decision,...(channel?{channel_id:channel}:{})});}}
  message.textContent='整理操作を受け付けました。結果は受付状況と一覧で確認できます。';render();
 }
 all.onclick=()=>{checked=new Set(visible().map(r=>r.key));render();};
 skip.onclick=()=>manage(visible().filter(r=>checked.has(r.key)),'skipped');restore.onclick=()=>manage(visible().filter(r=>checked.has(r.key)),'active');
 removeSelected.onclick=async()=>{
  const chosen=visible().filter(r=>checked.has(r.key));
  if(!chosen.length){message.textContent='動画を選択してください';return;}
  const eligible=chosen.filter(r=>r.kind==='social'&&adapters.social.canWithdraw(r.video.id));
  const excluded=chosen.length-eligible.length;
  if(eligible.length>100){message.textContent='一度に削除できるのは100本までです。選択を分けてください';return;}
  if(!eligible.length){message.textContent='削除できる縦型動画がありません。横型やBuffer登録済み・結果確認中の動画は対象外です。';return;}
  if(adapters.social.busy()){message.textContent='受付中の処理結果を確認してから操作してください';return;}
  const names=eligible.map(r=>r.video.filename||r.video.id).join('、');
  if(!confirm(`Cloudinaryの配信用ファイルを${eligible.length}本削除します（対象外${excluded}本）。\n${names}\n元に戻せません。生成成果物やSNS上の動画は削除しません。実行しますか？`))return;
  await adapters.social.withdrawBulk(eligible.map(r=>r.video.id));
  message.textContent=`一括削除${eligible.length}本を受け付けました。処理後、受付結果と一覧を確認してください。失敗分は再選択できます。`;
  render();
 };
 prepare.onclick=()=>{const items=visible().filter(r=>checked.has(r.key)&&r.kind==='social'&&r.group!=='skipped');if(!items.length){message.textContent='縦型動画を選択してください';return;}select(items[0]);adapters.social.select(items.map(r=>r.video.id));checked=new Set(items.map(r=>r.key));render();message.textContent=`${items.length}本の縦型を選択しました。下の投稿先・日時を確認してください。`;};
 refresh.onclick=async()=>{for(const a of Object.values(adapters))try{await a.refresh();}catch(e){message.textContent=e.message;}render();};
 sync.onclick=()=>{if(confirm('縦型は公開結果の照合と従来のCloudinary削除条件の確認、横型はYouTubeの状態照合を行います。実行しますか？')){$('socialSync').click();$('youtubeSync').click();}};
 for(const n of [search,format,type,service])n.addEventListener(n===search?'input':'change',()=>{checked.clear();render();});back.onclick=close;
 window.addEventListener('posting-state',()=>{if(ready)render();});$('repo').addEventListener('change',()=>{close();checked.clear();render();});
 ready=true;render();
}
