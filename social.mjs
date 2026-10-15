const $=id=>document.getElementById(id);
const STATE='contents/state.json?ref=social-state';
const WORKFLOW='social_publish.yml';
const LABELS={ready:'未送信',waiting:'予約枠待ち',unknown:'結果確認中（再送保留）',scheduled:'予約済み',sending:'公開処理中',published:'投稿完了',failed:'失敗',expired:'日時の再設定が必要',approval_required:'Bufferで承認が必要',manual_required:'手動投稿の設定です'};
const MEDIA={tiktok:'TikTok',instagram:'Instagramリール',youtube:'YouTubeショート'};
const CLOUD={pending:'転送待ち',setup_required:'Cloudinary設定待ち',error:'転送失敗',uploaded:'転送済み',deleted:'投稿後削除済み'};
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
function decode(content){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g,'')),c=>c.charCodeAt(0))));}
export function jstInput(iso){return new Date(new Date(iso).getTime()+9*3600000).toISOString().slice(0,16);}
export function utcFromJst(value){if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))throw Error('日本時間の投稿日時を指定してください');const d=new Date(value+':00+09:00');if(!Number.isFinite(d.getTime()))throw Error('投稿日時が不正です');return d.toISOString();}
export function suggestedTitle(tarot){
 const names={aries:['牡羊座','おひつじ座'],taurus:['牡牛座','おうし座'],gemini:['双子座','ふたご座'],cancer:['蟹座','かに座'],leo:['獅子座','しし座'],virgo:['乙女座','おとめ座'],libra:['天秤座','てんびん座'],scorpio:['蠍座','さそり座'],sagittarius:['射手座','いて座'],capricorn:['山羊座','やぎ座'],aquarius:['水瓶座','みずがめ座'],pisces:['魚座','うお座']};
 const n=names[tarot.zodiac];if(!n)throw Error('星座が不正です');return `【${n[0]}】${tarot.year}年${tarot.month}月${{full:'',first:'前半',second:'後半'}[tarot.period||'full']}「${n[1]}の運勢」`;
}
export function composeRows(videos,channels,body,start,interval){
 const base=new Date(utcFromJst(start)).getTime();if(!Number.isFinite(interval)||interval<1||interval>10080)throw Error('投稿間隔は1〜10080分にしてください');
 return videos.flatMap((v,i)=>channels.map(c=>({video_id:v.id,channel_id:c.id,service:c.service,title:v.title,body,due_at:new Date(base+i*interval*60000).toISOString()})));
}

export function mountSocial(){
 const panel=$('socialPanel');if(!panel)return;
 let state={videos:{},posts:{},channels:[],settings:{}},rows=[],busy=false,pending=null,poll=null;
 const api=(...args)=>{if(!window.videoStudioApi)throw Error('GitHubへ接続してください');return window.videoStudioApi(...args);};
 const key=()=>`social-request-v1:${$('repo').value.trim()}`;
 const say=t=>$('socialStatus').textContent=t;
 const savePending=()=>{if(pending)localStorage.setItem(key(),JSON.stringify(pending));else localStorage.removeItem(key());};
 const loadPending=()=>{try{pending=JSON.parse(localStorage.getItem(key())||'null');}catch{pending=null;}};
 const control=()=>{for(const b of panel.querySelectorAll('button[data-social-action]'))b.disabled=busy||Boolean(pending);$('socialResume').hidden=!pending;$('socialResume').disabled=busy;};
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
  $('socialVideos').replaceChildren();
  for(const v of Object.values(state.videos).reverse()){
   const box=el('article');box.className='item';const l=el('label'),input=el('input');input.type='checkbox';input.dataset.video=v.id;input.disabled=v.cloud.status!=='uploaded';input.checked=selected.has(v.id)&&!input.disabled;l.className='check';l.append(input,el('strong',v.title));box.append(l,el('p',CLOUD[v.cloud.status]||v.cloud.status));
   if(v.cloud.error)box.append(el('p',v.cloud.error));if(v.cloud.delete_error)box.append(el('p',v.cloud.delete_error));
   if(['error','setup_required','pending'].includes(v.cloud.status)){const retry=el('button','この動画の生成結果から転送を再試行');retry.className='secondary';retry.dataset.socialAction='import';retry.onclick=()=>run({action:'import',run_id:v.run_id});box.append(retry);}
   $('socialVideos').append(box);
  }
  if(!Object.keys(state.videos).length)$('socialVideos').append(el('p','新しく生成した動画は、生成完了後にここへ登録されます。生成履歴の「投稿を準備する」からも取り込めます。'));
  $('socialPosts').replaceChildren();
  for(const p of Object.values(state.posts).reverse()){
   const box=el('article');box.className='item';box.append(el('strong',p.title),el('p',`${MEDIA[p.service]} · ${LABELS[p.status]||p.status}`),el('p',`日本時間：${jstInput(p.remote_due_at||p.due_at).replace('T',' ')}`));
   const c=state.channels.find(c=>c.id===p.channel_id);if(c)box.append(el('p',c.name));
   if(p.error&&['failed','unknown','waiting','expired'].includes(p.status))box.append(el('p',p.error));
   if(['ready','waiting','failed','expired'].includes(p.status)&&!p.buffer_id){const retry=el('button','日時・投稿文を確認して追加予約');retry.className='secondary';retry.onclick=()=>{rows=[{...p}];renderRows();$('socialReview').scrollIntoView({behavior:'smooth'});};box.append(retry);}
   if(p.buffer_id){const a=el('a','Bufferで確認・変更');a.href='https://publish.buffer.com/';a.target='_blank';a.rel='noopener noreferrer';box.append(a);}
   $('socialPosts').append(box);
  }
  control();
 }
 function renderRows(){
  $('socialReview').replaceChildren();$('socialCount').textContent=`${new Set(rows.map(r=>r.video_id)).size}動画・${rows.length}投稿を確認中。予約枠不足の分は待機します。`;
  rows.forEach((r,i)=>{
   const box=el('details');box.open=rows.length===1;box.className='item';const c=state.channels.find(c=>c.id===r.channel_id);box.append(el('summary',`${i+1}. ${r.title} ／ ${MEDIA[r.service]}・${c?.name||r.channel_id}`));
   const time=field(box,'投稿日時（日本時間）',jstInput(r.due_at),'datetime-local');time.onchange=()=>{try{r.due_at=utcFromJst(time.value);}catch(e){say(e.message);}};
   const title=field(box,'タイトル',r.title);title.maxLength=100;title.oninput=()=>r.title=title.value;
   const body=field(box,r.service==='youtube'?'説明文':'本文（冒頭にタイトルを自動追加）',r.body,'textarea');body.rows=4;body.oninput=()=>r.body=body.value;
   const remove=el('button','この投稿を対象から外す');remove.className='secondary';remove.onclick=()=>{rows.splice(i,1);renderRows();};box.append(remove);$('socialReview').append(box);
  });
  $('socialSubmit').disabled=!rows.length||busy||Boolean(pending);
 }
 async function refresh(){
  try{state=decode((await api(STATE)).content);}catch(e){if(e.status!==404)throw e;}
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
 $('socialConnect').onclick=()=>run({action:'connect'});
 $('socialSync').onclick=()=>run({action:'sync'});
 $('socialRefresh').onclick=()=>refresh().catch(e=>say(e.message));
 $('socialResume').onclick=async()=>{if(busy)return;busy=true;try{await refresh();if(pending){if(!pending.sha){pending=null;savePending();say('未送信の受付情報を取り消しました。操作をやり直してください');}else{try{await api(`git/refs`,'POST',{ref:`refs/heads/social-input/${pending.id}`,sha:pending.sha});}catch(e){if(e.status!==422)throw e;}await dispatch();}}}catch(e){say(e.message);}finally{busy=false;control();}};
 $('socialSaveBody').onclick=()=>run({action:'settings',body:$('socialBody').value});
 $('socialLoadBody').onclick=()=>{$('socialBody').value=state.settings?.body||'';say('保存済み定型文を読み込みました');};
 $('socialSelectAll').onclick=()=>{for(const input of $('socialVideos').querySelectorAll('input[data-video]'))input.checked=!input.disabled;};
 $('socialBuild').onclick=()=>{try{const videos=selectedVideos(),channels=selectedChannels();if(!videos.length||!channels.length)throw Error('動画と投稿先を選んでください');rows=composeRows(videos,channels,$('socialBody').value,$('socialStart').value,Number($('socialInterval').value));renderRows();say('各投稿を開いて日時・本文を確認し、一括予約を押してください。投稿は公開設定で予約します。');}catch(e){say(e.message);}};
 $('socialSubmit').onclick=()=>{if(rows.length)run({action:'submit',posts:rows.map(({video_id,channel_id,title,body,due_at})=>({video_id,channel_id,title,body,due_at}))});};
 $('socialStart').value=jstInput(new Date(Date.now()+3600000).toISOString());
 window.addEventListener('social-prepare',e=>{navigate('social');run({action:'import',run_id:e.detail.runId});});
 $('repo').addEventListener('change',()=>{state={videos:{},posts:{},channels:[],settings:{}};rows=[];loadPending();render();renderRows();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!panel.hidden)refresh().catch(e=>say(e.message));});
 loadPending();navigate($('token').value.trim()?'production':'settings');control();
}
