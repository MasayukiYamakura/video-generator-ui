const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const jst=v=>new Date(Date.parse(v)+9*3600000).toISOString().slice(0,16);
const labels={waiting:'実行待ち',waiting_youtube:'YouTube公開待ち',processing:'素材処理中',api_wait:'認証・API確認待ち',unknown:'結果不明・再送保留',expired:'期限切れ',failed:'停止',published:'公開済み',cancelled:'取消済み'};
export function mountThreadsPublishing(){
 const host=document.getElementById('postingSettings');if(!host)return;
 const adapter=window.postingAdapters.social;
 const section=el('details');section.id='threadsPublishing';section.append(el('summary','Threads投稿（初期OFF）'));
 const status=el('p');status.id='threadsStatus';status.setAttribute('role','status');section.append(status);
 section.append(el('p','固定枠は日本時間07:10・12:10・18:10・21:10。実行遅延は60分までです。GitHubの時刻保証はありません。保存済みThreads下書きを選び、本文・素材・投稿先を確認して計画します。'));
 const field=(name,label,tag='input')=>{const l=el('label',label),n=el(tag);n.id=name;l.append(n);section.append(l);return n;};
 const due=field('threadsDue','希望日時（日本時間・固定枠）');due.type='datetime-local';
 const immediate=field('threadsImmediate','今すぐ投稿（実行待ち時間を含め最大60分）');immediate.type='checkbox';
 const file=field('threadsImageFile','画像を取り込む（JPEG・PNG・WebP、2 MiB以内）');file.type='file';file.accept='image/jpeg,image/png,image/webp';
 const image=field('threadsImage','添付する取込済み画像','select');
 const button=(text,id,fn)=>{const b=el('button',text);b.id=id;b.onclick=fn;section.append(b);return b;};
 let selected=null,confirmed=null,receipt=null,message='',repo='';
 const review=el('div');review.id='threadsReview';const jobs=el('div');jobs.id='threadsJobs';
 const invalidate=()=>{confirmed=null;review.replaceChildren();submit.disabled=true;};
 async function run(request){try{invalidate();message='';receipt=await adapter.xAction(request);render();}catch(e){message=e.message;render();}}
 const auth=button('投稿せず認証・残枠を確認','threadsAuth',()=>run({action:'threads_auth'}));
 const reset=button('Secretsで再認証','threadsReset',()=>{if(window.confirm('本人が更新したSecretsで保存済み認証を置換します。アカウントを確認しましたか？'))run({action:'threads_reset_auth',confirmed:true});});
 const upload=button('選択した画像を取り込む','threadsUpload',async()=>{try{const f=file.files[0];if(!f||f.size>2*1024*1024)throw Error('2 MiB以内の画像を選んでください');const data=new Uint8Array(await f.arrayBuffer());let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));await run({action:'threads_image',data:btoa(binary)});}catch(e){message=e.message;render();}});
 const deleteImage=button('選択画像の配信用ファイルを削除','threadsDeleteImage',()=>{if(image.value&&window.confirm('X・Threadsで使用中の画像は削除できません。未使用の配信用画像を削除しますか？'))run({action:'threads_delete_image',image_id:image.value,confirmed:true});});
 const prepare=button('Threads投稿内容を確認','threadsPrepare',()=>{try{invalidate();const state=adapter.snapshot();if(!selected||selected.service!=='threads'||!state.threads_auth?.account)throw Error('認証確認と保存済みThreads下書きの選択が必要です');let link=selected.link_url;
 if(selected.youtube_source_id){const posts=Object.values(window.postingAdapters.youtube?.snapshot?.()?.uploads||{}).filter(p=>p.source_id===selected.youtube_source_id&&p.video_id);if(posts.length!==1)throw Error('YouTube一覧を更新して対象を確認してください');link='https://youtu.be/'+posts[0].video_id;}
 const text=selected.body+(selected.kind==='link'?'\n\n'+link:'');if(!text.trim()||text.length>500)throw Error('URLを含め500文字以内で入力してください');if(selected.kind==='image'&&!image.value)throw Error('画像を選択してください');
 let dueAt=null;if(!immediate.checked){if(!due.value||!['07:10','12:10','18:10','21:10'].includes(due.value.slice(11)))throw Error('固定枠の日時を指定してください');dueAt=new Date(due.value+':00+09:00').toISOString();if(Date.parse(dueAt)<=Date.now()+120000)throw Error('未来の固定枠を指定してください');}
 confirmed={action:'threads_plan',draft_id:selected.id,revision:selected.revision,account_id:state.threads_auth.account.id,image_id:image.value||null,due_at:dueAt,immediate:immediate.checked,confirmed:true};
 review.append(el('p',`@${state.threads_auth.account.username} ／ ${selected.name} ／ ${selected.kind} ／ ${immediate.checked?'今すぐ投稿':due.value.replace('T',' ')}`),el('p',text));
 if(['image','video'].includes(selected.kind))review.append(el('p','素材：'+(selected.kind==='image'?image.value:selected.source_video_id)));
 if(selected.youtube_source_id)review.append(el('p','YouTube公式APIで公開を確認するまで待機。希望時刻から60分で期限切れ。'));
 render();}catch(e){message=e.message;render();}});
 const submit=button('確認した内容でThreads投稿を計画','threadsSubmit',()=>{if(confirmed&&!adapter.busy())run({...confirmed});});submit.disabled=true;
 const sync=button('Threadsの結果を照合（投稿しません）','threadsSync',()=>run({action:'threads_sync'}));
 const execute=button('期限内の実行待ち投稿を公開する','threadsRun',()=>{if(window.confirm('期限内のThreads投稿を最大5件実行します。本文・素材を確認済みですか？'))run({action:'threads_run',confirmed:true});});
 section.append(review,jobs);host.append(section);
 function render(){const state=adapter.snapshot(),on=state.threads_enabled===true,busy=adapter.busy();if(!on)confirmed=null;
 status.textContent=(on?'Threads ON':'Threads OFF（本人の権限・費用・実投稿確認後に有効化）')+` ／ 固定枠自動実行：${state.threads_auto_post?'ON':'OFF'}`+(state.threads_auth?.account?' ／ @'+state.threads_auth.account.username:' ／ 未認証')+(state.threads_error?' ／ '+state.threads_error:'')+(message?' ／ '+message:'');
 if(receipt)status.textContent+=' ／ 受付ID：'+receipt+' ／ '+(state.requests?.[receipt]?.message||'受付確認中。投稿管理の受付履歴から同じIDで再依頼できます。');
 for(const b of [auth,reset,sync])b.disabled=busy;for(const b of [upload,deleteImage,prepare,execute])b.disabled=busy||!on;prepare.disabled ||= !selected||selected.service!=='threads';submit.disabled=busy||!on||!confirmed;
 const old=image.value;image.replaceChildren();const none=el('option','選択してください');none.value='';image.append(none);for(const v of Object.values(state.x_images||{})){if(v.status!=='uploaded')continue;const o=el('option',v.id);o.value=v.id;image.append(o);}image.value=old;
 jobs.replaceChildren();for(const job of Object.values(state.threads_posts||{}).reverse()){const box=el('article');box.className='item';box.append(el('strong',job.title),el('p',`@${job.account.username} ／ ${labels[job.status]||job.status} ／ ${jst(job.due_at).replace('T',' ')}`),el('p',job.payload.text));if(job.error)box.append(el('p',job.error));if(job.permalink){const a=el('a','Threadsで公開結果を見る');a.href=job.permalink;a.target='_blank';a.rel='noopener noreferrer';box.append(a);}if(!job.create_attempted&&!['published','cancelled'].includes(job.status)){const b=el('button','このThreads計画を取り消す');b.disabled=busy||!on;b.onclick=()=>{if(window.confirm('未作成のThreads計画を取り消しますか？'))run({action:'threads_cancel',job_id:job.id,confirmed:true});};box.append(b);}jobs.append(box);}
 }
 for(const f of [due,image,immediate])f.addEventListener('change',()=>{invalidate();render();});
 document.getElementById('foundationForm')?.addEventListener('input',()=>{selected=null;invalidate();render();});
 window.addEventListener('posting-draft-selected',e=>{selected=e.detail;invalidate();render();});
 window.addEventListener('posting-state',()=>{const current=document.getElementById('repo').value.trim();if(repo!==current){repo=current;selected=null;receipt=null;message='';invalidate();}render();});render();
}
