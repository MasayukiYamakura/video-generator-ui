import {UPLOAD_WORKFLOW,generateUploadKey,keyStore,decryptPermission,waitForOperation} from './upload-actions.mjs?v=20261101-actions-1';
import {newId,parseDataset} from './core.mjs?v=20261101-actions-1';
export const REFERENCE_WORKFLOW='dance-reference.yml';
const $=id=>document.getElementById(id);
const LABELS={queued:'受付待ち',preparing:'登録中（CPU）',waiting:'Kaggle登録待ち',uncertain:'登録結果の確認が必要',
  ready:'利用可能',needs_file:'動画ファイルが必要',failed:'登録失敗',fetching:'素材を取得中',validating:'動画を検査中',
  normalizing:'動画形式を統一中',publishing:'Kaggleへ保存中'};
const ERRORS={YOUTUBE_IMPORT_DISABLED:'YouTube自動取得は確認前のため停止中です。参考リンクを保存しました。動画ファイルを追加してください。',
  CLOUDINARY_SECRETS_MISSING:'GitHub SecretsにDANCE_CLOUDINARY_CLOUD_NAME・DANCE_CLOUDINARY_API_KEY・DANCE_CLOUDINARY_API_SECRETを登録してください。',UPLOAD_EXPIRED:'アップロードの受付期限が切れました。',
  AUTH_REQUIRED:'GitHubの実行ユーザーとmainブランチを確認してください。',UPLOAD_TOO_LARGE:'動画は80 MB以下にしてください。',
  QUOTA_EXCEEDED:'素材の保存数・容量、または本日のアップロード上限に達しました。',DATASET_PENDING:'Kaggleの登録待ちです。「登録を再開」で保存状況を確認できます。',
  DATASET_PUBLISH_UNCERTAIN:'Kaggleの保存結果が不明です。新規登録を繰り返さず、同じ受付を確認してください。',
  VIDEO_PATH_REQUIRED:'動画が複数ある場合は、Dataset内の対象動画パスを指定してください。',
  HDR_UNSUPPORTED:'HDR動画は初版では非対応です。SDRのMP4・MOVを使用してください。',
  UNSUPPORTED_CODEC:'映像コーデックが非対応です。H.264またはHEVCを使用してください。',
  SOURCE_TOO_LONG:'元動画は120秒以内にしてください。',SOURCE_PROCESSING_FAILED:'素材の取得・検査に失敗しました。動画の形式とアクセス権を確認してください。',
  CLAIM_BUSY:'素材登録が実行中です。先に登録状況を確認してください。',SIGNATURE_EXPIRED:'アップロード許可の期限が切れました。「登録を再開」で更新してください。'};
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
    this.renderSource();this.controls(false);
  }
  key(){return 'dance-reference-pending:'+this.getClient().repo;}
  save(value){this.pending=value;if(value)localStorage.setItem(this.key(),JSON.stringify(value));else localStorage.removeItem(this.key());this.renderPending();}
  controls(connected=true){
    for(const id of ['register','reference-refresh'])$(id).disabled=!connected||this.busy;
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
    $('youtube-note').textContent=this.policy.youtube_enabled?'取得条件を満たす公開動画の試験機能です。取得不可の場合はファイルを登録してください。':'自動取得は確認前のため停止中です。URLを参考リンクとして保存し、動画ファイルを追加できます。';
    this.renderPending();await this.refresh();
  }
  disconnect(){if(this.objectURL)URL.revokeObjectURL(this.objectURL);this.objectURL=null;$('reference-file').value='';$('upload-preview').removeAttribute('src');$('upload-preview').hidden=true;this.pending=null;this.index={references:[],requests:[]};$('reference-history').replaceChildren();this.renderPending();this.controls(false);}
  async refresh(){
    const client=this.getClient();if(!client?.token)return;
    const [index,runs,uploadRuns]=await Promise.all([client.json('reference-index.json','results',true),
      client.api(`actions/workflows/${REFERENCE_WORKFLOW}/runs?per_page=30`,{missing:true}),
      client.api(`actions/workflows/${UPLOAD_WORKFLOW}/runs?per_page=30`,{missing:true})]);
    this.index=index||{references:[],requests:[]};this.runs=[...(runs?.workflow_runs||[]),...(uploadRuns?.workflow_runs||[])];
    this.onMaterials(this.index);
    if(this.pending){
      const entry=this.index.requests.find(e=>e.request_id===this.pending.request.request_id);
      const run=this.runs.find(r=>r.display_title===`Dance reference · ${this.pending.request.request_id}`);
      if(entry?.state==='ready'||entry?.state==='needs_file'){
        const ref=this.index.references.find(r=>r.id===entry.reference_id);
        if(entry.state==='ready'){$('reference').value=entry.reference_id;this.message('素材登録が完了しました。動きの確認（CPU）から進めてください。');}
        else this.message(ERRORS.YOUTUBE_IMPORT_DISABLED);
        if(this.pending.request.source_type==='upload'){try{await keyStore(client.repo,this.pending.request.source_ref,null);}catch{}}
        this.save(null);
        if(ref?.name)$('reference-name').value=ref.name;
      }else if(run || entry){this.pending.accepted=true;this.pending.phase='registration_requested';this.save(this.pending);}
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
          this.save({request,accepted:true,phase:'registration_requested'});this.resume();
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
  async start(){
    if(this.busy||this.pending)return;
    this.busy=true;this.controls();
    try{
      const type=$('source-type').value,id=newId();let meta;
      if(type==='upload'){this.message('動画ファイルを確認しています。');meta=await fileInfo($('reference-file').files[0]);
        const keys=await generateUploadKey();await keyStore(this.getClient().repo,id,keys);meta.public_jwk=keys.publicJwk;}
      const request=registration({source_type:type,name:$('reference-name').value,
        source_ref:type==='upload'?id:type==='kaggle'?$('dataset').value:$('youtube-url').value,video_path:type==='kaggle'?$('video-path').value:''},id);
      this.save({request,meta,phase:'permission',accepted:false});
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
  async uploadOperation(operation){
    const client=this.getClient(),p=this.pending;
    if(!p.uploadOperation){
      const id=newId();p.uploadOperation={id,operation,before_signed_at:p.observed_signed_at};this.save(p);
      await client.api(`actions/workflows/${UPLOAD_WORKFLOW}/dispatches`,{method:'POST',body:{ref:'main',inputs:{
        upload_id:p.request.source_ref,operation,attempt_id:id,metadata:operation==='prepare'?JSON.stringify({name:p.request.name,...p.meta}):'{}'}}});
    }
    const op=p.uploadOperation;
    const result=await waitForOperation(client,op.id,()=>this.message('GitHub Actionsでアップロード許可を準備・確認しています。画面は後で開き直せます。'));
    p.uploadOperation=null;this.save(p);
    if(result.state==='failed')throw Error(ERRORS[result.error_code]||result.error_code||'アップロード許可の発行に失敗しました。');
    return client.json(`uploads/${p.request.source_ref}.json`,'results',true);
  }
  async send(resume){
    const client=this.getClient(),p=this.pending;
    if(p.api)throw Error('以前のCloudflare方式の受付です。受付表示を閉じ、同じ動画を新規登録してください。');
    if(p.request.source_type==='upload'){
      let receipt=await client.json(`uploads/${p.request.source_ref}.json`,'results',true);
      if(p.uploadOperation && receipt && (['uploaded','imported'].includes(receipt.state) ||
          (p.uploadOperation.operation==='prepare' && receipt.permission && receipt.meta?.sha256===p.meta?.sha256 && receipt.meta?.public_jwk?.n===p.meta?.public_jwk?.n) ||
          (p.uploadOperation.operation==='renew' && receipt.last_signed_at!==p.uploadOperation.before_signed_at))){p.uploadOperation=null;this.save(p);}
      if(p.uploadOperation)receipt=await this.uploadOperation(p.uploadOperation.operation);
      if(!receipt){
        if(!p.meta)throw Error('この受付のファイル情報がありません。受付表示を閉じて動画を選び直してください。');
        receipt=await this.uploadOperation('prepare');
      }
      if(!receipt || receipt.version!==2)throw Error('アップロード受付を確認できません。');
      if(['cancelled','expired'].includes(receipt.state)||receipt.expires_at<=Date.now()/1000)
        throw Error('アップロードの受付期限が切れました。受付表示を閉じて新規登録してください。');
      if(receipt.state==='prepared' && p.phase!=='uploaded'){
        let keys=await keyStore(client.repo,p.request.source_ref);
        if(p.phase==='transferring'||p.phase==='registration_requested'||p.transfer_uncertain||p.accepted||!keys){
          receipt=await this.uploadOperation('probe');
          p.transfer_uncertain=false;this.save(p);
        }
        if(receipt.state==='prepared'){
          if(!keys)throw Error('この端末に復号鍵がありません。最初のブラウザで再開するか、受付表示を閉じて新規登録してください。');
          if(receipt.last_signed_at+3500<=Date.now()/1000){p.observed_signed_at=receipt.last_signed_at;this.save(p);receipt=await this.uploadOperation('renew');}
          if(receipt.state==='prepared'){
            const permission=await decryptPermission(receipt.permission,keys.privateKey,p.request.source_ref);
            const file=$('reference-file').files[0],meta=await fileInfo(file);
            if(meta.sha256!==receipt.meta.sha256)throw Error('最初に選択した同じ動画ファイルを選び直してください。');
            p.phase='transferring';this.save(p);
            try{await transfer(file,permission,value=>{$('upload-progress').hidden=false;$('upload-progress').value=value;$('upload-percent').textContent=`動画転送 ${value}% ／ 登録はまだ完了していません`;});}
            catch(error){p.transfer_uncertain=true;this.save(p);throw error;}
            p.phase='uploaded';this.save(p);
          }
        }
      }
    }
    this.message('素材登録を依頼しています。受付の確認まで画面を開いてください。');
    p.phase='registration_requested';this.save(p);
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
      if(this.pending.request.source_type==='upload' && !this.pending.accepted && !this.pending.api){
        const receipt=await this.getClient().json(`uploads/${id}.json`,'results',true);
        if(receipt && !['imported','cancelled','expired'].includes(receipt.state))await this.uploadOperation('cancel');
      }
      if(this.pending.request.source_type==='upload')await keyStore(this.getClient().repo,id,null);
      this.save(null);this.message('受付の表示を閉じました。履歴はGitHubに残ります。');
    }catch(e){this.message(e.message,true);}finally{this.busy=false;this.controls();}
  }
}
