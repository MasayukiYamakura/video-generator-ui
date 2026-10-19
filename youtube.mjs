import {socialBody} from './builder/social-data.mjs?v=mbti-20261019';
const $=id=>document.getElementById(id);
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const LABEL={uploaded:'非公開アップロード済み（動画の処理完了はStudioで確認）',resumable:'一部送信済み・同じ送信から再開可能',unknown:'結果確認中・新規送信は保留'};
export function privateUpload(video, channel, fields){
 if(!video||video.format!=='landscape'||!channel?.id)throw Error('横型動画と接続済みチャンネルを選択してください');
 const title=fields.title.trim(),description=fields.description;
 if(!title||Array.from(title).length>100||/[<>\x00-\x1f]/.test(title)||new TextEncoder().encode(description).length>5000||/[<>\x00]/.test(description))throw Error('タイトルは1〜100文字、説明文は5000バイト以内、山括弧なしで指定してください');
 if(!fields.category_id||typeof fields.made_for_kids!=='boolean'||typeof fields.contains_synthetic_media!=='boolean')throw Error('カテゴリ・子ども向け・合成コンテンツを確認してください');
 return {action:'upload',confirmed:true,source_id:video.id,channel_id:channel.id,title,description,category_id:fields.category_id,privacy:'private',made_for_kids:fields.made_for_kids,contains_synthetic_media:fields.contains_synthetic_media};
}

export function mountYouTube(){
 const panel=$('youtubePanel');if(!panel)return;
 let state={videos:{},uploads:{},requests:{}},review=null,pending=null,busy=false,poll=null;
 const repo=()=>$('repo').value.trim();
 const key=()=>`youtube-request-v1:${repo()}`;
 const load=()=>{try{pending=JSON.parse(localStorage.getItem(key())||'null');}catch{pending=null;}};
 const save=()=>{if(pending)localStorage.setItem(key(),JSON.stringify(pending));else localStorage.removeItem(key());};
 const say=text=>$('youtubeStatus').textContent=text;
 const api=(...args)=>{if(!window.videoStudioApi)throw Error('GitHubへ接続してください');if(busy&&pending&&pending.repo!==repo())throw Error('受付時のリポジトリに戻してください');return window.videoStudioApi(...args);};
 const decode=text=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g,'')),c=>c.charCodeAt(0))));
 const invalidate=()=>{review=null;$('youtubeReview').replaceChildren();controls();};
 function controls(){
  $('repo').disabled=busy;
  for(const id of ['youtubeConnect','youtubeImport','youtubeBuild'])$(id).disabled=busy||Boolean(pending)||(id==='youtubeBuild'&&(!state.setup||!state.channel));
  $('youtubeSubmit').disabled=!review||busy||Boolean(pending);
  $('youtubeRecover').hidden=!pending;$('youtubeRecover').disabled=busy;
 }
 function selectVideo(){
  invalidate();const video=state.videos[$('youtubeVideo').value];
  $('youtubeTitle').value=video?.filename?.replace(/\.mp4$/i,'')||'';
  try{$('youtubeDescription').value=video?socialBody(video.social,video.tarot?.zodiac,''):'';}catch{$('youtubeDescription').value='';}
 }
 function render(){
  $('youtubeSetup').textContent=state.setup?`投稿先：${state.channel?.name||'接続確認が必要'} ${state.channel?.id||''}`:'初回認証・Secrets登録待ち（操作ガイド参照）';
  const selected=$('youtubeVideo').value;
  $('youtubeVideo').replaceChildren();
  for(const video of Object.values(state.videos||{})){
   const option=node('option',video.filename);option.value=video.id;$('youtubeVideo').append(option);
  }
  if(state.videos?.[selected])$('youtubeVideo').value=selected;else $('youtubeVideo').selectedIndex=0;
  const category=$('youtubeCategory').value;
  $('youtubeCategory').replaceChildren();
  for(const c of state.categories||[]){const option=node('option',c.name);option.value=c.id;$('youtubeCategory').append(option);}
  if((state.categories||[]).some(c=>c.id===(category||'24')))$('youtubeCategory').value=category||'24';
  $('youtubeUploads').replaceChildren();
  for(const post of Object.values(state.uploads||{})){
   const box=node('article');box.className='item';box.append(node('strong',post.metadata?.snippet?.title||post.source_id),node('p',LABEL[post.status]||'状態を確認してください'));
   if(post.error)box.append(node('p',post.error));
   if(/^[\w-]{11}$/.test(post.video_id||'')){
    const link=node('a','YouTube Studioで確認');link.href=`https://studio.youtube.com/video/${post.video_id}/edit`;link.target='_blank';link.rel='noopener noreferrer';box.append(link);
   }else{
    const button=node('button','同じ送信の状態確認・再開');button.className='secondary';button.disabled=busy||Boolean(pending)||!post.can_resume;
    button.onclick=()=>{review={action:'resume',confirmed:true,source_id:post.source_id,channel_id:post.channel_id};$('youtubeReview').replaceChildren(node('p',`${post.metadata?.snippet?.title} ／ ${post.channel_id} ／ 非公開の同じ送信のみ確認・再開します。新規アップロードは作りません。`));controls();};box.append(button);if(!post.can_resume)box.append(node('p','送信情報を確認できません。YouTube Studioで確認してください。新規送信は保留します。'));
   }
   $('youtubeUploads').append(box);
  }
  if(!state.videos?.[selected])selectVideo();controls();
 }
 async function refresh(){
  const repository=repo();
  try{const result=await api('contents/view.json?ref=youtube-state');if(repository!==repo())return;state=decode(result.content);}
  catch(e){if(e.status!==404)throw e;state={videos:{},uploads:{},requests:{}};}
  if(pending&&state.requests?.[pending.id]){
   const result=state.requests[pending.id];say(result.message||'処理中です。受付後は画面を閉じられます。');
   if(['completed','failed'].includes(result.status)){pending=null;save();invalidate();}
  }
  render();polling();
 }
 function polling(){
  if(pending&&!poll)poll=setInterval(()=>{if(!document.hidden)refresh().catch(e=>say(e.message));},15000);
  if(!pending&&poll){clearInterval(poll);poll=null;}
 }
 async function dispatch(){
  if(!pending?.sha)throw Error('入力保存が未完了です。受付確認からやり直してください');
  if(pending.repo!==repo())throw Error('受付時のリポジトリに戻してください');
  const ref=`git/ref/heads/youtube-input/${pending.id}`;
  try{const current=await api(ref);if(current.object.sha!==pending.sha)throw Error('受付入力が変更されています');}
  catch(e){if(e.status!==404)throw e;await api('git/refs','POST',{ref:`refs/heads/youtube-input/${pending.id}`,sha:pending.sha});}
  await api('actions/workflows/youtube_private.yml/dispatches','POST',{ref:'main',inputs:{receipt_id:pending.id,input_sha:pending.sha}});
  say('受け付けました。非公開の送信結果を一覧更新で確認してください。画面を閉じられます。');
 }
 async function run(request){
  if(busy||pending)return;busy=true;controls();
  try{
   if(!(await api('')).private)throw Error('非公開リポジトリを指定してください');
   pending={id:crypto.randomUUID(),repo:repo()};save();
   const blob=await api('git/blobs','POST',{content:JSON.stringify(request),encoding:'utf-8'});
   const tree=await api('git/trees','POST',{tree:[{path:'request.json',mode:'100644',type:'blob',sha:blob.sha}]});
   const commit=await api('git/commits','POST',{message:`YouTube private input ${pending.id}`,tree:tree.sha,parents:[]});
   pending.sha=commit.sha;save();await dispatch();invalidate();await refresh();
  }catch(e){say(e.message+'。受付情報がある場合は同じIDで確認してください。');}
  finally{busy=false;controls();polling();}
 }
 $('youtubeConnect').onclick=()=>run({action:'connect'});
 $('youtubeRefresh').onclick=()=>refresh().catch(e=>say(e.message));
 $('youtubeImport').onclick=()=>{const runId=$('youtubeRun').value.trim();if(!/^\d+$/.test(runId)){say('生成履歴の実行IDを指定してください');return;}run({action:'import',run_id:runId});};
 $('youtubeRecover').onclick=async()=>{if(busy)return;busy=true;controls();try{await refresh();if(pending){if(pending.sha)await dispatch();else{pending=null;save();say('送信前の受付を取り消しました。内容を確認してやり直してください');}}}catch(e){say(e.message);}finally{busy=false;controls();polling();}};
 $('youtubeVideo').onchange=selectVideo;
 for(const id of ['youtubeTitle','youtubeDescription','youtubeCategory','youtubeKids','youtubeSynthetic'])$(id).addEventListener('input',invalidate);
 $('youtubeBuild').onclick=()=>{try{
  const video=state.videos[$('youtubeVideo').value];
  if(Object.values(state.uploads||{}).some(p=>p.source_id===video?.id&&p.channel_id===state.channel?.id))throw Error('この動画には送信記録があります。下の記録から確認してください');
  if(!$('youtubeKids').value||!$('youtubeSynthetic').value)throw Error('子ども向け・合成コンテンツを選択してください');
  review=privateUpload(video,state.channel,{title:$('youtubeTitle').value,description:$('youtubeDescription').value,category_id:$('youtubeCategory').value,made_for_kids:$('youtubeKids').value==='yes',contains_synthetic_media:$('youtubeSynthetic').value==='yes'});
  $('youtubeReview').replaceChildren(node('strong',review.title),node('p',`投稿先：${state.channel.name} (${state.channel.id}) ／ 公開設定：非公開 ／ カテゴリ：${$('youtubeCategory').selectedOptions[0]?.textContent}`),node('p',`子ども向け：${review.made_for_kids?'はい':'いいえ'} ／ 改変・合成コンテンツ：${review.contains_synthetic_media?'はい':'いいえ'}`),node('p',review.description));controls();
 }catch(e){invalidate();say(e.message);}};
 $('youtubeSubmit').onclick=()=>{if(review)run({...review});};
 $('repo').addEventListener('change',()=>{state={videos:{},uploads:{},requests:{}};invalidate();load();render();polling();});
 window.addEventListener('youtube-prepare',e=>{document.querySelector('[data-studio-tab="social"]')?.click();panel.open=true;run({action:'import',run_id:e.detail.runId});});
 document.querySelector('[data-studio-tab="social"]')?.addEventListener('click',()=>refresh().catch(e=>say(e.message)));
 load();render();polling();
}
