const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function parseDraftJSON(raw){
 const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))throw Error('下書き1件のJSONを指定してください');
 const allowed=['name','service','kind','body','source_video_id','youtube_source_id','link_url'];
 if(Object.keys(value).some(k=>!allowed.includes(k)))throw Error('未対応のキーがあります。ID・改訂・予約・送信指示は取り込めません');
 if(!['x','threads'].includes(value.service)||!['text','link','image','video'].includes(value.kind)||typeof value.name!=='string'||!value.name.trim()||value.name.length>100||typeof value.body!=='string'||!value.body.trim()||value.body.length>20000||value.body.includes('\0'))throw Error('投稿先・形式・管理名・本文を確認してください');
 for(const k of ['source_video_id','youtube_source_id'])if(value[k]!=null&&(typeof value[k]!=='string'||value[k].length>200))throw Error('元動画IDが不正です');
 if(value.youtube_source_id&&value.kind!=='link')throw Error('YouTube公開待ちはリンク紹介形式です');
 if(value.kind==='link'&&!value.youtube_source_id&&!/^https:\/\/[^\s<>]+$/.test(value.link_url||''))throw Error('紹介URLを確認してください');
 if(value.kind==='video'&&!value.source_video_id)throw Error('動画形式には元動画IDが必要です');
 return value;
}
export function draftPrompt(script,service){return `次の原稿から${service==='x'?'X（重み付き280文字）':'Threads（URL含め500文字）'}の下書き1件を作ってください。事実を追加せず、本文だけで価値が伝わるようにしてください。ハッシュタグやリンクは必要な場合だけ。JSONのみを返し、自動投稿は行いません。形式: {"name":"管理名","service":"${service}","kind":"text","body":"本文"}\n元原稿:\n${script}`;}
export function mountPostingTools(){
 const host=document.getElementById('postingSettings');if(!host)return;const adapter=window.postingAdapters.social;
 const section=el('details');section.id='postingTools';section.append(el('summary','下書き作成支援・利用状況'));
 const message=el('p');message.setAttribute('role','status');section.append(message);
 const field=(label,tag='textarea')=>{const l=el('label',label),n=el(tag);l.append(n);section.append(l);return n;};
 const source=field('元原稿（外部へ自動送信しません）');source.rows=4;source.maxLength=20000;
 const service=field('原稿の投稿先','select');for(const [v,t] of [['x','X'],['threads','Threads']]){const o=el('option',t);o.value=v;service.append(o);}
 const prompt=field('コピーして使うプロンプト');prompt.readOnly=true;prompt.rows=5;
 const generate=el('button','原稿からプロンプトを作る');generate.onclick=()=>{prompt.value=draftPrompt(source.value,service.value);};section.append(generate);
 const json=field('AIから受け取った下書きJSON（1件）');json.id='postingDraftJSON';json.rows=5;
 const apply=el('button','JSONを新しい下書き欄へ反映');apply.id='postingImportDraft';apply.onclick=()=>{try{const value=parseDraftJSON(json.value);window.dispatchEvent(new window.CustomEvent('posting-draft-import',{detail:value}));message.textContent='新規下書き欄へ反映しました。内容を確認して保存してください。予約・投稿は行っていません。';}catch(e){message.textContent=e.message;}};section.append(apply);
 let selected=null;const duplicate=el('button','選択中の下書きを複製して編集');duplicate.onclick=()=>{if(!selected)return;const value={};for(const k of ['name','service','kind','body','source_video_id','youtube_source_id','link_url'])if(selected[k]!=null)value[k]=selected[k];value.name=(value.name+'（複製）').slice(0,100);window.dispatchEvent(new window.CustomEvent('posting-draft-import',{detail:value}));};duplicate.disabled=true;section.append(duplicate);
 window.addEventListener('posting-draft-selected',e=>{selected=e.detail;duplicate.disabled=!selected;});
 const release=el('button','YouTube公開待ちのX紹介を確認して登録');release.id='dependencyRelease';release.onclick=async()=>{if(window.confirm('YouTube公式APIで公開確認できたX紹介を最大5件Bufferへ登録します。予約時に承認した遅延条件を適用します。'))await adapter.xAction({action:'dependency_release',confirmed:true});};section.append(release);
 const usage=el('pre');usage.id='postingUsage';usage.style.whiteSpace='pre-wrap';section.append(usage);
 const actions=el('button','直近20件のActions実行時間を取得');const actionsStatus=el('p');actions.onclick=async()=>{try{actions.disabled=true;const result=await window.videoStudioApi('actions/runs?per_page=20');const runs=result.workflow_runs||[];let seconds=0,count=0;for(const r of runs){if(r.status!=='completed'||!r.run_started_at||!r.updated_at)continue;seconds+=Math.max(0,(Date.parse(r.updated_at)-Date.parse(r.run_started_at))/1000);count++;}actionsStatus.textContent=`完了${count}件の経過時間合計：約${Math.ceil(seconds/60)}分（待機等を含む参考値。課金時間・無料残枠ではありません）`;}catch{actionsStatus.textContent='取得できません。GitHub Actions画面で確認してください。';}finally{actions.disabled=false;}};section.append(actions,actionsStatus);
 function render(){const state=adapter.snapshot(),buffer=state.buffer_api||{},quota=state.threads_quota;const policies=Object.entries(buffer.policies||{}).map(([k,v])=>`${k}: 残${v.remaining} ／ リセット ${v.reset_at}`).join('\n');
 usage.textContent=`Buffer API（取得時点 ${buffer.checked_at||'未取得'}）\n${policies||'残要求数は未取得'}\nThreads投稿枠: ${quota?`残${quota.remaining}/${quota.total} ／ ${quota.checked_at}`:'未取得'}\nThreads認証期限: ${state.threads_auth?.expires_at||'未設定'}\n配信用動画: ${Object.values(state.videos||{}).filter(v=>v.cloud?.status==='uploaded').length}件 ／ 画像: ${Object.values(state.x_images||{}).filter(v=>v.status==='uploaded').length}件\n台帳推定: ${new TextEncoder().encode(JSON.stringify(state)).length} bytes / 上限900000 bytes\nYouTube公開待ち自動確認: ${state.dependency_auto?'ON':'OFF'}\nGitHub・Cloudinaryの無料残枠／本人契約条件: 未取得。各サービスの利用状況画面で確認してください。`;
 release.disabled=adapter.busy()||state.x_enabled!==true;apply.disabled=state.foundation?.enabled!==true;
 }
 window.addEventListener('posting-state',render);host.append(section);render();
}
