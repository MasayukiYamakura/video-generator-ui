const $ = id => document.getElementById(id);
const KEY = 'video-studio-v1', WORKFLOW = 'generate_video_ui.yml';
let saved; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { saved = {}; }
let history = saved.history || [], pending = saved.pending || null, token = saved.token || '', busy = false, polling = false;
$('repo').value = saved.repo || $('repo').value; $('token').value = token; $('remember').checked = Boolean(saved.token);
function persist() { localStorage.setItem(KEY, JSON.stringify({ repo: $('repo').value.trim(), token: $('remember').checked ? token : '', history: history.slice(0,50), pending })); }
function repo() { const r = $('repo').value.trim(); if (!/^[\w.-]+\/[\w.-]+$/.test(r)) throw Error('リポジトリは owner/name 形式で指定してください'); if (pending && pending.repo !== r) throw Error('未受付の処理とリポジトリが異なります'); return r; }
async function api(path, method='GET', body) {
  token = $('token').value.trim(); if (!token) throw Error('GitHubトークンを入力してください');
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),60000);
  try { const r = await fetch(`https://api.github.com/repos/${repo()}/${path}`, { method, headers: { Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'Content-Type':'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal:controller.signal });
    if (!r.ok) { const error = Error(r.status===401 ? '認証期限切れ、またはトークンが無効です' : r.status===403 ? '権限不足、またはAPIの利用制限です' : `GitHubへの接続でエラー (${r.status})`); error.status=r.status; throw error; }
    return r.status===204 ? null : await r.json();
  } finally { clearTimeout(timer); }
}
const message = text => { $('status').textContent=text; };
function controls() { $('generate').disabled = busy || Boolean(pending) || history.some(h=>h.repo===$('repo').value.trim() && h.status!=='completed'); $('recover').hidden=!pending; $('retry').hidden=!pending?.sha; $('discard').hidden=!pending || Boolean(pending.dispatched); }
function node(tag,text) { const n=document.createElement(tag); n.textContent=text; return n; }
function render() {
  $('history').replaceChildren();
  for (const h of history.filter(h=>h.repo===$('repo').value.trim())) { const box=node('article',''); box.className='item'; box.append(node('strong',h.audio),node('p',new Date(h.created).toLocaleString('ja-JP')));
    const label=h.status!=='completed' ? (h.status==='queued' || h.status==='waiting' || h.status==='pending' ? '待機中' : '処理中') : h.conclusion==='success' ? '完了' : h.conclusion==='cancelled' ? 'キャンセル' : '失敗'; box.append(node('p',label+(h.step ? ` · ${h.step}` : '')));
    const link=node('a','実行詳細'); link.href=`https://github.com/${h.repo}/actions/runs/${h.runId}`; link.target='_blank'; link.rel='noopener noreferrer'; box.append(link);
    if(h.status==='completed' && h.conclusion==='success') { if(h.artifacts?.length) for(const a of h.artifacts) { if(a.expired || Date.parse(a.expires_at)<Date.now()) { box.append(node('p','ダウンロード期限切れ')); continue; } const download=node('a','動画をダウンロード（ZIP）'); download.href=`https://github.com/${h.repo}/actions/runs/${h.runId}/artifacts/${a.id}`; download.target='_blank'; download.rel='noopener noreferrer'; box.append(download); } else box.append(node('p','成果物なし・削除済み、または期限切れ')); }
    $('history').append(box);
  }
  controls();
}
async function listRuns() { const runs=[]; for(let page=1;page<=5;page++){const data=await api(`actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=100&page=${page}`); runs.push(...data.workflow_runs); if(data.workflow_runs.length<100) break;} return runs; }
async function recover() {
  if(!pending) return true;
  const runs=(await listRuns()).filter(r=>r.display_title===`Pages ${pending.id}`).sort((a,b)=>a.id-b.id);
  if(!runs.length) { message('実行はまだ確認できません。少し後に「受付状況を確認」を押してください。再送も同じ受付IDを使います。'); return false; }
  const r=runs[0]; if(!history.some(h=>h.runId===r.id)) history.unshift({repo:pending.repo,audio:pending.audio,created:pending.created,id:pending.id,runId:r.id,status:r.status,conclusion:r.conclusion}); pending=null; persist(); render(); message('実行受付完了。画面を消したり、別アプリを開いたりしても生成が続きます。'); return true;
}
async function refresh() {
 if(polling || document.hidden || !$('token').value.trim()) return; polling=true;
 try { if(pending) await recover(); for(const h of history.filter(h=>h.repo===$('repo').value.trim())) { const r=await api(`actions/runs/${h.runId}`); h.status=r.status;h.conclusion=r.conclusion;h.step=''; if(r.status==='completed') { const a=await api(`actions/runs/${h.runId}/artifacts`);h.artifacts=a.artifacts.filter(x=>x.name===`video-${h.id}`); } else { const jobs=await api(`actions/runs/${h.runId}/jobs`); h.step=jobs.jobs.flatMap(j=>j.steps||[]).find(s=>s.status==='in_progress')?.name || ''; } } persist();render(); } catch(e){message(e.message);} finally{polling=false;}
}
function validate(file,text) { if(!file || !file.size || file.size>20*1024*1024) throw Error('音声は1バイト〜20 MiBで指定してください'); const ext=file.name.split('.').pop().toLowerCase(); if(!['m4a','mp3','wav','aac','ogg','flac','mp4','aiff','aif'].includes(ext)) throw Error('未対応の音声拡張子です'); if(new TextEncoder().encode(text).length>1024*1024) throw Error('JSONは1 MiBまでです'); const script=JSON.parse(text); if(!script || Array.isArray(script) || !Array.isArray(script.scenes) || !script.scenes.length) throw Error('JSONに空ではないscenes配列が必要です'); if(script.global_settings!==undefined && (!script.global_settings || typeof script.global_settings!=='object' || Array.isArray(script.global_settings))) throw Error('global_settingsはオブジェクトにしてください'); return {script,ext}; }
async function base64(file){const bytes=new Uint8Array(await file.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
async function dispatch(){message('実行依頼中。画面を開いたままお待ちください。');pending.dispatched=true;persist();await api(`actions/workflows/${WORKFLOW}/dispatches`,'POST',{ref:'main',inputs:{receipt_id:pending.id,input_sha:pending.sha}});await recover();}
$('connect').onclick=async()=>{try{const r=await api('');if(!r.private)throw Error('接続先は非公開リポジトリにしてください');await api(`actions/workflows/${WORKFLOW}`);persist();$('connectionStatus').textContent='接続できました';await refresh();}catch(e){$('connectionStatus').textContent=e.message;}};
$('forget').onclick=()=>{token='';$('token').value='';$('remember').checked=false;persist();$('connectionStatus').textContent='トークンを削除しました。履歴は保持しています。';};
$('jsonFile').onchange=async()=>{const f=$('jsonFile').files[0];if(f){if(f.size>1024*1024)return message('JSONは1 MiBまでです');$('script').value=await f.text();}};
$('generate').onclick=async()=>{if(busy||pending)return;busy=true;controls();try{message('入力確認中');const file=$('audio').files[0],{script,ext}=validate(file,$('script').value);const r=await api('');if(!r.private)throw Error('音声の保存先は非公開リポジトリにしてください');const active=(await listRuns()).find(r=>r.status!=='completed');if(active)throw Error('すでに生成中の処理があります。完了後に実行してください');const id=crypto.randomUUID();pending={id,repo:repo(),audio:file.name,created:new Date().toISOString()};persist();message('アップロード中。画面を開いたままお待ちください。');const a=await api('git/blobs','POST',{content:await base64(file),encoding:'base64'});script.audio_file=`input.${ext}`;const j=await api('git/blobs','POST',{content:JSON.stringify(script),encoding:'utf-8'});const tree=await api('git/trees','POST',{tree:[{path:`input/input.${ext}`,mode:'100644',type:'blob',sha:a.sha},{path:'input/script.json',mode:'100644',type:'blob',sha:j.sha}]});const commit=await api('git/commits','POST',{message:`Pages input ${id}`,tree:tree.sha,parents:[]});pending.sha=commit.sha;persist();await api('git/refs','POST',{ref:`refs/heads/ui-input/${id}`,sha:commit.sha});await dispatch();}catch(e){message(`${e.message}。受付IDを保持しました。受付状況を確認してから再操作してください。`);}finally{busy=false;render();}};
$('recover').onclick=refresh;
$('retry').onclick=async()=>{if(busy||!pending?.sha)return;busy=true;controls();try{if(await recover())return;try{const ref=await api(`git/ref/heads/ui-input/${pending.id}`);if(ref.object.sha!==pending.sha)throw Error('入力ブランチが変更されています');}catch(e){if(e.status!==404)throw e;await api('git/refs','POST',{ref:`refs/heads/ui-input/${pending.id}`,sha:pending.sha});}await dispatch();}catch(e){message(e.message);}finally{busy=false;render();}};
$('discard').onclick=async()=>{if(busy||!pending||pending.dispatched)return;busy=true;try{if(await recover())return;if(pending.sha){try{const ref=await api(`git/ref/heads/ui-input/${pending.id}`);if(ref.object.sha!==pending.sha)throw Error('入力が変更されています');await api(`git/refs/heads/ui-input/${pending.id}`,'DELETE');}catch(e){if(e.status!==404)throw e;}}pending=null;persist();message('未受付の入力を取り消しました。音声を選び直して実行できます。');}catch(e){message(e.message);}finally{busy=false;render();}};
$('refresh').onclick=refresh;document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('pageshow',refresh);window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});setInterval(()=>{if(pending||history.some(h=>h.status!=='completed'))refresh();},15000);render();if(!token)$('connection').open=true;refresh();
