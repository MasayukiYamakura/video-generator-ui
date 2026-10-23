import {newId,parseDataset} from './core.mjs?v=20261023-materials-1';
export const REFERENCE_WORKFLOW='dance-reference.yml';
const $=id=>document.getElementById(id);
const LABELS={queued:'受付待ち',preparing:'登録中（CPU）',waiting:'Kaggle登録待ち',uncertain:'登録結果の確認が必要',
  ready:'利用可能',needs_file:'動画ファイルが必要',failed:'登録失敗',fetching:'素材を取得中',validating:'動画を検査中',
  normalizing:'動画形式を統一中',publishing:'Kaggleへ保存中'};
const ERRORS={YOUTUBE_IMPORT_DISABLED:'YouTube自動取得は確認前のため停止中です。参考リンクを保存しました。動画ファイルを追加してください。',
  UPLOAD_API_NOT_CONFIGURED:'アップロードAPIの初期設定が必要です。',UPLOAD_EXPIRED:'アップロードの受付期限が切れました。',
  AUTH_REQUIRED:'アップロードAPIの本人認証を確認してください。',UPLOAD_TOO_LARGE:'動画は80 MB以下にしてください。',
  QUOTA_EXCEEDED:'素材の保存数・容量、または本日のアップロード上限に達しました。',DATASET_PENDING:'Kaggleの登録待ちです。「登録を再開」で保存状況を確認できます。',
  DATASET_PUBLISH_UNCERTAIN:'Kaggleの保存結果が不明です。新規登録を繰り返さず、同じ受付を確認してください。',
  VIDEO_PATH_REQUIRED:'動画が複数ある場合は、Dataset内の対象動画パスを指定してください。',
  HDR_UNSUPPORTED:'HDR動画は初版では非対応です。SDRのMP4・MOVを使用してください。',
  UNSUPPORTED_CODEC:'映像コーデックが非対応です。H.264またはHEVCを使用してください。',
  SOURCE_TOO_LONG:'元動画は120秒以内にしてください。',SOURCE_PROCESSING_FAILED:'素材の取得・検査に失敗しました。動画の形式とアクセス権を確認してください。',
  CLAIM_BUSY:'素材登録が実行中です。先に登録状況を確認してください。',SIGNATURE_EXPIRED:'アップロード許可の期限が切れました。「登録を再開」で更新してください。'};
export function uploadApi(value) {
  let url;try{url=new URL(value);}catch{throw Error('アップロードの初期設定で、本人専用WorkerのURLを設定してください。');}
  if(url.protocol!=='https:' || !url.hostname.endsWith('.workers.dev') || url.username || url.password || url.port ||
     !['','/'].includes(url.pathname) || url.search || url.hash)throw Error('本人が作成したCloudflare WorkerのHTTPS URLを指定してください。');
  return url.origin;
}
export function youtubeURL(value) {
  const url=new URL(value);let id='';
  if(url.protocol!=='https:' || url.username || url.password || url.port || url.searchParams.has('list'))throw Error('単一のYouTube動画のHTTPS URLを指定してください。');
  if(url.hostname==='youtu.be')id=url.pathname.slice(1);
  else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname))
    id=url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.startsWith('/shorts/')?url.pathname.slice(8):'';
  if(!/^[\w-]{11}$/.test(id||''))throw Error('YouTube動画・ShortsのURLを確認してください。');
  return 'https://www.youtube.com/watch?v='+id;
}
export function registration(values,id=newId()) {
  const name=values.name.trim(),source_type=values.source_type;
  if(!name || name.length>60)throw Error('表示名を1〜60文字で入力してください。');
  if(!['upload','kaggle','youtube'].includes(source_type))throw Error('素材の指定方法を選択してください。');
  let source_ref=values.source_ref.trim(),video_path=(values.video_path||'').trim();
  if(source_type==='youtube')source_ref=youtubeURL(source_ref);
  if(source_type==='kaggle') {
    source_ref=parseDataset(source_ref);
    if(video_path && (video_path.includes('..') || video_path.includes('\\') || (video_path.startsWith('/')&&!video_path.startsWith('/kaggle/input/'))))
      throw Error('Dataset内の相対パス、または/kaggle/input/からのパスを指定してください。');
  }
  if(source_type==='upload' && !/^[a-f0-9]{32}$/.test(source_ref))throw Error('動画を選択してください。');
  return {request_id:id,operation:'register',source_type,source_ref,video_path,name};
}
export async function fileInfo(file) {
  if(!file || file.size<=0 || file.size>80_000_000 || !/\.(mp4|mov)$/i.test(file.name))
    throw Error('80 MB以下のMP4またはMOVを1本選択してください。');
  const hash=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return {bytes:file.size,sha256:Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join(''),format:file.name.split('.').at(-1).toLowerCase()};
}
export async function broker(base,token,path,body,fetcher=(...args)=>globalThis.fetch(...args)) {
  let response;
  try {response=await fetcher(uploadApi(base)+path,{method:body===undefined?'GET':'POST',cache:'no-store',
    headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});}
  catch {throw Error('アップロードAPIへ通信できません。同じ受付の状況を確認してください。');}
  let data;try{data=await response.json();}catch{throw Error('アップロードAPIの応答を確認できません。');}
  if(!response.ok){const e=Error(ERRORS[data.code]||'アップロードAPI：'+(data.code||response.status));e.code=data.code;e.status=response.status;throw e;}
  return data;
}
export function transfer(file,permission,onProgress,makeXHR=()=>new XMLHttpRequest()) {
  if(!/^[a-z0-9_-]+$/i.test(permission.cloud_name||'') || !permission.signature ||
     permission.params?.type!=='authenticated' || permission.params?.overwrite!==false)
    return Promise.reject(Error('アップロード許可の内容を確認できません。'));
  return new Promise((resolve,reject)=>{
    const xhr=makeXHR(),form=new FormData();form.append('file',file);
    for(const [k,v] of Object.entries(permission.params))form.append(k,String(v));
    form.append('api_key',permission.api_key);form.append('signature',permission.signature);
    xhr.open('POST',`https://api.cloudinary.com/v1_1/${permission.cloud_name}/video/upload`);xhr.timeout=300000;
    xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));};
    xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Error('動画の転送結果を確認できません。同じ受付を照会してから再開してください。'));
    xhr.onerror=xhr.ontimeout=()=>reject(Error('動画転送の応答がありません。「登録を再開」で受領状況を確認してください。'));
    xhr.send(form);
  });
}
export function mergeReferences(legacy,index) {
  const map=new Map(legacy.map(r=>[r.id,r]));
  for(const r of index?.references||[]) {
    if(!/^ref-[a-f0-9]{32}$/.test(r.id))continue;
    if(r.state==='ready')map.set(r.id,r);else map.delete(r.id);
  }
  return [...map.values()];
}
export class ReferencePanel {
  constructor(getClient,onMaterials,message) {
    this.getClient=getClient;this.onMaterials=onMaterials;this.message=message;this.pending=null;this.busy=false;this.runs=[];
    this.index={references:[],requests:[]};this.policy={};this.objectURL=null;
    $('source-type').onchange=()=>this.renderSource();
    $('reference-file').onchange=()=>{
      if(this.objectURL)URL.revokeObjectURL(this.objectURL);
      const file=$('reference-file').files[0];$('upload-preview').hidden=!file;
      if(file){this.objectURL=URL.createObjectURL(file);$('upload-preview').src=this.objectURL;$('file-info').textContent=`${file.name} ／ ${(file.size/1e6).toFixed(1)} MB`;}
    };
    $('upload-preview').onerror=()=>{$('file-info').textContent+=' ／ この端末ではプレビューできません。登録時に動画形式を検査します。';};
    $('register').onclick=()=>this.start();$('reference-refresh').onclick=()=>this.refresh().catch(e=>message(e.message,true));
    $('reference-resume').onclick=()=>this.resume();
    $('reference-clear').onclick=()=>this.clear();
    $('save-upload-api').onclick=()=>{
      try{const api=uploadApi($('upload-api').value.trim());localStorage.setItem('d-generator-upload-api:'+this.getClient().repo,api);
        $('upload-api').value=api;message('アップロードAPIの接続先を保存しました。');}catch(e){message(e.message,true);}
    };
    this.renderSource();this.controls(false);
  }
  key(){return 'dance-reference-pending:'+this.getClient().repo;}
  save(value){this.pending=value;if(value)localStorage.setItem(this.key(),JSON.stringify(value));else localStorage.removeItem(this.key());this.renderPending();}
  controls(connected=true){
    for(const id of ['register','reference-refresh','save-upload-api'])$(id).disabled=!connected||this.busy;
    $('register').disabled=!connected||this.busy||!!this.pending;
    $('reference-resume').disabled=!connected||this.busy;
    $('reference-clear').disabled=!connected||this.busy;
    this.onStateChange?.();
  }
  renderSource(){
    const mode=$('source-type').value;
    for(const kind of ['upload','kaggle','youtube'])$('source-'+kind).hidden=mode!==kind;
  }
  renderPending(){
    $('reference-pending').hidden=!this.pending;
    $('reference-pending-text').textContent=this.pending?`素材受付：${this.pending.request.request_id} ／ ${this.pending.request.name}`:'';
    this.controls(!!this.getClient()?.token);
  }
  async connect(policy){
    this.policy=policy||{};
    let saved=null;try{saved=JSON.parse(localStorage.getItem(this.key())||'null');}catch{}
    this.pending=saved;
    $('upload-api').value=this.policy.upload_api_url||localStorage.getItem('d-generator-upload-api:'+this.getClient().repo)||'';
    $('youtube-note').textContent=this.policy.youtube_enabled?'取得条件を満たす公開動画の試験機能です。取得不可の場合はファイルを登録してください。':'自動取得は確認前のため停止中です。URLを参考リンクとして保存し、動画ファイルを追加できます。';
    this.renderPending();await this.refresh();
  }
  disconnect(){if(this.objectURL)URL.revokeObjectURL(this.objectURL);this.objectURL=null;$('reference-file').value='';$('upload-preview').removeAttribute('src');$('upload-preview').hidden=true;this.pending=null;this.index={references:[],requests:[]};$('reference-history').replaceChildren();this.renderPending();this.controls(false);}
  async refresh(){
    const client=this.getClient();if(!client?.token)return;
    const [index,runs]=await Promise.all([client.json('reference-index.json','results',true),
      client.api(`actions/workflows/${REFERENCE_WORKFLOW}/runs?per_page=30`,{missing:true})]);
    this.index=index||{references:[],requests:[]};this.runs=runs?.workflow_runs||[];
    this.onMaterials(this.index);
    if(this.pending){
      const entry=this.index.requests.find(e=>e.request_id===this.pending.request.request_id);
      const run=this.runs.find(r=>r.display_title===`Dance reference · ${this.pending.request.request_id}`);
      if(entry?.state==='ready'||entry?.state==='needs_file'){
        const ref=this.index.references.find(r=>r.id===entry.reference_id);
        if(entry.state==='ready'){$('reference').value=entry.reference_id;this.message('素材登録が完了しました。動きの確認（CPU）から進めてください。');}
        else this.message(ERRORS.YOUTUBE_IMPORT_DISABLED);
        this.save(null);
        if(ref?.name)$('reference-name').value=ref.name;
      }else if(run || entry){this.pending.accepted=true;this.save(this.pending);}
    }
    this.renderHistory();this.renderPending();
  }
  renderHistory(){
    const box=$('reference-history');box.replaceChildren();
    const entries=this.index.requests.slice(0,10);
    for(const e of entries){
      const card=document.createElement('article');card.className='take';
      const h=document.createElement('h3');h.textContent=e.name||'素材登録';card.append(h);
      const p=document.createElement('p');p.textContent=(LABELS[e.state]||e.state)+' ／ '+(LABELS[e.stage]||e.stage);card.append(p);
      if(e.error_code){const error=document.createElement('p');error.textContent=ERRORS[e.error_code]||e.error_code;card.append(error);}
      const ref=this.index.references.find(r=>r.id===e.reference_id);
      if(ref?.state==='ready'){const meta=document.createElement('p');meta.className='meta';meta.textContent=`${ref.duration_seconds.toFixed(2)}秒 ／ ${ref.has_audio?'音声あり':'無音'} ／ ${ref.source.type}`;card.append(meta);}
      if(['failed','waiting','uncertain'].includes(e.state)){
        const retry=document.createElement('button');retry.className='secondary';retry.textContent='この登録を再開';
        retry.onclick=()=>{
          if(this.busy)return;
          if(this.pending && this.pending.request.request_id!==e.request_id){this.message('先に現在の受付を確認するか、受付表示を閉じてください。',true);return;}
          const request=Object.fromEntries(['request_id','source_type','source_ref','video_path','name'].map(k=>[k,e[k]||'']));request.operation='register';
          let api;try{if(request.source_type==='upload')api=this.api();}catch(error){this.message(error.message,true);return;}
          this.save({request,accepted:true,...(api?{api}:{})});this.resume();
        };card.append(retry);
      }
      if(e.state==='needs_file'){
        const add=document.createElement('button');add.className='secondary';add.textContent='動画ファイルを追加';
        add.onclick=()=>{if(this.pending||this.busy){this.message('現在の受付を先に確認してください。',true);return;}
          $('source-type').value='upload';$('reference-name').value=e.name;this.renderSource();this.message('参考動画のMP4・MOVを選択して登録してください。');};card.append(add);
      }
      if(e.workflow_run && /^\d+$/.test(e.workflow_run)){const a=document.createElement('a');a.textContent='GitHubで素材登録を確認';a.href=`https://github.com/${this.getClient().repo}/actions/runs/${e.workflow_run}`;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}
      box.append(card);
    }
    if(!entries.length){const p=document.createElement('p');p.className='muted';p.textContent='新しい素材の登録履歴はここに表示されます。';box.append(p);}
    if(this.pending){const r=this.runs.find(r=>r.display_title===`Dance reference · ${this.pending.request.request_id}`);
      $('reference-pending-status').textContent=r?.status!=='completed'&&r? '登録を受け付けました。CPU処理中です。画面を閉じても続きます。':
        this.pending.accepted?'処理結果は下の素材登録履歴を確認してください。失敗・待機の場合は同じ受付で再開できます。':'転送・受付がまだ完了していません。この画面を閉じた場合は同じ受付から再開してください。';}
  }
  api(){if(!$('upload-consent').checked)throw Error('本人のWorker URLを確認し、トークン送信への同意にチェックしてください。');return uploadApi($('upload-api').value.trim());}
  async start(){
    if(this.busy||this.pending)return;
    this.busy=true;this.controls();
    try{
      const type=$('source-type').value,id=newId();let meta;
      if(type==='upload'){this.api();this.message('動画ファイルを確認しています。');meta=await fileInfo($('reference-file').files[0]);}
      const request=registration({source_type:type,name:$('reference-name').value,
        source_ref:type==='upload'?id:type==='kaggle'?$('dataset').value:$('youtube-url').value,video_path:type==='kaggle'?$('video-path').value:''},id);
      this.save({request,meta,...(type==='upload'?{api:this.api()}:{}),accepted:false});
      await this.send(false);
    }catch(e){this.message(e.message,true);}finally{this.busy=false;this.controls();}
  }
  async resume(){
    if(this.busy||!this.pending)return;this.busy=true;this.controls();
    try{
      await this.refresh();if(!this.pending)return;
      if(this.runs.some(r=>r.display_title===`Dance reference · ${this.pending.request.request_id}`&&r.status!=='completed'))
        throw Error('素材登録が実行中です。「登録状況を確認」を使ってください。');
      await this.send(true);
    }catch(e){this.message(e.message,true);}finally{this.busy=false;this.controls();}
  }
  async send(resume){
    const client=this.getClient(),p=this.pending;
    if(p.request.source_type==='upload' && this.api()!==p.api)throw Error('この受付を開始したWorker URLに戻してください。');
    if(p.request.source_type==='upload'&&!p.accepted){
      let permission;
      try {permission=await broker(p.api,client.token,'/v1/uploads',{upload_id:p.request.source_ref,name:p.request.name,...p.meta});}
      catch(e){if(e.code!=='SIGNATURE_EXPIRED')throw e;permission=await broker(p.api,client.token,`/v1/uploads/${p.request.source_ref}/renew`,{});}
      if(permission.state==='issued'){
        try{permission=await broker(p.api,client.token,`/v1/uploads/${p.request.source_ref}/complete`,{});}
        catch(e){if(e.code!=='UPLOAD_NOT_FOUND')throw e;}
      }
      if(permission.state==='issued'){
        if(!permission.signature)permission=await broker(p.api,client.token,`/v1/uploads/${p.request.source_ref}/renew`,{});
        if(permission.state==='issued'){
          const file=$('reference-file').files[0],meta=await fileInfo(file);
          if(meta.sha256!==p.meta.sha256)throw Error('最初に選択した同じ動画ファイルを選び直してください。');
          await transfer(file,permission,value=>{$('upload-progress').hidden=false;$('upload-progress').value=value;$('upload-percent').textContent=`動画転送 ${value}% ／ 登録はまだ完了していません`;});
          await broker(p.api,client.token,`/v1/uploads/${p.request.source_ref}/complete`,{});
        }
      }
    }else if(p.request.source_type==='upload'&&resume){
      // A cancelled old run may leave a claim. Only the owner API can release a terminal run.
      const state=await broker(p.api,client.token,`/v1/uploads/${p.request.source_ref}`);
      if(state.state==='claimed')await broker(p.api,client.token,`/v1/uploads/${p.request.source_ref}/renew`,{});
    }
    // Persist before dispatch. No automatic POST retries on unknown acknowledgement.
    this.message('素材登録を依頼しています。受付の確認まで画面を開いてください。');
    await client.api(`actions/workflows/${REFERENCE_WORKFLOW}/dispatches`,{method:'POST',body:{ref:'main',inputs:{...p.request,operation:resume?'resume':'register'}}});
    p.accepted=true;this.save(p);this.message('素材登録を受け付けました。画面を閉じてもCPU処理は続きます。GPUは使用しません。');
    await this.refresh();
  }
  async clear(){
    if(this.busy||!this.pending)return;this.busy=true;this.controls();
    try{
      await this.refresh();if(!this.pending)return;
      const id=this.pending.request.request_id;
      if(this.runs.some(r=>r.display_title===`Dance reference · ${id}`&&r.status!=='completed'))throw Error('実行中の受付は外せません。完了を待ってください。');
      if(this.pending.request.source_type==='upload'&&!this.pending.accepted){
        try{await broker(this.api(),this.getClient().token,`/v1/uploads/${id}/cancel`,{});}catch(e){if(e.status!==404)throw e;}
      }
      this.save(null);this.message('受付の表示を閉じました。履歴はGitHubに残ります。');
    }catch(e){this.message(e.message,true);}finally{this.busy=false;this.controls();}
  }
}
