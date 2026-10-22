import {MBTI_NAMES} from './builder/subjects.mjs?v=tarot-display-20261021';
import {loadHistory,migrateHistory} from './history.mjs?v=resume-20261022';
const $ = id => document.getElementById(id);
const KEY = 'video-studio-v1', WORKFLOW = 'generate_video_ui.yml';
const BATCH_SIGNS={aries:'おひつじ座',taurus:'おうし座',gemini:'ふたご座',cancer:'かに座',leo:'しし座',virgo:'おとめ座',
  libra:'てんびん座',scorpio:'さそり座',sagittarius:'いて座',capricorn:'やぎ座',aquarius:'みずがめ座',pisces:'うお座'};
Object.assign(BATCH_SIGNS,MBTI_NAMES);
const isZodiacArtifact=name=>Object.values(BATCH_SIGNS).some(label=>name?.endsWith(label));
const FORMAT_LABEL={vertical:'縦型',landscape:'横型'};
const OUTPUT_STATUS={daily_limit:'日次上限・再開待ち',minute_limit:'分単位の制限・再開待ち',rate_limit_unknown:'制限到達（種別不明）',temporary_error:'一時エラー',result_unknown:'音声生成の結果不明・確認後に再開',needs_fix:'認証・入力等の修正が必要',not_started:'未着手・中断中',audio_ready:'音声生成済み・動画は未完了',failed:'描画失敗'};
const outputFormats=h=>h.outputFormats||(h.outputMode==='vertical_horizontal'?['vertical','landscape']:h.outputMode==='horizontal_only'?['landscape']:['vertical']);
const resumeAudioMessage=h=>h.kind==='batch'?'保存済み音声がある対象は再利用します（7日間）。期限切れ・未生成の対象はAI読み上げを生成します。':h.reusableAudioAvailable?'保存済み共通音声を再利用します（7日間）。':h.kind==='batch'||h.audioMode==='tts'?'保存済み音声の期限切れです。未完了分はAI読み上げを再生成します。':'録音の保存期限が切れています。元の録音を再度添付して新規生成してください。';
const activeArtifact=a=>Boolean(a&&!a.expired&&Date.parse(a.expires_at)>Date.now());
function resumeSummary(h) {
 const counts={vertical:0,landscape:0};let targets=0,unknown=false;
 for(const key of h.kind==='batch'?(h.signs||[]):['video']) {
  let needed=false;
  for(const format of outputFormats(h)) {
   const a=h.artifacts?.find(a=>h.kind==='batch'?a.name?.endsWith(BATCH_SIGNS[key]):a.name===(format==='vertical'?h.verticalArtifact:h.horizontalArtifact));
   const status=h.kind==='batch'?h.batchProgress?.signs?.[key]:h.outputStatus?.outputs;
   const done=typeof status==='string'?status==='completed'&&outputFormats(h).length===1:status?.[format]==='completed';
   if(!activeArtifact(a)||!done){counts[format]++;needed=true;if(activeArtifact(a)&&!status)unknown=true;}
  }
  if(needed)targets++;
 }
 return `${unknown?'再開対象の上限':'再開対象'}：${targets}対象・縦型${counts.vertical}本／横型${counts.landscape}本。保存済みの完成動画は再利用します。`;
}
let saved; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { saved = {}; }
let history = saved.history || [], pending = saved.pending || null, token = saved.token || '', busy = false, polling = false;

$('autoLink').checked=saved.autoLink===true;
$('autoLink').onchange=persist;
const historyMigrated=saved.historyMigrated || {};
const legacyHistory=history.slice();
$('repo').value = saved.repo || $('repo').value; $('token').value = token; $('remember').checked = Boolean(saved.token);
function persist() {
 const counts=new Map();
 const cached=history.filter(h=>{
  if(!historyMigrated[h.repo]||h.status!=='completed')return true;
  const count=(counts.get(h.repo)||0)+1;counts.set(h.repo,count);return count<=50;
 });
 localStorage.setItem(KEY,JSON.stringify({repo:$('repo').value.trim(),token:$('remember').checked?token:'',history:cached,historyMigrated,pending,autoLink:$('autoLink').checked}));
}
function repo() { const r = $('repo').value.trim(); if (!/^[\w.-]+\/[\w.-]+$/.test(r)) throw Error('リポジトリは owner/name 形式で指定してください'); if (pending && pending.repo !== r) throw Error('未受付の処理とリポジトリが異なります'); return r; }
async function api(path, method='GET', body) {
  token = $('token').value.trim(); if (!token) throw Error('GitHubトークンを入力してください');
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),60000);
  const url = `https://api.github.com/repos/${repo()}${path ? `/${path}` : ''}`;
  try { const r = await fetch(url, { method, headers: { Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'Content-Type':'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal:controller.signal });
    if (!r.ok) { const error = Error(r.status===401 ? '認証期限切れ、またはトークンが無効です' : r.status===403 ? '権限不足、またはAPIの利用制限です' : `GitHubへの接続でエラー (${r.status})`); error.status=r.status; throw error; }
    return r.status===204 ? null : await r.json();
  } finally { clearTimeout(timer); }
}
const message = text => { $('status').textContent=text; };
function controls() { const blocked=busy || Boolean(pending) || history.some(h=>h.repo===$('repo').value.trim() && h.status!=='completed'); $('generate').disabled=blocked; $('pbBatchGenerate').disabled=blocked; $('recover').hidden=!pending; $('retry').hidden=!pending?.sha; $('discard').hidden=!pending || Boolean(pending.dispatched); }
function node(tag,text) { const n=document.createElement(tag); n.textContent=text; return n; }
function render() {
  $('history').replaceChildren();
  for (const h of history.filter(h=>h.repo===$('repo').value.trim())) { const box=node('article',''); box.className='item'; box.append(node('strong',h.audio),node('p',new Date(h.created).toLocaleString('ja-JP')));
    if(h.resumeFrom){const parent=node('a','再開元の実行');parent.href=`https://github.com/${h.repo}/actions/runs/${h.resumeFrom}`;parent.target='_blank';parent.rel='noopener noreferrer';box.append(parent);}
    if(h.preparationStatus==='failed')box.append(node('p','再開・入力準備で失敗しました。実行詳細で原因を確認してください。動画生成は開始していません。'));
    const batchDone=Object.values(h.batchProgress?.signs||{}).some(value=>value==='completed'||Object.values(value||{}).includes('completed'));
    const outputValues=Object.values(h.outputStatus?.outputs||{});
    const videoPartial=h.pairedOutput&&outputValues.includes('completed')&&outputValues.some(value=>value!=='completed');
    const partial=h.status==='completed'&&h.conclusion!=='success'&&((h.kind==='batch'&&(h.artifacts?.length||batchDone))||videoPartial);
    const label=partial?'一部完成・未完了分を再開できます':h.kind==='batch'&&h.status==='completed'&&h.batchProgress?.control?.stop?'中断・未完了分を再開できます':h.status!=='completed' ? (h.status==='queued' || h.status==='waiting' || h.status==='pending' ? '待機中' : '処理中') : h.conclusion==='success' ? '完了' : h.conclusion==='cancelled' ? 'キャンセル' : '失敗'; box.append(node('p',label+(h.step ? ` · ${h.step}` : '')));
    const link=node('a','実行詳細'); link.href=`https://github.com/${h.repo}/actions/runs/${h.runId}`; link.target='_blank'; link.rel='noopener noreferrer'; box.append(link); if(h.bgm) box.append(node('p',h.bgm));
    if(h.kind==='batch') {
      for(const [sign,label] of Object.entries(BATCH_SIGNS).filter(([sign])=>h.signs?.includes(sign))){
        const artifact=h.artifacts?.find(a=>a.name===`video-${h.id}-${sign}`||a.name?.endsWith(label));
        const stage=h.batchProgress?.signs?.[sign];
        for(const format of h.outputFormats||['vertical']) {
          const formatStatus=typeof stage==='object'?stage[format]:stage==='completed'?'completed':stage;
          const text=formatStatus==='completed'?'完了':OUTPUT_STATUS[formatStatus]||(!artifact&&h.status==='completed'?'成果物なし':h.step===`Render ${sign}`?'制作中':'制作待ち');
          box.append(node('p',`${label} · ${FORMAT_LABEL[format]||format} · ${text}`));
        }
        if(artifact&&!artifact.expired&&Date.parse(artifact.expires_at)>Date.now()){
          const link=node('a',label+'の縦横動画をダウンロード（ZIP）');link.href=`https://github.com/${h.repo}/actions/runs/${h.runId}/artifacts/${artifact.id}`;link.target='_blank';link.rel='noopener noreferrer';box.append(link);
        }
      }
    } else if(h.pairedOutput&&h.kind==='video') {
      for(const format of h.outputFormats||['vertical']) {
        const name=format==='vertical'?h.verticalArtifact:h.horizontalArtifact;
        const artifact=h.artifacts?.find(a=>a.name===name);
        const status=h.outputStatus?.outputs?.[format];
        const expired=artifact&&(artifact.expired||Date.parse(artifact.expires_at)<Date.now());
        const statusText=artifact?(expired?'保存期限切れ':'完了'):status==='completed'?'成果物を確認中・更新してください':status?.status==='failed'?'描画失敗':h.status==='completed'?'成果物なし':'制作待ち';
        box.append(node('p',`${FORMAT_LABEL[format]||format} · ${statusText}`));
        if(artifact&&!expired){const download=node('a',`${FORMAT_LABEL[format]||format}をダウンロード（ZIP）`);download.href=`https://github.com/${h.repo}/actions/runs/${h.runId}/artifacts/${artifact.id}`;download.target='_blank';download.rel='noopener noreferrer';box.append(download);}
      }
    } else if(h.status==='completed' && (h.conclusion==='success'||h.artifacts?.length)) { if(h.artifacts?.length) for(const a of h.artifacts) { if(a.expired || Date.parse(a.expires_at)<Date.now()) { box.append(node('p','ダウンロード期限切れ')); continue; } const download=node('a',h.kind&&h.kind!=='video'?'確認結果をダウンロード（ZIP）':'動画をダウンロード（ZIP）'); download.href=`https://github.com/${h.repo}/actions/runs/${h.runId}/artifacts/${a.id}`; download.target='_blank'; download.rel='noopener noreferrer'; box.append(download); } else box.append(node('p','成果物なし・削除済み、または期限切れ')); }
    const batchNeedsResume=h.kind==='batch'&&h.signs?.some(sign=>{
      const artifact=h.artifacts?.find(item=>item.name.endsWith(BATCH_SIGNS[sign]));
      const stage=h.batchProgress?.signs?.[sign];
      const incomplete=typeof stage==='object'&&stage!==null&&outputFormats(h).some(format=>stage[format]!=='completed');
      return incomplete||!artifact||artifact.expired||Date.parse(artifact.expires_at)<=Date.now();
    });
    if(h.kind==='batch'&&h.status==='completed'&&h.resumeAvailable&&h.sha&&batchNeedsResume&&!history.some(other=>other.id===h.id&&other.runId>h.runId&&other.resumeAvailable)){
      if(h.batchProgress?.control?.retry_at)box.append(node('p','再開目安：'+new Date(h.batchProgress.control.retry_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間・上限解除は保証されません）'));
      const resume=node('button','未完了分を再開');resume.className='secondary';resume.disabled=busy||Boolean(pending)||history.some(x=>x.repo===h.repo&&x.status!=='completed');resume.onclick=()=>resumeGeneration(h);box.append(node('p',resumeSummary(h)),resume,node('p',resumeAudioMessage(h)+' 結果不明の音声はAPI側で使用量が計上されている可能性があります。'));
    }
    const videoNeedsResume=h.kind==='video'&&h.pairedOutput&&outputFormats(h).some(format=>{
      const artifact=h.artifacts?.find(item=>item.name===(format==='vertical'?h.verticalArtifact:h.horizontalArtifact));
      return !artifact||artifact.expired||Date.parse(artifact.expires_at)<=Date.now();
    });
    if(h.status==='completed'&&h.resumeAvailable&&h.sha&&videoNeedsResume&&!history.some(other=>other.id===h.id&&other.runId>h.runId&&other.resumeAvailable)){
      const resume=node('button','未完了形式を再開');resume.className='secondary';resume.disabled=busy||Boolean(pending)||history.some(item=>item.repo===h.repo&&item.status!=='completed');resume.onclick=()=>resumeGeneration(h);box.append(node('p',resumeSummary(h)),resume,node('p',resumeAudioMessage(h)));
    }
    if(h.status==='completed'&&(batchNeedsResume||videoNeedsResume)&&h.resumeAvailable===false)box.append(node('p','この実行には再開用入力がありません（保存期限切れ・保存失敗）。再開元の履歴で再開できるか確認し、利用できなければ新規生成してください。'));
    if((!h.kind||['video','batch'].includes(h.kind))&&h.status==='completed'&&(!h.pairedOutput||h.outputFormats?.includes('vertical'))){const prepare=node('button','縦型動画をSNS投稿管理へ取り込む');prepare.className='secondary';prepare.onclick=()=>window.dispatchEvent(new CustomEvent('social-prepare',{detail:{runId:h.runId,navigate:$('autoLink').checked}}));box.append(prepare);}
    if(['video','batch'].includes(h.kind)&&h.status==='completed'&&h.outputFormats?.includes('landscape')){const prepare=node('button','横型動画をYouTube投稿管理へ取り込む');prepare.className='secondary';prepare.onclick=()=>window.dispatchEvent(new CustomEvent('youtube-prepare',{detail:{runId:h.runId,navigate:$('autoLink').checked}}));box.append(prepare);}
    $('history').append(box);
  }
  controls();
}
async function listRuns() { const runs=[]; for(let page=1;page<=5;page++){const data=await api(`actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=100&page=${page}`); runs.push(...data.workflow_runs); if(data.workflow_runs.length<100) break;} return runs; }
async function recover() {
  if(!pending) return true;
  const runs=(await listRuns()).filter(r=>r.display_title===`Pages ${pending.id}`).filter(r=>!pending.resumeFrom||r.id>pending.resumeFrom).sort((a,b)=>a.id-b.id);
  if(!runs.length) { message('実行はまだ確認できません。少し後に「受付状況を確認」を押してください。再送も同じ受付IDを使います。'); return false; }
  const r=runs[0]; if(!history.some(h=>h.runId===r.id)) history.unshift({...pending,resumeFrom:pending.resumeFrom,runId:r.id,status:r.status,conclusion:r.conclusion,kind:pending.kind||'video'}); pending=null; persist(); render(); message('実行受付完了。画面を消したり、別アプリを開いたりしても生成が続きます。'); return true;
}
async function refresh() {
 if(polling || document.hidden || !$('token').value.trim()) return;
 polling=true;
 try {
  if(pending) await recover();
  $('historySyncStatus').textContent='共通履歴を読込中…';
  const repository=repo();
  const shared=historyMigrated[repository]?await loadHistory(api,repository):await migrateHistory(api,repository,legacyHistory.filter(h=>h.repo===repository));
  historyMigrated[repository]=true;
  const merged=new Map(history.filter(h=>h.repo===repository).map(h=>[h.runId,h]));
  for(const h of shared)merged.set(h.runId,{...merged.get(h.runId),...h,status:merged.get(h.runId)?.status||'queued'});
  history=[...[...merged.values()].sort((a,b)=>Date.parse(b.created)-Date.parse(a.created)),...history.filter(h=>h.repo!==repository)];
  persist();render();$('historySyncStatus').textContent='共通履歴を読み込みました。動画本体は3日、再開用データは7日間保存されます。';
  for(const h of history.filter(h=>h.repo===$('repo').value.trim())) {
    let run;
    try {run=await api(`actions/runs/${h.runId}`);}
    catch(error) {if(error.status!==404)throw error;h.status='completed';h.conclusion='unavailable';h.step='実行記録が削除済み、または参照できません';continue;}
    h.status=run.status;h.conclusion=run.conclusion;h.step='';
    const jobData=await api(`actions/runs/${h.runId}/jobs`);
    const actualBgm=jobData.jobs.flatMap(job=>job.steps||[]).find(step=>step.name.startsWith('BGM: ')&&step.status==='completed'&&step.conclusion==='success');
    if(actualBgm)h.bgm=actualBgm.name;
    if(run.status==='completed'||h.kind==='batch') {
      const receipt=h.id||/^Pages ([0-9a-f-]+)/.exec(run.display_title||'')?.[1];
      const result=await api(`actions/runs/${h.runId}/artifacts?per_page=100`),artifacts=result.artifacts;
      const active=artifact=>artifact&&!artifact.expired&&Date.parse(artifact.expires_at)>Date.now();
      h.resumeAvailable=h.kind==='batch'
        ?artifacts.some(artifact=>artifact.name===`batch-input-${receipt}`&&active(artifact))
        :h.kind==='video'&&h.pairedOutput&&artifacts.some(artifact=>artifact.name===`video-input-${receipt}`&&active(artifact));
      h.reusableAudioAvailable=artifacts.some(artifact=>artifact.name===`video-audio-${receipt}`&&active(artifact))
        ||h.audioMode!=='tts'&&artifacts.some(artifact=>artifact.name===`video-input-${receipt}`&&active(artifact));
      h.artifacts=h.kind==='batch'
        ?artifacts.filter(artifact=>artifact.name.startsWith(`video-${receipt}-`)||isZodiacArtifact(artifact.name))
        :h.pairedOutput
          ?artifacts.filter(artifact=>[h.verticalArtifact,h.horizontalArtifact].includes(artifact.name))
          :artifacts.filter(artifact=>artifact.name===`video-${receipt}`||isZodiacArtifact(artifact.name));
      if(receipt&&!h.id)h.id=receipt;
    }
    if(run.status!=='completed')h.step=jobData.jobs.flatMap(job=>job.steps||[]).find(step=>step.status==='in_progress')?.name||'';
  }
  persist();render();
 } catch(error) {
  $('historySyncStatus').textContent='共通履歴の読込・更新に失敗しました。端末の表示用履歴と受付情報を保持しています。更新ボタンで再試行できます。';
  message(error.message);
 } finally {persist();render();polling=false;}
}
function validate(file,text) {
 if(new TextEncoder().encode(text).length>1024*1024) throw Error('JSONは1 MiBまでです');
 let script=JSON.parse(text);
 if(window.videoConfigurator) script=window.videoConfigurator.prepareScript(script);
 if(!script || Array.isArray(script) || !Array.isArray(script.scenes) || !script.scenes.length) throw Error('JSONに空ではないscenes配列が必要です');
 if(script.global_settings!==undefined && (!script.global_settings || typeof script.global_settings!=='object' || Array.isArray(script.global_settings))) throw Error('global_settingsはオブジェクトにしてください');
 const mode=script.global_settings?.voice_mode ?? 'original';
 if(!['original','anonymous','tts'].includes(mode)) throw Error('音声方式が不正です');
 if(mode==='tts') {
   const t=script.global_settings.tts ?? {};
   if(!t||typeof t!=='object'||Array.isArray(t)) throw Error('ttsはオブジェクトにしてください');
   for(const k of Object.keys(t)) if(!['voice','style','pace','custom_style'].includes(k)) throw Error('ttsに未対応の設定があります');
   for(const [k,def,values] of [['voice','hashimoto',['hashimoto','male_a','male_b']],['style','natural',['natural','calm','gentle','bright','serious','powerful']],['pace','normal',['slow','normal','fast']]]) if(!values.includes(t[k]??def)) throw Error(`TTSの${k}が無効です`);
   if(t.custom_style!==undefined&&(typeof t.custom_style!=='string'||t.custom_style.length>500)) throw Error('カスタム話し方は500文字以内です');
   const spoken=script.scenes.map(sc=>{
     if(!sc||typeof sc!=='object'||Array.isArray(sc)) throw Error('各sceneはオブジェクトにしてください');
     const text=sc.speech_text??sc.text??'';
     if(typeof text!=='string') throw Error('text / speech_textは文字列にしてください');
     const clean=text.replaceAll('[[','').replaceAll(']]','').trim();
     if(!clean&&(!Object.hasOwn(sc,'start_time')||!Object.hasOwn(sc,'end_time'))) throw Error('読み上げが空のsceneには開始・終了秒が必要です');
     return clean;
   }).filter(Boolean).join('\n');
   if(!spoken) throw Error('TTS文章が空です');
   if(spoken.length>12000) throw Error('TTS文章は12000文字までです');
   delete script.audio_file;
   return {script,mode};
 }
 if(!file || !file.size || file.size>20*1024*1024) throw Error('音声は1バイト〜20 MiBで指定してください');
 const ext=file.name.split('.').pop().toLowerCase();
 if(!['m4a','mp3','wav','aac','ogg','flac','mp4','aiff','aif'].includes(ext)) throw Error('未対応の音声拡張子です');
 return {script,ext,mode};
}
async function base64(file){const bytes=new Uint8Array(await file.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
async function dispatch(){message('実行依頼中。画面を開いたままお待ちください。');pending.dispatched=true;persist();await api(`actions/workflows/${WORKFLOW}/dispatches`,'POST',{ref:'main',inputs:{receipt_id:pending.id,input_sha:pending.sha,job_kind:pending.kind||'video',...(pending.resumeFrom?{resume_run_id:String(pending.resumeFrom)}:{})}});await recover();}
$('connect').onclick=async()=>{try{const r=await api('');if(!r.private)throw Error('接続先は非公開リポジトリにしてください');await api(`actions/workflows/${WORKFLOW}`);persist();$('connectionStatus').textContent='接続できました';await refresh();}catch(e){$('connectionStatus').textContent=e.message;}};
$('forget').onclick=()=>{token='';$('token').value='';$('remember').checked=false;persist();$('connectionStatus').textContent='トークンを削除しました。履歴は保持しています。';};
$('jsonFile').onchange=async()=>{const f=$('jsonFile').files[0];if(f){if(f.size>1024*1024)return message('JSONは1 MiBまでです');$('script').value=await f.text();$('script').dispatchEvent(new Event('input'));}};
async function submit(kind='video'){if(busy||pending)return;busy=true;controls();try{message('入力確認中');const file=$('audio').files[0];let script,ext,mode;
if(kind==='batch'){if(!window.videoConfigurator?.batch?.active())throw Error('タロットの複数星座モードを選択してください');script=window.videoConfigurator.batch.manifest();mode='tts';}
else if(kind==='title-preview'){if(new TextEncoder().encode($('script').value).length>1024*1024)throw Error('JSONは1 MiBまでです');script=JSON.parse($('script').value);if(window.videoConfigurator)script=window.videoConfigurator.prepareScript(script);if(!script.scenes?.length)throw Error('タイトルを含むJSONが必要です');mode='title-preview';}else{({script,ext,mode}=validate(file,$('script').value));if(kind==='audio-preview'&&mode==='tts')throw Error('試聴は添付録音・匿名加工音声に対応しています');}
script.auto_link=$('autoLink').checked;
const bgm=kind==='batch'?'星座ごとのBGM設定':kind==='title-preview'?'タイトル確認':await previewBgm(script);const connection=await api('');if(!connection.private)throw Error('音声の保存先は非公開リポジトリにしてください');if((await listRuns()).some(run=>run.status!=='completed'))throw Error('すでに生成中の処理があります。完了後に実行してください');const id=crypto.randomUUID();const settings=script.global_settings||script.videos?.[0]?.script?.global_settings||{};const formats=settings.output_mode==='vertical_horizontal'?['vertical','landscape']:settings.output_mode==='horizontal_only'?['landscape']:settings.format==='landscape'?['landscape']:['vertical'];pending={id,repo:repo(),kind,signs:kind==='batch'?script.videos.map(video=>video.zodiac):undefined,subjectKind:kind==='batch'?script.subject_kind:script.tarot?.subject_kind,outputMode:settings.output_mode,pairedOutput:settings.format==='vertical'&&Boolean(settings.output_mode),outputFormats:formats,audio:kind==='batch'?`${script.subject_kind==='mbti'?'16タイプ':'12星座'}一括制作（${script.videos.length}本）`:kind==='title-preview'?'タイトル確認':kind==='audio-preview'?'試聴: '+file.name:mode==='tts'?'AI読み上げ':file.name,bgm,created:new Date().toISOString()};persist();message('アップロード中。画面を開いたままお待ちください。');let audioBlob=null;if(!['tts','title-preview'].includes(mode)){audioBlob=await api('git/blobs','POST',{content:await base64(file),encoding:'base64'});script.audio_file=`input.${ext}`;}const scriptBlob=await api('git/blobs','POST',{content:JSON.stringify(script),encoding:'utf-8'});const tree=await api('git/trees','POST',{tree:[...(audioBlob?[{path:`input/input.${ext}`,mode:'100644',type:'blob',sha:audioBlob.sha}]:[]),{path:'input/script.json',mode:'100644',type:'blob',sha:scriptBlob.sha}]});const commit=await api('git/commits','POST',{message:`Pages input ${id}`,tree:tree.sha,parents:[]});pending.sha=commit.sha;persist();await api('git/refs','POST',{ref:`refs/heads/ui-input/${id}`,sha:commit.sha});await dispatch();}catch(error){message(pending?`${error.message}。受付IDを保持しました。受付状況を確認してから再操作してください。`:error.message);}finally{busy=false;render();}}
async function resumeGeneration(h){
 if(busy||pending)return;busy=true;controls();
 try{
  if((await listRuns()).some(r=>r.status!=='completed'))throw Error('生成中の処理が完了してから再開してください');
  const source=await api(`actions/runs/${h.runId}`);
  if(source.status!=='completed'||source.display_title!==`Pages ${h.id}`)throw Error('再開元の処理・受付IDを確認してください');
  const checkpoints=(await api(`actions/runs/${h.runId}/artifacts?per_page=100`)).artifacts;
  if(!checkpoints.some(a=>a.name===`${h.kind==='batch'?'batch':'video'}-input-${h.id}`&&activeArtifact(a)))throw Error('再開用入力がありません。保存期限切れ・保存失敗のため新規生成してください');
  pending={id:h.id,repo:h.repo,kind:h.kind,sha:h.sha,signs:h.signs,subjectKind:h.subjectKind,audioMode:h.audioMode,verticalArtifact:h.verticalArtifact,horizontalArtifact:h.horizontalArtifact,outputMode:h.outputMode,pairedOutput:h.pairedOutput,outputFormats:outputFormats(h),audio:h.audio,bgm:h.bgm,created:new Date().toISOString(),resumeFrom:h.runId};persist();
  await dispatch();
 }catch(e){message(e.message+'。受付情報は保持しています。受付状況を確認してください。');}
 finally{busy=false;render();}
}
$('generate').onclick=()=>submit('video');
window.videoStudioSubmitBatch=()=>submit('batch');
$('recover').onclick=refresh;
$('retry').onclick=async()=>{if(busy||!pending?.sha)return;busy=true;controls();try{if(await recover())return;if(pending.resumeFrom){await dispatch();return;}try{const ref=await api(`git/ref/heads/ui-input/${pending.id}`);if(ref.object.sha!==pending.sha)throw Error('入力ブランチが変更されています');}catch(e){if(e.status!==404)throw e;await api('git/refs','POST',{ref:`refs/heads/ui-input/${pending.id}`,sha:pending.sha});}await dispatch();}catch(e){message(e.message);}finally{busy=false;render();}};
$('discard').onclick=async()=>{if(busy||!pending||pending.dispatched)return;busy=true;try{if(await recover())return;if(pending.sha){try{const ref=await api(`git/ref/heads/ui-input/${pending.id}`);if(ref.object.sha!==pending.sha)throw Error('入力が変更されています');await api(`git/refs/heads/ui-input/${pending.id}`,'DELETE');}catch(e){if(e.status!==404)throw e;}}pending=null;persist();message('未受付の入力を取り消しました。音声を選び直して実行できます。');}catch(e){message(e.message);}finally{busy=false;render();}};
$('refresh').onclick=refresh;document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('pageshow',refresh);window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});setInterval(()=>{if(pending||history.some(h=>h.status!=='completed'||(h.kind==='batch'&&h.conclusion==='success'&&(h.artifacts?.length||0)<(h.signs?.length||0))))refresh();},15000);render();if(!token)$('connection').open=true;refresh();

function bgmSettings(script) {
 const b=script.global_settings?.bgm ?? {};
 if(!b || typeof b!=='object' || Array.isArray(b)) throw Error('bgmはJSONオブジェクトにしてください');
 const defaults={enabled:false,selection_mode:'category',volume_db:0,ducking:true,start_seconds:0,delay_seconds:0,loop:true,fade_in_seconds:0.5,fade_out_seconds:1.5};
 for(const k of Object.keys(b)) if(!Object.hasOwn(defaults,k) && !['track_id','category','expected_sha256'].includes(k)) throw Error(`bgmの未対応項目: ${k}`);
 if(b.expected_sha256!==undefined&&!/^[0-9a-f]{64}$/.test(b.expected_sha256))throw Error('試聴したBGMのハッシュが不正です');
 const c={...defaults,...b};
 for(const k of ['enabled','ducking','loop']) if(typeof c[k]!=='boolean') throw Error(`bgm.${k}はtrue/falseで指定してください`);
 for(const [k,lo,hi] of [['volume_db',-30,24],['start_seconds',0,86400],['delay_seconds',0,86400],['fade_in_seconds',0,30],['fade_out_seconds',0,30]]) if(typeof c[k]!=='number'||!Number.isFinite(c[k])||c[k]<lo||c[k]>hi) throw Error(`bgm.${k}は${lo}〜${hi}の数値で指定してください`);
 if(!['track','category'].includes(c.selection_mode)) throw Error('BGM選択方式はtrack/categoryにしてください');
 if(c.enabled && c.selection_mode==='category' && !['calm','reflective','mysterious','hopeful','serious'].includes(c.category)) throw Error('BGMカテゴリが不正です');
 if(c.enabled && c.selection_mode==='track' && (typeof c.track_id!=='string'||!c.track_id.trim())) throw Error('BGM曲IDを指定してください');
 return c;
}
async function previewBgm(script) {
 const b=bgmSettings(script);
 if(!b.enabled) { $('bgmPreview').textContent='BGM: なし'; return 'BGM: なし'; }
 const response=await api('contents/media/bgm/catalog.json?ref=main');
 const bytes=Uint8Array.from(atob(response.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
 const catalog=JSON.parse(new TextDecoder().decode(bytes));
 if(catalog.version!==1 || !Array.isArray(catalog.tracks)) throw Error('BGM一覧の形式が不正です');
 const candidates=catalog.tracks.filter(t=>b.selection_mode==='track'?t.id===b.track_id:t.categories?.includes(b.category));
 candidates.sort((a,b)=>(a.priority??100)-(b.priority??100)||(a.id<b.id?-1:a.id>b.id?1:0));
 const t=candidates[0];
 if(!t) throw Error('指定に合う登録済みBGMがありません。音源とcatalog.jsonを登録してください');
 const summary=`BGM予定: ${t.title} (${t.id}) / ${b.selection_mode==='category'?b.category:'曲指定'} / ${b.volume_db} dB / ダッキング${b.ducking?'あり':'なし'} / 曲の${b.start_seconds}秒から・動画の${b.delay_seconds}秒から`;
 $('bgmPreview').textContent=summary; return summary;
}
$('checkBgm').onclick=async()=>{try{await previewBgm(JSON.parse($('script').value));}catch(e){$('bgmPreview').textContent=e.message;}};
$('script').addEventListener('input',()=>{try{const b=bgmSettings(JSON.parse($('script').value));$('bgmPreview').textContent=b.enabled?`BGM: ${b.selection_mode==='track'?b.track_id:b.category} / ${b.volume_db} dB（曲名は「BGM設定を確認」で取得）`:'BGM: なし';}catch(e){$('bgmPreview').textContent=e.message;}});

// The builder uses the existing authenticated API without storing credentials.
window.videoStudioApi=api;

function syncAudioUpload() {
 if($('pbApplyOnSend').checked) {
   $('audioUpload').hidden=$('pb_voice_mode')?.value==='tts';
 } else {
   try{$('audioUpload').hidden=JSON.parse($('script').value).global_settings?.voice_mode==='tts';}catch{$('audioUpload').hidden=false;}
 }
}
$('script').addEventListener('input',syncAudioUpload);
$('pbApplyOnSend').addEventListener('change',syncAudioUpload);





