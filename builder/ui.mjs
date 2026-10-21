import {subjectKind,subjectMeta,subjects} from './subjects.mjs?v=mbti-20261019';
import {formatConfig,promptConfig,requestedFormats} from './presentation.mjs?v=stock-plan-20261021';
import {tarotBrand} from './tarot-brand.mjs?v=mbti-20261019';
import {mountPresentationEditor} from './presentation-editor.mjs?v=stock-plan-20261021';
import {VIDEO_FIELDS,LAYOUT_LABELS} from './fields.mjs?v=stock-plan-20261021';
import {el,options,field} from './dom.mjs?v=maintenance-20261016';
import {mountSingleEditor} from './single-editor.mjs?v=mbti-20261019';
import {mountBatchEditor} from './batch-editor.mjs?v=mbti-20261019';
import {loadPresetData,savePresetSettings} from './preset-controller.mjs?v=mbti-20261019';
import {visiblePreset,isBatch,isTikTok} from './modes.mjs?v=mbti-20261019';
import {VIDEO_DEFAULTS, LAYOUT_DEFAULTS} from './presets.mjs?v=mbti-20261019';
import {emptyRegistry,catalog,clone,resolvePreset,resolveConfig,defaultLayout,PRESENTATION_VIDEO_KEYS} from './model.mjs?v=stock-plan-20261021';
import {buildPrompt} from './prompt.mjs?v=stock-plan-20261021';
import {applyConfig,tarotTitle} from './compiler.mjs?v=stock-plan-20261021';
import {decodeContent} from './storage.mjs?v=mbti-20261019';
import {drawPreview} from './preview.mjs?v=mbti-20261019';

const $=id=>document.getElementById(id);
export function mountBuilder(apiProvider) {
  let registry=emptyRegistry(), sha=null, registryRepo=null, bgmCatalog=null, image=null, imageFile=null, imageFormat=null, imageRequest=0;
  let session={video_preset:'tiktok_standard',layout_preset:'portrait_standard',background:'background.png',overrides:{video:{},layout:{}},ai:{}};
  let snapshot=null, loadedRepo='', working=false;
  let batchEditor, presentationEditor;
  const subjectLabels=new WeakMap();
  function relabelSubject(kind){
    $('pbBatchArea').setAttribute('aria-label',kind==='mbti'?'16タイプ一括制作':'12星座一括制作');
    for(const root of [$('pbBatchArea'),$('pbTarotArea'),$('pbBatchRun'),$('pbProductionMode')]){
      if(!root)continue;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
      while((node=walker.nextNode())){if(['TEXTAREA','SCRIPT','STYLE'].includes(node.parentElement?.tagName))continue;
        if(!subjectLabels.has(node))subjectLabels.set(node,node.nodeValue);const original=subjectLabels.get(node);
        const next=kind==='mbti'?original.replaceAll('月間星座タロット','月間MBTIタロット').replaceAll('12星座','16タイプ').replaceAll('星座','タイプ').replaceAll('48枚','64枚'):original;
        if(next!==node.nodeValue)node.nodeValue=next;
      }
    }
  }
  const status=text=>{$('builderStatus').textContent=text;};
  const connection=()=>{
    const expected=$('repo').value.trim();
    return async(...args)=>{
      if($('repo').value.trim()!==expected)throw Error('リポジトリが変更されました。操作をやり直してください');
      const r=await apiProvider()(...args);
      if($('repo').value.trim()!==expected)throw Error('リポジトリが変更されました。操作をやり直してください');
      return r;
    };
  };
  async function run(action) {if(working)return;working=true;for(const id of ['pbLoad','pbSaveVideo','pbOverwriteVideo','pbBackgroundPreview'])$(id).disabled=true;try{await action();}catch(e){status(e.message);}finally{working=false;for(const id of ['pbLoad','pbSaveVideo','pbOverwriteVideo','pbBackgroundPreview'])$(id).disabled=false;}}
  function config() {return resolveConfig(registry,session,{draft:true});}
  const designFormat=(c=config())=>session.designFormat||(c.video.output_mode==='horizontal_only'?'landscape':c.video.format);
  function previewConfig() {const c=config();if(c.video.template==='tarot_monthly')return c;const format=designFormat(c);return formatConfig(c,format);}
  const configuredInput=()=>singleTarot.configured(resolveConfig(registry,session));
  function invalidate() {
    snapshot=null;$('pbSettingsState').textContent='設定が変わりました。プロンプトを再生成してください。';$('pbPrompt').value='';$('pbBatchSourcePrompt').value='';
    const preset=resolvePreset(registry,'video',session.video_preset);
    const video={...VIDEO_DEFAULTS,...preset.values,...session.overrides.video};
    if(isBatch(video))batchEditor.changed();
    status('設定が変わりました。プロンプトを生成し直してください。');
  }
  function paint() {
    try {const c=config();let title='';try{const script=JSON.parse($('script').value);title=script.scenes?.[0]?.hook_text||script.scenes?.[0]?.text||'';}catch{}
      if(c.ai.hook==='manual')title=c.ai.manual_hook.split('\n---\n')[0];
      if(c.video.template==='tarot_monthly'){
        const batch=isBatch(config().video);
        c.tarot={...subjectMeta(c),year:Number($(batch?'pbBatchYear':'pbTarotYear').value),month:Number($(batch?'pbBatchMonth':'pbTarotMonth').value),period:$(batch?'pbBatchPeriod':'pbTarotPeriod').value,zodiac:batch?Object.keys(subjects(c))[0]:$('pbTarotZodiac').value};
        title=tarotTitle(c.tarot);
      }
      const previewFormat=designFormat(c);
      const preview=c.video.template==='tarot_monthly'?{...c,video:{...c.video,format:previewFormat},width:previewFormat==='vertical'?1080:1920,height:previewFormat==='vertical'?1920:1080}:previewConfig();
      $('pbPreviewFormatLabel').textContent=(previewFormat==='vertical'?'縦型 9:16':'横型 16:9')+'をプレビュー中（デザインのタブで切替）';
      preview.scenery=$('pbPreviewScenery').checked;
      if(c.video.template==='tarot_monthly'&&c.video.tarot_renderer==='remotion'&&previewFormat==='landscape')preview.tarotBrand=tarotBrand(c,title);
      const script=(()=>{try{return JSON.parse($('script').value);}catch{return {};}})();
      const themeTitle=preview.design?.theme.title|| (c.ai.theme==='manual'?c.ai.theme_title:(script.global_settings?.theme?.title||script.theme_title||'テーマタイトル'));
      drawPreview($('pbCanvas'),preview,imageFile===preview.background&&imageFormat===preview.video.format?image:null,$('pbPreviewIntro').checked,$('pbSafe').checked,title,session.video_preset,themeTitle);$('pbPreviewError').textContent='';reviewSettings(c);}
    catch(e){$('pbPreviewError').textContent=e.message;}
  }
  function reviewSettings(c) {
    const root=$('pbSettingsReview');root.replaceChildren();
    const add=(a,b)=>{const p=el('p');p.append(el('strong',a+'：'),document.createTextNode(b));root.append(p);};
    const batch=isBatch(c.video);
    $('pbSettingsState').textContent=batch?'一括制作は現在の設定を使用します。設定変更後はシーン用プロンプトを再生成してください。':!$('pbApplyOnSend').checked?'JSONの設定を使用します。画面のデザイン設定は適用しません。':snapshot?'プロンプト生成時の設定を確定しました。':'画面の設定を確認し、プロンプトを生成してください。';
    if(!batch&&!$('pbApplyOnSend').checked)return;
    add('出力',requestedFormats(c).map(f=>f==='vertical'?'縦型':'横型').join(' ＋ '));
    add('音声',c.video.voice_mode==='tts'?'AI読み上げ':c.video.voice_mode==='anonymous'?'匿名加工':'録音音声');
    add('BGM',c.video.bgm_mode==='off'?'OFF':c.video.bgm_mode==='track'?c.video.bgm_track:c.video.bgm_mode==='category'?c.video.bgm_category:'AI自動');
    for(const f of requestedFormats(c)) {
      if(c.video.template==='tarot_monthly'){add(f==='vertical'?'縦型デザイン':'横型デザイン',f==='vertical'?'タロット固定配置':'タロット固定配置・テーマ等は横型タブの設定');continue;}
      const view=formatConfig(c,f),v=view.video;
      const show=k=>(v['intro_'+k]?'冒頭ON':'冒頭OFF')+'／'+(v['body_'+k]?'本編ON':'本編OFF');
      add(f==='vertical'?'縦型デザイン':'横型デザイン',`背景：${v.background_mode==='stock'?'全編動画素材':view.background}、字幕：${show('caption')}、フック：${v.hook_enabled?'ON':'OFF'}、タグ：${show('tags')}、波形：${show('visualizer')}、テーマ：${show('theme')}`);
    }
  }
  function renderFields() {
    const p=resolvePreset(registry,'video',session.video_preset), v={...VIDEO_DEFAULTS,...p.values,...session.overrides.video};
    const lp=resolvePreset(registry,'layout',session.layout_preset), l={...LAYOUT_DEFAULTS,...lp.values,...p.layout,...session.overrides.layout};
    const tarot=v.template==='tarot_monthly',fixedTarot=tarot&&v.tarot_renderer==='remotion',batch=isBatch(v);
    // Legacy fields serve only tarot's existing common renderer contract.
    for(const [key] of VIDEO_FIELDS){const input=$('pb_'+key);if(typeof v[key]==='boolean')input.checked=v[key];else input.value=v[key];}
    for(const key of Object.keys(LAYOUT_DEFAULTS))$('pb_'+key).value=l[key];
    const effective=promptConfig(config()),mixed=tarot?false:requestedFormats(config()).some(f=>formatConfig(config(),f).video.background_mode==='mixed');
    $('pbHookMode').value=session.ai.hook||'ai';$('pbHookText').value=session.ai.manual_hook||'';
    $('pbTarotSharedDesign').hidden=!tarot;
    for(const key of PRESENTATION_VIDEO_KEYS)$('pb_'+key).parentElement.hidden=!tarot||['background_mode','stock_provider','intro_tags','body_tags','intro_theme','body_theme','intro_subtitle','body_subtitle','intro_scenes'].includes(key);
    for(const key of Object.keys(LAYOUT_LABELS))$('pb_'+key).parentElement.hidden=!tarot||key.startsWith('tag_')||key.startsWith('theme_')||key.startsWith('subtitle_')||(key.startsWith('safe_')&&designFormat()!=='vertical')||(fixedTarot&&['caption_center_y','caption_font_size','max_width_ratio'].includes(key));
    for(const key of ['hook_orientation','hook_center_y','hook_top','hook_margin_x','hook_font_size','hook_max_width_ratio','hook_font_size_mode','hook_band_enabled','hook_band_color','hook_band_width_ratio','hook_band_padding_y','hook_band_opacity']){
      const horizontal=v.hook_orientation==='horizontal';
      $('pb_'+key).parentElement.hidden ||= !v.hook_enabled||(['hook_top','hook_margin_x'].includes(key)?horizontal:['hook_center_y','hook_max_width_ratio','hook_band_enabled'].includes(key)?!horizontal:key.startsWith('hook_band_')?(!horizontal||!v.hook_band_enabled):false);
    }
    $('pb_bgm_category').parentElement.hidden=v.bgm_mode!=='category';$('pb_bgm_track').parentElement.hidden=v.bgm_mode!=='track';
    for(const key of VIDEO_FIELDS.map(([key])=>key).filter(k=>k.startsWith('bgm_')&&!['bgm_mode','bgm_category','bgm_track'].includes(k)))$('pb_'+key).parentElement.hidden=v.bgm_mode==='off';
    $('pbTtsFields').hidden=v.voice_mode!=='tts';$('pbTtsDetails').hidden=v.voice_mode!=='tts';$('pbDspHelp').hidden=v.voice_mode!=='anonymous';
    $('pbHookMode').parentElement.hidden=tarot||!effective.video.hook_enabled;
    $('pbHookText').parentElement.hidden=tarot||!effective.video.hook_enabled||$('pbHookMode').value!=='manual';
    $('pbHookText').disabled=$('pbHookMode').value!=='manual'||!effective.video.hook_enabled;
    for(const id of ['pbSearchMode','pbSearchText','pbStockMode','pbStockPercent','pbStockIndices'])$(id).parentElement.hidden=tarot||effective.video.background_mode==='fixed';
    $('pbSearchText').parentElement.hidden ||= $('pbSearchMode').value!=='manual';
    $('pbStockMode').parentElement.hidden ||= !mixed;
    $('pbStockPercent').parentElement.hidden ||= !mixed||$('pbStockMode').value!=='ai';
    $('pbStockIndices').parentElement.hidden ||= !mixed||$('pbStockMode').value!=='manual';
    if(tarot){singleTarot.setSubject(v.tarot_subject);batchEditor?.setSubject(v.tarot_subject);}
    $('pbTarotZodiac').parentElement.firstChild.textContent=v.tarot_subject==='mbti'?'MBTIタイプ':'星座';
    $('pb_output_mode').parentElement.hidden=!(v.format==='vertical'&&(['standard','portrait_brand','tarot_monthly'].includes(v.template)||v.tiktok_style==='legacy_vertical'));
    $('pbProductionMode').parentElement.hidden=!tarot;$('pbProductionMode').value=batch?'batch':'single';
    $('pbTikTokStyle').parentElement.hidden=!isTikTok(v);$('pbTikTokStyle').value=v.tiktok_style;
    $('pb_voice_mode').disabled=batch;$('pb_voice_mode').querySelectorAll('option').forEach(o=>o.disabled=batch&&o.value!=='tts');
    $('pbTarotArea').hidden=!tarot||batch;$('pbBatchArea').hidden=!batch;$('pbSingleNarration').hidden=batch;$('pbSingleScript').hidden=batch;
    $('pbBatchRun').hidden=!batch;$('generate').hidden=batch;$('pbBuild').parentElement.hidden=batch;$('pbPrompt').parentElement.hidden=batch;
    $('pbJsonDetails').hidden=batch;$('pbApplyOnSend').checked=!batch&&$('pbApplyOnSend').checked;
    $('pb_cta_enabled').parentElement.hidden=!tarot;$('pbTarotCtaText').parentElement.hidden=!tarot||!v.cta_enabled;
    $('pbBackgroundPreview').hidden=tarot;$('pbPreviewScenery').parentElement.hidden=tarot;
    if($('pbApplyOnSend').checked||!$('script').value.trim())$('audioUpload').hidden=v.voice_mode==='tts';
    if(batch){$('audioUpload').hidden=true;$('pb_voice_mode').value='tts';}
    relabelSubject(v.tarot_subject);presentationEditor?.render();$('pbPreviewError').textContent='';paint();
  }
  function lists() {
    options($('pbVideo'),catalog(registry,'video').map(p=>[p.id,p.name]),visiblePreset(session.video_preset));
    options($('pb_bgm_track'),[['','曲を選択'],...(bgmCatalog?.tracks||[]).map(t=>[t.id,t.title])]);
    renderFields();
  }
  const singleTarot=mountSingleEditor(invalidate);
  batchEditor=mountBatchEditor({config,status,getCatalog:()=>bgmCatalog,getLoadedRepo:()=>loadedRepo,
    validateDesign:()=>presentationEditor?.assertValid(),
    setOutputMode:mode=>{session.overrides.video.output_mode=mode;}});
  for(const [key,label,items,type] of VIDEO_FIELDS) {
    const input=field($(PRESENTATION_VIDEO_KEYS.includes(key)?'pbLegacyVideoFields':key==='output_mode'||key==='cta_enabled'?'pbBasicFields':key==='voice_mode'?'pbVoiceFields':key==='tts_custom_style'?'pbTtsCustom':key.startsWith('tts_')?'pbTtsFields':'pbVideoFields'),key,label,items,type);
    if(key.startsWith('bgm_')&&type==='number'&&key!=='bgm_volume_db'){input.min=0;input.max=key.includes('fade')?30:86400;input.step=0.1;}
    if(key==='intro_scenes'){input.min=1;input.max=10;input.step=1;}
    if(key==='bgm_volume_db'){
      input.min=-30;input.max=24;input.step=1;
      const hint=document.createElement('small');hint.id='pbBgmVolumeHelp';hint.className='muted';
      hint.textContent='0 dB：従来の標準。+6で小さい場合は+12→+18の順に調整（最大+24）。ダッキングOFFで確認し、声が聞き取れる音量にしてください。';
      input.setAttribute('aria-describedby',hint.id);input.parentElement.append(hint);
    }
    input.addEventListener('change',()=>{session.overrides.video[key]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;invalidate();renderFields();});
  }
  for(const [key,label] of Object.entries(LAYOUT_LABELS)) {
    const input=field($(key.startsWith('safe_')?'pbGuideFields':'pbLayoutFields'),key,label,key==='hook_font_size_mode'?[['auto','自動調整（指定サイズが上限）'],['fixed','固定サイズ']]:null,key==='hook_band_color'?'color':'number');
    input.min=key.includes('font_size')?1:key==='visualizer_size'?16:0;
    input.max=key.includes('ratio')||key.includes('safe_')||key==='hook_margin_x'||key==='hook_band_opacity'?1:key.includes('font_size')?300:key==='visualizer_size'?2000:3840;
    input.step=Number(input.max)===1?0.01:1;
    input.addEventListener('input',()=>{session.overrides.layout[key]=input.type==='number'?Number(input.value):input.value;invalidate();paint();});
  }
  presentationEditor=mountPresentationEditor({root:$('pdEditor'),guideRoot:$('pbGuideFields'),getConfig:config,onInvalid:invalidate,
    getFormat:()=>designFormat(),
    setFormat:format=>{session.designFormat=format;renderFields();refreshBackground();},onChange:value=>{const before=previewConfig().background;session.presentation=value;if(before!==previewConfig().background){image=null;imageFile=null;imageFormat=null;refreshBackground();}invalidate();renderFields();}});
  const modeSessions=new Map();
  async function loadBackgroundPreview(announce=false) {
    const c=previewConfig();
    if(c.video.background_mode==='stock'||c.video.template==='tarot_monthly')return;
    const file=c.background,format=c.video.format,request=++imageRequest;
    const r=await connection()(`contents/media/${file.split('/').map(encodeURIComponent).join('/')}?ref=main`);
    if(request!==imageRequest||file!==previewConfig().background||format!==previewConfig().video.format)return;
    const decoded=atob(r.content.replace(/\s/g,''));
    const bytes=Uint8Array.from(decoded,char=>char.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes])),img=new Image();
    try {await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('背景画像をプレビューできません'));img.src=url;});
      if(file===previewConfig().background&&format===previewConfig().video.format){image=img;imageFile=file;imageFormat=format;paint();if(announce)status('背景画像を読み込みました');}
    }finally{URL.revokeObjectURL(url);}
  }
  function refreshBackground() {
    if(loadedRepo===$('repo').value.trim())loadBackgroundPreview().catch(e=>status(e.message));
  }
  function selectPreset(id) {
    try{presentationEditor.assertValid();}catch(e){status(e.message);$('pbVideo').value=visiblePreset(session.video_preset);$('pbTikTokStyle').value=config().video.tiktok_style;$('pbProductionMode').value=isBatch(config().video)?'batch':'single';return false;}
    const previous={...VIDEO_DEFAULTS,...resolvePreset(registry,'video',session.video_preset).values,...session.overrides.video};
    if(previous.template==='tarot_monthly'&&!isBatch(previous))singleTarot.capture();
    modeSessions.set(session.video_preset,clone(session));
    if(modeSessions.has(id))session=clone(modeSessions.get(id));
    else {session={...session,video_preset:id,overrides:{video:{},layout:{}},layout_preset:defaultLayout(registry,id),background:resolvePreset(registry,'video',id).background||'background.png'};delete session.presentation;delete session.designFormat;}
    if(['tarot_monthly_batch','mbti_monthly_batch'].includes(id)&&!modeSessions.has(id)&&batchEditor.savedOutputMode())
      session.overrides.video.output_mode=batchEditor.savedOutputMode();
    image=null;
    // A newly selected mode must use fresh screen settings, not the previous JSON's audio mode.
    $('pbApplyOnSend').checked=true;
    presentationEditor.reset();invalidate();lists();refreshBackground();
  }
  $('pbVideo').onchange=()=>selectPreset($('pbVideo').value);
  $('pbTikTokStyle').onchange=()=>selectPreset($('pbTikTokStyle').value==='legacy_vertical'?'tiktok_vertical_hook':'tiktok_standard');
  $('pbProductionMode').onchange=()=>{
    const batch=$('pbProductionMode').value==='batch';
    if(selectPreset(subjectKind(config())==='mbti'?(batch?'mbti_monthly_batch':'mbti_monthly_remotion'):(batch?'tarot_monthly_batch':'tarot_monthly_remotion'))===false)return;
    if(batch && config().video.voice_mode!=='tts') {
      session.overrides.video.voice_mode='tts';renderFields();
    }
  };
  for(const [id,key] of [['pbHookMode','hook'],['pbHookText','manual_hook'],['pbSearchMode','search'],['pbSearchText','search_text'],['pbStockMode','stock_scenes'],['pbStockPercent','stock_percent'],['pbStockIndices','stock_indices']]) {
    const input=$(id);
    input.addEventListener(input.tagName==='SELECT'?'change':'input',()=>{
      session.ai[key]=key==='stock_percent'?Number(input.value):input.value;
      invalidate();
      if(input.tagName==='SELECT')renderFields();else paint();
    });
  }
  $('script').addEventListener('input',paint);$('pbApplyOnSend').addEventListener('change',paint);
  $('pbTranscript').addEventListener('input',invalidate);$('pbOutputMode').onchange=invalidate;
  $('pbPreviewIntro').onchange=paint;$('pbPreviewScenery').onchange=paint;$('pbSafe').onchange=paint;
  $('pbBackgroundPreview').onclick=()=>run(()=>loadBackgroundPreview(true));
  $('pbLoad').onclick=()=>run(async()=>{
    const api=connection(), expected=$('repo').value.trim();
    const {preset:r,bgm}=await loadPresetData(api);
    registry=r.registry;sha=r.sha;registryRepo=expected;bgmCatalog=bgm;loadedRepo=expected;
    modeSessions.clear();delete session.presentation;session.overrides={video:{},layout:{}};
    presentationEditor.reset();
    session.background=resolvePreset(registry,'video',session.video_preset).background||'background.png';image=null;
    invalidate();lists();status('保存済みプリセットとBGM一覧を読み込みました');refreshBackground();
  });
  async function save(kind, overwrite=false) {
    presentationEditor.assertValid();
    if(registryRepo!==$('repo').value.trim())throw Error('先に「保存済み設定を読込」を押してください');
    const c=config(), id=overwrite?session.video_preset:$('pbSaveId').value.trim(), name=overwrite?resolvePreset(registry,'video',session.video_preset).name:$('pbSaveName').value.trim();
    const written=await savePresetSettings({api:connection(),registry,sha,session,config:c,id,name,kind,overwrite});
    registry=written.registry;sha=written.sha;
    if(kind==='video'){modeSessions.delete(id);delete session.presentation;session.video_preset=id;session.overrides.video={};session.background=resolvePreset(registry,'video',id).background||'background.png';}else{session.layout_preset=id;session.overrides.layout={};}
    invalidate();lists();status(`${name}を保存しました。プリセット保存では動画生成を実行しません。`);refreshBackground();
  }
  $('pbSaveMode').onchange=()=>{const fresh=$('pbSaveMode').value==='new';$('pbNewPresetFields').hidden=!fresh;$('pbSaveVideo').hidden=!fresh;$('pbOverwriteVideo').hidden=fresh;};
  $('pbSaveVideo').onclick=()=>run(()=>save('video'));
  $('pbOverwriteVideo').onclick=()=>run(()=>save('video',true));
  $('pbBuild').onclick=()=>{try{presentationEditor.assertValid();const c=configuredInput();if(c.video.voice_mode==='tts'&&!$('pbTranscript').value.trim())throw Error('ナレーション原稿を入力してください');if(c.video.bgm_mode!=='off'&&loadedRepo!==$('repo').value.trim())throw Error('BGMを使用する場合は登録一覧を読み込んでください');$('pbPrompt').value=buildPrompt(c,$('pbTranscript').value,bgmCatalog,$('pbOutputMode').value);snapshot=clone(c);snapshot.social_required=true;snapshot.stock_plan_required=true;$('pbApplyOnSend').checked=true;renderFields();status('プロンプトを生成しました。AIの返答をscript.json欄へ貼り付けてください。');}catch(e){status(e.message);}};
  $('pbCopy').onclick=async()=>{try{if(!$('pbPrompt').value)throw Error('先にプロンプトを生成してください');await navigator.clipboard.writeText($('pbPrompt').value);status('コピーしました');}catch{$('pbPrompt').focus();$('pbPrompt').select();status('プロンプト欄を選択しました。iPhoneの「コピー」を使用してください。');}};
  function prepare(script) {
    if(!$('pbApplyOnSend').checked)return script;
    if(!snapshot)throw Error('画面設定を適用するには、設定変更後にプロンプトを生成してください');
    if(snapshot.social_required&&!script.social)throw Error('AIのJSONに投稿用socialがありません。説明文と関連ハッシュタグを含めて生成し直してください');
    if(snapshot.video.bgm_mode!=='off'&&loadedRepo!==$('repo').value.trim())throw Error('現在のリポジトリのBGM登録一覧を読み込んでください');
    presentationEditor.assertValid();return applyConfig(snapshot.stock_plan_required&&promptConfig(snapshot).video.background_mode==='mixed'?{...script,stock_plan:1}:script,snapshot,bgmCatalog);
  }
  $('repo').addEventListener('input',()=>{registry=emptyRegistry();sha=null;registryRepo=null;bgmCatalog=null;loadedRepo='';image=null;imageRequest++;modeSessions.clear();session={video_preset:'tiktok_standard',layout_preset:'portrait_standard',background:'background.png',overrides:{video:{},layout:{}},ai:{}};presentationEditor.reset();invalidate();lists();});
  lists();
  return {prepareScript:prepare, previewConfig:config, batch:{active:()=>isBatch(config().video),manifest:()=>batchEditor.manifest()}};
}









