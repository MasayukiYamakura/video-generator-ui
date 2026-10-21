import {subjects,subjectMeta} from './builder/subjects.mjs?v=tarot-display-20261021';
import {stableVisuals} from './builder/tarot-visual.mjs?v=visual-20261016';
const WORKFLOW='generate_ai_json.yml';
const SIGNS=['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
const BGM_CATEGORIES=['calm','reflective','mysterious','hopeful','serious'];
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const utf8=text=>new TextEncoder().encode(text);

function decodeBlob(content){
  const raw=atob(content.replace(/\s/g,''));
  return new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));
}
function status(text){const node=$('builderStatus');if(node)node.textContent=text;}
function ctaEnabled(){return Boolean($('pb_cta_enabled')?.checked);}
function aiBgm(){return ['ai','category'].includes($('pb_bgm_mode')?.value)&&($('pb_bgm_mode')?.value==='ai'||$('pb_bgm_category')?.value==='ai');}
function targeted(prompt,zodiac,kind){
  const label=kind==='source'?'占い結果':'動画用scene JSON';
  return `重要: 次の依頼全体のうち zodiac=${zodiac} の1対象だけを生成してください。他の対象は生成しません。Structured Outputsのスキーマに厳密に従い、${label}を返してください。\n\n${prompt}`;
}
const subjectConfig=()=>window.videoConfigurator?.previewConfig();
function batchDetails(){return [...document.querySelectorAll('#pbBatchEntries details')];}
function requestedBatchSigns(){
  return batchDetails().filter(d=>d.querySelector('.batch-select')?.checked&&!d.querySelector('summary')?.textContent.includes('AI出力取込済')).map(d=>d.dataset.sign);
}
function expectedCards(detail){
  const selects=[...detail.querySelectorAll('select')];
  return [0,1,2,3].map(i=>({position:['overall','relationships','work','advice'][i],card_id:selects[i*2].value,orientation:selects[i*2+1].value}));
}
function batchCta(detail){return detail.querySelector('input[maxlength]')?.value.trim()||$('pbBatchCta')?.value.trim()||'';}
function stableStringify(value){
  if(Array.isArray(value))return `[${value.map(stableStringify).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function requestHash(request){
  const digest=await crypto.subtle.digest('SHA-256',utf8(stableStringify(request)));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function buildSingleRequest(){
  if($('pbOutputMode')){$('pbOutputMode').value='content';$('pbOutputMode').dispatchEvent(new Event('change'));}
  $('pbBuild')?.click();
  const prompt=$('pbPrompt')?.value||'';
  if(!prompt)throw Error('先に月間星座タロットの入力内容を確認してください');
  const tarot=window.videoConfigurator?.previewConfig()?.video.template==='tarot_monthly';
  return {version:1,kind:'single-scenes',...subjectMeta(subjectConfig()),prompt,tarot,cta_enabled:tarot&&ctaEnabled(),cta_text:tarot?$('pbTarotCtaText')?.value.trim()||'':'',allowed_bgm_categories:aiBgm()?BGM_CATEGORIES:[]};
}
export function buildBatchScenesRequest(){
  $('pbBatchBuild')?.click();
  const prompt=$('pbBatchPrompt')?.value||'';
  if(!prompt)throw Error('一括制作のカードと原稿を確認してください');
  const signs=requestedBatchSigns();
  if(!signs.length)throw Error('AI出力が必要な星座がありません');
  const bySign=Object.fromEntries(batchDetails().map(d=>[d.dataset.sign,d]));
  return {version:1,kind:'batch-scenes',...subjectMeta(subjectConfig()),allowed_bgm_categories:aiBgm()?BGM_CATEGORIES:[],items:signs.map(zodiac=>({zodiac,prompt:targeted(prompt,zodiac,'scenes'),cards:expectedCards(bySign[zodiac]),cta_enabled:ctaEnabled(),cta_text:batchCta(bySign[zodiac])}))};
}
export function buildBatchSourceRequest(){
  $('pbBatchSourcePromptBuild')?.click();
  const prompt=$('pbBatchSourcePrompt')?.value||'';
  if(!prompt)throw Error('占い結果用の入力内容を確認してください');
  const year=Number($('pbBatchYear')?.value),month=Number($('pbBatchMonth')?.value),period=$('pbBatchPeriod')?.value;
  const SIGNS=Object.keys(subjects(subjectConfig()));
  const visuals=stableVisuals(SIGNS,prompt);
  return {version:1,kind:'batch-source',...subjectMeta(subjectConfig()),year,month,period,cta_enabled:ctaEnabled(),shared_cta:$('pbBatchCta')?.value.trim()||'',items:SIGNS.map(zodiac=>({zodiac,visual:visuals[zodiac],prompt:targeted(prompt,zodiac,'source')+'\nこの星座のvisualは全体で偏りなくランダム割当済みです。次の値を変更せず出力してください：'+JSON.stringify(visuals[zodiac])}))};
}

async function submit(request){
  const api=window.videoStudioApi;if(typeof api!=='function')throw Error('GitHubへ接続してください');
  const raw=JSON.stringify(request);if(utf8(raw).length>1024*1024)throw Error('AI生成入力は1 MiBまでです');
  const [id,resumeKey]=[crypto.randomUUID(),await requestHash(request)];
  const blob=await api('git/blobs','POST',{content:raw,encoding:'utf-8'});
  const tree=await api('git/trees','POST',{tree:[{path:'input/request.json',mode:'100644',type:'blob',sha:blob.sha}]});
  const commit=await api('git/commits','POST',{message:`Pages AI input ${id}`,tree:tree.sha,parents:[]});
  await api('git/refs','POST',{ref:`refs/heads/ui-ai-input/${id}`,sha:commit.sha});
  await api(`actions/workflows/${WORKFLOW}/dispatches`,'POST',{ref:'main',inputs:{receipt_id:id,input_sha:commit.sha}});
  return {id,resumeKey};
}
async function progressCount(resumeKey){
  const api=window.videoStudioApi;
  try{
    const ref=await api(`git/ref/heads/ui-ai-progress/${resumeKey}`);
    const tree=await api(`git/trees/${ref.object.sha}?recursive=1`);
    const entry=tree.tree?.find(x=>x.path==='progress.json'&&x.type==='blob');
    if(!entry)return 0;
    const blob=await api(`git/blobs/${entry.sha}`);
    const parsed=JSON.parse(decodeBlob(blob.content));
    return Object.keys(parsed.items||{}).length;
  }catch{return 0;}
}
async function waitForRun(id,resumeKey,kind){
  const api=window.videoStudioApi;
  const isBatch=kind==='batch-source'||kind==='batch-scenes';
  for(let attempt=0;attempt<900;attempt++){
    const data=await api(`actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=30`);
    const run=data.workflow_runs?.find(r=>r.display_title===`AI JSON ${id}`);
    if(run?.status==='completed'){
      if(run.conclusion!=='success'){
        const saved=isBatch?await progressCount(resumeKey):0;
        const suffix=saved?` ${saved}件の途中結果は保存済みです。同じ条件で再実行すると続きから再開します。`:' 同じ条件で再実行すると、保存済みの途中結果があれば続きから再開します。';
        throw Error(`Gemini生成に失敗しました。GitHub Actions #${run.id} を確認してください。${suffix}`);
      }
      return run;
    }
    if(attempt===0)status('Gemini生成を受け付けました。Structured Outputsで生成中です。');
    if(isBatch&&attempt>0&&attempt%3===0){
      const saved=await progressCount(resumeKey);
      if(saved)status(`Geminiで順次生成中です。${saved}件を保存済みです。失敗しても次回は続きから再開します。`);
    }
    await sleep(4000);
  }
  throw Error('Gemini生成の完了確認がタイムアウトしました。GitHub Actionsを確認してください');
}
async function result(id){
  const api=window.videoStudioApi;
  const ref=await api(`git/ref/heads/ui-ai-output/${id}`);
  const tree=await api(`git/trees/${ref.object.sha}?recursive=1`);
  const entry=tree.tree?.find(x=>x.path==='output.json'&&x.type==='blob');
  if(!entry)throw Error('Gemini生成結果が見つかりません');
  const blob=await api(`git/blobs/${entry.sha}`);
  const parsed=JSON.parse(decodeBlob(blob.content));
  try{await api(`git/refs/heads/ui-ai-output/${id}`,'DELETE');}catch{}
  return parsed;
}
function apply(kind,data){
  if(kind==='single-scenes'){
    $('script').value=JSON.stringify(data,null,2);$('script').dispatchEvent(new Event('input'));$('pbApplyOnSend').checked=true;
    status('Gemini Structured Outputsの結果をscript.jsonへ反映しました。内容を確認して動画生成できます。');return;
  }
  if(kind==='batch-source'){
    $('pbBatchSource').value=JSON.stringify(data,null,2);$('pbBatchSourceImport').click();status((subjectConfig()?.video.tarot_subject==='mbti'?'16タイプ':'12星座')+'の占い結果を取り込みました。内容を確認してください。');return;
  }
  if(kind==='batch-scenes'){
    $('pbBatchResponse').value=JSON.stringify(data,null,2);$('pbBatchImport').click();status('Gemini生成シーンを取り込みました。内容を確認してください。');return;
  }
  throw Error('未対応のAI生成結果です');
}
async function generate(kind){
  const buttonMap={single:'pbAiGenerateSingle',source:'pbAiGenerateSource',batch:'pbAiGenerateBatch'};
  const button=$(buttonMap[kind]);if(button?.disabled)return;
  try{
    if(button)button.disabled=true;
    const request=kind==='single'?buildSingleRequest():kind==='source'?buildBatchSourceRequest():buildBatchScenesRequest();
    status('Gemini Structured Outputsの生成依頼を送信しています。');
    const {id,resumeKey}=await submit(request);await waitForRun(id,resumeKey,request.kind);const data=await result(id);apply(request.kind,data);
  }catch(e){status(e.message);}finally{if(button)button.disabled=false;}
}
function addButton(id,label,target,handler){
  if($(id)||!target)return;
  const button=document.createElement('button');button.id=id;button.type='button';button.className='secondary';button.textContent=label;button.onclick=handler;target.insertAdjacentElement('afterend',button);
}
export function mountDirectAi(){
  addButton('pbAiGenerateSingle','GeminiでJSONを直接生成',$('pbBuild'),()=>generate('single'));
  addButton('pbAiGenerateSource','Geminiで12星座の占い結果を生成',$('pbBatchSourcePromptBuild'),()=>generate('source'));
  addButton('pbAiGenerateBatch','Geminiで未取込分のシーンを直接生成',$('pbBatchBuild'),()=>generate('batch'));
}

