import {countX} from './x-text.mjs?v=x-20261027';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const LABEL={waiting_youtube:'YouTube公開待ち',waiting:'予約枠待ち',api_wait:'API上限による保留',channel_wait:'接続の確認待ち',unknown:'結果不明・再送保留',scheduled:'予約済み',sending:'公開処理中',published:'公開済み',failed:'失敗',expired:'日時の再設定が必要',cancelled:'取消済み',manual_required:'手動投稿待ち',approval_required:'承認待ち'};
const $=id=>document.getElementById(id);
const jst=v=>new Date(Date.parse(v)+9*3600000).toISOString().slice(0,16);
export function mountXPublishing(){
 const host=$('postingSettings');if(!host)return;
 const adapter=window.postingAdapters.social;
 const section=el('details');section.id='xPublishing';section.append(el('summary','Xの投稿予約（初期OFF）'));
 const status=el('p');status.id='xStatus';status.setAttribute('role','status');section.append(status);
 const content=el('div');content.id='xContent';section.append(content);host.append(section);
 content.append(el('p','保存したX下書きを再読込して「この下書きを編集」で選んでください。本文を編集したら、保存・再読込してから予約します。新しい投稿は確認して確定したものだけ送ります。'));
 const field=(label,tag='input')=>{const l=el('label',label),n=el(tag);l.append(n);content.append(l);return n;};
 const channels=field('投稿先Xアカウント','select');channels.id='xChannel';
 const due=field('予約日時（日本時間）');due.id='xDue';due.type='datetime-local';due.value=jst(new Date(Date.now()+3600000).toISOString());
 const late=field('YouTube公開確認が遅れた場合、希望時刻から60分以内は確認時刻＋3分でBuffer登録する');late.type='checkbox';late.id='xAllowLate';
 const file=field('画像を取り込む（JPEG・PNG・WebP、2 MiB以内）');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.id='xImageFile';
 const upload=el('button','選択した画像を取り込む');upload.id='xUploadImage';content.append(upload);
 const images=field('画像形式で添付する取込済み画像','select');images.id='xImage';
 const deleteImage=el('button','選択画像の配信用ファイルを削除');content.append(deleteImage);const preview=el('img');preview.className='posting-thumb';preview.alt='選択した画像';preview.hidden=true;content.append(preview);
 const prepare=el('button','X予約内容を確認');prepare.id='xPrepare';
 const confirm=el('button','確認した内容でXへ予約');confirm.id='xSubmit';confirm.disabled=true;
 const sync=el('button','Xの投稿結果を照合');sync.id='xSync';
 content.append(prepare,confirm,sync);
 const review=el('div');review.id='xReview';const jobs=el('div');jobs.id='xJobs';content.append(review,jobs);
 let selected=null,confirmed=null,receipt=null,repo='',message='';
 const invalidate=()=>{confirmed=null;review.replaceChildren();confirm.disabled=true;};
 function snapshot(){return adapter.snapshot();}
 function controls(){const state=snapshot();content.hidden=state.x_enabled!==true&&!Object.keys(state.x_posts||{}).length;if(state.x_enabled!==true)confirmed=null;
  status.textContent=state.x_enabled?'X予約ON。予約枠待ちは既存の補充ボタン・自動補充設定を使用します。':'OFF：X_BUFFER_ENABLEDをtrueにして投稿先を取得してください。Buffer接続先の変更は本人が既存予約を確認後に行います。';
  if(message)status.textContent+=' ／ '+message;
  if(receipt){const result=state.requests?.[receipt];status.textContent+=` ／ 受付ID：${receipt} ／ ${result?.message||'受付を確認中。中断時は投稿管理の受付履歴から同じIDで再依頼してください。'}`;}
  const channel=channels.value;channels.replaceChildren();for(const c of state.channels||[]){if(c.service!=='x')continue;const o=el('option',c.name+' ／ '+c.id);o.value=c.id;channels.append(o);}if([...channels.options].some(o=>o.value===channel))channels.value=channel;
  if(!channels.options.length){const o=el('option','X未接続（投稿先を取得してください）');o.value='';channels.append(o);}
  const image=images.value;images.replaceChildren();const none=el('option','選択してください');none.value='';images.append(none);
  for(const item of Object.values(state.x_images||{})){if(item.status!=='uploaded')continue;const o=el('option',item.id);o.value=item.id;images.append(o);}images.value=image;const selectedImage=state.x_images?.[images.value];preview.hidden=!selectedImage;if(selectedImage)preview.src=selectedImage.url;else preview.removeAttribute('src');
  const busy=adapter.busy();for(const b of [prepare,upload,deleteImage])b.disabled=busy||state.x_enabled!==true;sync.disabled=busy;
  prepare.disabled ||= !selected||selected.service!=='x'||selected.status!=='draft'||!channels.value;
  confirm.disabled=busy||!confirmed||state.x_enabled!==true;
 }
 async function run(request){try{invalidate();message='';receipt=await adapter.xAction(request);controls();}catch(e){message=e.message;controls();}}
 function renderJobs(){jobs.replaceChildren();const state=snapshot();
  for(const job of Object.values(state.x_posts||{}).reverse()){
   const box=el('article');box.className='item';box.append(el('strong',job.title),el('p',`${job.channel.name} ／ ${LABEL[job.status]||job.status} ／ 日本時間 ${jst(job.due_at).replace('T',' ')}`),el('p',job.payload.text));if(job.error)box.append(el('p',job.error));
   const link=el('a','Bufferで確認・変更');link.href='https://publish.buffer.com/';link.target='_blank';link.rel='noopener noreferrer';box.append(link);
   if(['waiting','waiting_youtube','api_wait','channel_wait','expired','failed'].includes(job.status)){
    const time=el('input');time.type='datetime-local';time.value=jst(new Date(Math.max(Date.now()+3600000,Date.parse(job.due_at))).toISOString());time.setAttribute('aria-label','X再予約日時（日本時間）');box.append(time);
    const retry=el('button',job.buffer_id?'同じBuffer投稿IDで再予約':'日時を確認して補充・再試行');retry.disabled=adapter.busy()||state.x_enabled!==true;retry.onclick=()=>{if(window.confirm('保存済みの本文・素材で再試行します。日時を確認しましたか？'))run({action:'x_retry',job_id:job.id,due_at:new Date(time.value+':00+09:00').toISOString(),confirmed:true});};box.append(retry);
    if(!job.buffer_id){const cancel=el('button','このX予約待ちを取り消す');cancel.disabled=adapter.busy()||state.x_enabled!==true;cancel.onclick=()=>{if(window.confirm('Buffer未登録の予約待ちを取り消しますか？'))run({action:'x_cancel',job_id:job.id,confirmed:true});};box.append(cancel);}
   }jobs.append(box);
  }
 }
 prepare.onclick=()=>{try{invalidate();if(!selected||adapter.busy())return;
  let link=selected.link_url;if(selected.youtube_source_id){const values=Object.values(window.postingAdapters.youtube?.snapshot?.()?.uploads||{}).filter(p=>p.source_id===selected.youtube_source_id&&p.video_id);if(values.length!==1)throw Error('YouTube一覧を更新して対象を確認してください');link='https://youtu.be/'+values[0].video_id;}
  const text=selected.body+(selected.kind==='link'?'\n\n'+link:'');const count=countX(text);
  if(!count.valid||count.length>280)throw Error('X本文は重み付き280文字以内にしてください');
  if(!channels.value)throw Error('Xの投稿先を選択してください');
  if(selected.kind==='image'&&!images.value)throw Error('取込済み画像を選択してください');
  if(!due.value)throw Error('予約日時を設定してください');
  confirmed={allow_late:late.checked,action:'x_submit',draft_id:selected.id,revision:selected.revision,channel_id:channels.value,image_id:images.value||null,due_at:new Date(due.value+':00+09:00').toISOString(),confirmed:true};
  review.append(el('p',`保存済み下書き：${selected.name} ／ 改訂${selected.revision} ／ ${selected.kind} ／ ${count.length}/280 ／ ${channels.selectedOptions[0].textContent} ／ 日本時間 ${due.value.replace('T',' ')}`),el('p',text));
  if(selected.kind==='video')review.append(el('p','動画素材：'+selected.source_video_id+'（サーバーで形式・尺を確認します）'));
  if(selected.kind==='image')review.append(el('p','画像素材：'+images.value));
  if(selected.youtube_source_id)review.append(el('p','YouTube公開確認待ち ／ '+(late.checked?'最大60分遅延を承認。確認後3分でBuffer登録。':'遅延登録なし。日時超過で停止。')));
  message='表示した本文・素材・日時を確認して予約してください';controls();
 }catch(e){message=e.message;controls();}};
 confirm.onclick=()=>{if(confirmed&&!adapter.busy())run({...confirmed});};
 sync.onclick=()=>run({action:'x_sync'});
 upload.onclick=async()=>{try{const f=file.files[0];if(!f||f.size>2*1024*1024)throw Error('2 MiB以内の画像を選択してください');
  const bytes=new Uint8Array(await f.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  await run({action:'x_image',data:btoa(binary)});
 }catch(e){message=e.message;controls();}};
 deleteImage.onclick=()=>{if(images.value&&window.confirm('使用中・結果不明の画像は削除できません。配信用画像を削除しますか？'))run({action:'x_delete_image',image_id:images.value,confirmed:true});};
 for(const n of [channels,due,images,late])n.addEventListener('change',()=>{invalidate();controls();});
 $('foundationForm')?.addEventListener('input',()=>{selected=null;invalidate();controls();});
 window.addEventListener('posting-draft-selected',e=>{selected=e.detail;invalidate();controls();});
 window.addEventListener('posting-state',()=>{const r=$('repo').value.trim();if(repo!==r){repo=r;selected=null;receipt=null;message='';file.value='';invalidate();}controls();renderJobs();});
 controls();renderJobs();
}
