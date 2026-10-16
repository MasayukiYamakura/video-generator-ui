import {VIDEO_FIELDS,LAYOUT_LABELS} from './fields.mjs?v=maintenance-20261016';
import {el,options,field} from './dom.mjs?v=maintenance-20261016';
import {mountSingleEditor} from './single-editor.mjs?v=maintenance-20261016';
import {mountBatchEditor} from './batch-editor.mjs?v=visual-20261016';
import {loadPresetData,savePresetSettings} from './preset-controller.mjs?v=maintenance-20261016';
import {visiblePreset,isBatch,isTikTok} from './modes.mjs?v=maintenance-20261016';
import {VIDEO_DEFAULTS, LAYOUT_DEFAULTS} from './presets.mjs?v=maintenance-20261016';
import {emptyRegistry,catalog,clone,resolvePreset,resolveConfig,defaultLayout} from './model.mjs?v=maintenance-20261016';
import {buildPrompt} from './prompt.mjs?v=maintenance-20261016';
import {applyConfig,tarotTitle} from './compiler.mjs?v=maintenance-20261016';
import {decodeContent} from './storage.mjs?v=maintenance-20261016';
import {drawPreview} from './preview.mjs?v=maintenance-20261016';

const $=id=>document.getElementById(id);
export function mountBuilder(apiProvider) {
  let registry=emptyRegistry(), sha=null, registryRepo=null, bgmCatalog=null, image=null, imageRequest=0;
  let session={video_preset:'tiktok_standard',layout_preset:'portrait_standard',background:'background.png',overrides:{video:{},layout:{}},ai:{}};
  let snapshot=null, loadedRepo='', working=false;
  let batchEditor;
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
  function config() {return resolveConfig(registry,session);}
  const configuredInput=()=>singleTarot.configured(config());
  function invalidate() {snapshot=null;$('pbPrompt').value='';$('pbBatchSourcePrompt').value='';batchEditor.changed();status('設定が変わりました。プロンプトを生成し直してください。');}
  function paint() {
    try {const c=config();let title='';try{const script=JSON.parse($('script').value);title=script.scenes?.[0]?.hook_text||script.scenes?.[0]?.text||'';}catch{}
      if(c.ai.hook==='manual')title=c.ai.manual_hook.split('\n---\n')[0];
      if(c.video.template==='tarot_monthly'){
        const batch=isBatch(config().video);
        c.tarot={year:Number($(batch?'pbBatchYear':'pbTarotYear').value),month:Number($(batch?'pbBatchMonth':'pbTarotMonth').value),period:$(batch?'pbBatchPeriod':'pbTarotPeriod').value,zodiac:batch?'aries':$('pbTarotZodiac').value};
        title=tarotTitle(c.tarot);
      }
      drawPreview($('pbCanvas'),c,image,$('pbPreviewIntro').checked,$('pbSafe').checked,title,session.video_preset);$('pbPreviewError').textContent='';}
    catch(e){$('pbPreviewError').textContent=e.message;}
  }
  function renderFields() {
    const p=resolvePreset(registry,'video',session.video_preset), v={...VIDEO_DEFAULTS,...p.values,...session.overrides.video};
    const lp=resolvePreset(registry,'layout',session.layout_preset), l={...LAYOUT_DEFAULTS,...lp.values,...p.layout,...session.overrides.layout};
    for(const [key] of VIDEO_FIELDS) {const input=$('pb_'+key);if(typeof v[key]==='boolean')input.checked=v[key];else input.value=v[key];}
    for(const key of Object.keys(LAYOUT_DEFAULTS)) $('pb_'+key).value=l[key];
    $('pb_bgm_category').disabled=v.bgm_mode!=='category';$('pb_bgm_track').disabled=v.bgm_mode!=='track';
    for(const key of ['bgm_start_seconds','bgm_delay_seconds','bgm_loop','bgm_fade_in_seconds','bgm_fade_out_seconds']) $('pb_'+key).disabled=v.bgm_mode==='off';
    $('pb_bgm_volume_db').disabled=v.bgm_mode==='off';$('pb_bgm_ducking').disabled=v.bgm_mode==='off';
    for(const key of ['intro_tags','body_tags']) $('pb_'+key).disabled=v.template!=='portrait_brand';
    $('pb_hook_orientation').disabled=!v.hook_enabled;$('pb_hook_band_enabled').disabled=v.hook_orientation!=='horizontal';
    $('pbBackgroundFile').disabled=v.background_mode==='stock';
    $('pbHookText').disabled=$('pbHookMode').value!=='manual'||!v.hook_enabled;
    $('pbSearchText').disabled=$('pbSearchMode').value!=='manual'||v.background_mode==='fixed';
    $('pbStockPercent').disabled=$('pbStockMode').value!=='ai'||v.background_mode!=='mixed';
    $('pbStockIndices').disabled=$('pbStockMode').value!=='manual'||v.background_mode!=='mixed';
    $('pbThemeTitle').disabled=$('pbThemeMode').value!=='manual'||v.format!=='landscape';
    $('pbTtsFields').hidden=v.voice_mode!=='tts';$('pbTtsDetails').hidden=v.voice_mode!=='tts';
    $('pbDspHelp').hidden=v.voice_mode!=='anonymous';
    const tarot=v.template==='tarot_monthly';
    const fixedTarot=tarot&&v.tarot_renderer==='remotion';
    const batch=isBatch(v);
    $('pbProductionMode').parentElement.hidden=!tarot;
    $('pbProductionMode').value=batch?'batch':'single';
    $('pbTikTokStyle').parentElement.hidden=!isTikTok(v);
    $('pbTikTokStyle').value=v.tiktok_style;
    $('pb_voice_mode').disabled=batch;
    $('pb_voice_mode').querySelectorAll('option').forEach(o=>o.disabled=batch&&o.value!=='tts');
    $('pbTarotArea').hidden=!tarot||batch;
    $('pbBatchArea').hidden=!batch;
    $('pbSingleNarration').hidden=batch;
    $('pbSingleScript').hidden=batch;
    $('pbBatchRun').hidden=!batch;
    $('generate').hidden=batch;
    $('pbBuild').parentElement.hidden=batch;
    $('pbPrompt').parentElement.hidden=batch;
    $('pbOutputMode').parentElement.hidden=batch;
    $('pbApplyOnSend').parentElement.hidden=batch;
    $('pbApplyOnSend').checked=!batch&&$('pbApplyOnSend').checked;
    $('pb_cta_enabled').parentElement.hidden=!tarot;
    $('pbTarotCtaText').parentElement.hidden=!tarot||!v.cta_enabled;
    $('pbBackgroundFile').parentElement.hidden=tarot;
    $('pbHookMode').parentElement.hidden=tarot;
    $('pbHookText').parentElement.hidden=tarot;
    for(const key of ['background_mode','stock_provider','intro_tags','body_tags']) $('pb_'+key).parentElement.hidden=tarot;
    for(const id of ['pbSearchMode','pbSearchText','pbStockMode','pbStockPercent','pbStockIndices']) $(id).parentElement.hidden=tarot;
    for(const key of ['tag_x','tag_y']) $('pb_'+key).parentElement.hidden=tarot;
    for(const key of ['caption_center_y','caption_font_size','max_width_ratio']) $('pb_'+key).parentElement.hidden=fixedTarot;
    $('pbGeneralLayoutArea').querySelector('p').textContent=fixedTarot
      ? 'Remotion版タロットの見出し・カード・本編字幕は投稿画面向けの固定配置です。フックと波形は下の項目で調整できます。ガイドは動画に入りません。'
      : '左上を原点とする動画のピクセル座標。入力値をそのままJSONへ反映します。縦書きフックは中心Yではなく上端Yを使用します。タグはportrait_brandで表示します。';
    $('pbBackgroundPreview').hidden=tarot;
    $('pb_intro_scenes').parentElement.hidden=tarot; // Tarot intro is delimited by tarot_phase.
    $('pbThemeMode').parentElement.hidden=tarot;
    $('pbThemeTitle').parentElement.hidden=tarot;
    if($('pbApplyOnSend').checked||!$('script').value.trim()) $('audioUpload').hidden=v.voice_mode==='tts';
    if(batch){$('audioUpload').hidden=true;$('pb_voice_mode').value='tts';}
    $('pbPreviewError').textContent=''; paint();
  }
  function lists() {
    options($('pbVideo'),catalog(registry,'video').map(p=>[p.id,p.name]),visiblePreset(session.video_preset));
    $('pbBackgroundFile').value=session.background;
    options($('pb_bgm_track'),[['','曲を選択'],...(bgmCatalog?.tracks||[]).map(t=>[t.id,t.title])]);
    renderFields();
  }
  const singleTarot=mountSingleEditor(invalidate);
  batchEditor=mountBatchEditor({config,status,getCatalog:()=>bgmCatalog,getLoadedRepo:()=>loadedRepo});
  for(const [key,label,items,type] of VIDEO_FIELDS) {
    const input=field($(key==='voice_mode'?'pbVoiceFields':key==='tts_custom_style'?'pbTtsCustom':key.startsWith('tts_')?'pbTtsFields':'pbVideoFields'),key,label,items,type);
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
    const input=field($('pbLayoutFields'),key,label,key==='hook_font_size_mode'?[['auto','自動調整（指定サイズが上限）'],['fixed','固定サイズ']]:null,key==='hook_band_color'?'color':'number');
    input.min=key.includes('font_size')?1:key==='visualizer_size'?16:0;
    input.max=key.includes('ratio')||key.includes('safe_')||key==='hook_margin_x'||key==='hook_band_opacity'?1:key.includes('font_size')?300:key==='visualizer_size'?2000:3840;
    input.step=Number(input.max)===1?0.01:1;
    input.addEventListener('input',()=>{session.overrides.layout[key]=input.type==='number'?Number(input.value):input.value;invalidate();paint();});
  }
  const modeSessions=new Map();
  function selectPreset(id) {
    modeSessions.set(session.video_preset,clone(session));
    if(modeSessions.has(id))session=clone(modeSessions.get(id));
    else session={...session,video_preset:id,overrides:{video:{},layout:{}},layout_preset:defaultLayout(registry,id),background:resolvePreset(registry,'video',id).background||'background.png'};
    image=null;
    // A newly selected mode must use fresh screen settings, not the previous JSON's audio mode.
    $('pbApplyOnSend').checked=true;
    invalidate();lists();
  }
  $('pbVideo').onchange=()=>selectPreset($('pbVideo').value);
  $('pbTikTokStyle').onchange=()=>selectPreset($('pbTikTokStyle').value==='legacy_vertical'?'tiktok_vertical_hook':'tiktok_standard');
  $('pbProductionMode').onchange=()=>{
    const batch=$('pbProductionMode').value==='batch';
    selectPreset(batch?'tarot_monthly_batch':'tarot_monthly_remotion');
    if(batch && config().video.voice_mode!=='tts') {
      session.overrides.video.voice_mode='tts';renderFields();
    }
  };
  $('pbBackgroundFile').onchange=()=>{session.background=$('pbBackgroundFile').value.trim();image=null;invalidate();lists();};
  for(const [id,key] of [['pbHookMode','hook'],['pbHookText','manual_hook'],['pbSearchMode','search'],['pbSearchText','search_text'],['pbStockMode','stock_scenes'],['pbStockPercent','stock_percent'],['pbStockIndices','stock_indices'],['pbThemeMode','theme'],['pbThemeTitle','theme_title']]) {
    $(id).addEventListener('input',()=>{session.ai[key]=key==='stock_percent'?Number($(id).value):$(id).value;invalidate();renderFields();});
  }
  $('script').addEventListener('input',paint);
  $('pbTranscript').addEventListener('input',invalidate);$('pbOutputMode').onchange=invalidate;
  $('pbPreviewIntro').onchange=paint;$('pbSafe').onchange=paint;
  $('pbBackgroundPreview').onclick=()=>run(async()=>{
    const file=config().background, request=++imageRequest;
    const r=await connection()(`contents/media/${file.split('/').map(encodeURIComponent).join('/')}?ref=main`);
    if(request!==imageRequest||file!==session.background)return;
    const decoded=atob(r.content.replace(/\s/g,''));
    const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes])), img=new Image();
    try {await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('背景画像をプレビューできません'));img.src=url;});if(file===session.background){image=img;paint();status('背景画像を読み込みました');}}finally{URL.revokeObjectURL(url);}
  });
  $('pbLoad').onclick=()=>run(async()=>{
    const api=connection(), expected=$('repo').value.trim();
    const {preset:r,bgm}=await loadPresetData(api);
    registry=r.registry;sha=r.sha;registryRepo=expected;bgmCatalog=bgm;loadedRepo=expected;
    invalidate();lists();status('保存済みプリセットとBGM一覧を読み込みました');
  });
  async function save(kind, overwrite=false) {
    if(registryRepo!==$('repo').value.trim())throw Error('先に「保存済み設定を読込」を押してください');
    const c=config(), id=overwrite?session.video_preset:$('pbSaveId').value.trim(), name=overwrite?resolvePreset(registry,'video',session.video_preset).name:$('pbSaveName').value.trim();
    const written=await savePresetSettings({api:connection(),registry,sha,session,config:c,id,name,kind,overwrite});
    registry=written.registry;sha=written.sha;
    if(kind==='video'){session.video_preset=id;session.overrides.video={};}else{session.layout_preset=id;session.overrides.layout={};}
    invalidate();lists();status(`${name}を保存しました。プリセット保存では動画生成を実行しません。`);
  }
  $('pbSaveVideo').onclick=()=>run(()=>save('video'));
  $('pbOverwriteVideo').onclick=()=>run(()=>save('video',true));
  $('pbBuild').onclick=()=>{try{const c=configuredInput();if(c.video.voice_mode==='tts'&&!$('pbTranscript').value.trim())throw Error('ナレーション原稿を入力してください');if(c.video.bgm_mode!=='off'&&loadedRepo!==$('repo').value.trim())throw Error('BGMを使用する場合は登録一覧を読み込んでください');$('pbPrompt').value=buildPrompt(c,$('pbTranscript').value,bgmCatalog,$('pbOutputMode').value);snapshot=clone(c);$('pbApplyOnSend').checked=true;renderFields();status('プロンプトを生成しました。AIの返答をscript.json欄へ貼り付けてください。');}catch(e){status(e.message);}};
  $('pbCopy').onclick=async()=>{try{if(!$('pbPrompt').value)throw Error('先にプロンプトを生成してください');await navigator.clipboard.writeText($('pbPrompt').value);status('コピーしました');}catch{$('pbPrompt').focus();$('pbPrompt').select();status('プロンプト欄を選択しました。iPhoneの「コピー」を使用してください。');}};
  function prepare(script) {
    if(!$('pbApplyOnSend').checked)return script;
    if(!snapshot)throw Error('画面設定を適用するには、設定変更後にプロンプトを生成してください');
    if(snapshot.video.bgm_mode!=='off'&&loadedRepo!==$('repo').value.trim())throw Error('現在のリポジトリのBGM登録一覧を読み込んでください');
    return applyConfig(script,snapshot,bgmCatalog);
  }
  $('repo').addEventListener('input',()=>{registry=emptyRegistry();sha=null;registryRepo=null;bgmCatalog=null;loadedRepo='';image=null;imageRequest++;modeSessions.clear();session={video_preset:'tiktok_standard',layout_preset:'portrait_standard',background:'background.png',overrides:{video:{},layout:{}},ai:{}};invalidate();lists();});
  lists();
  return {prepareScript:prepare, previewConfig:config, batch:{active:()=>isBatch(config().video),manifest:()=>batchEditor.manifest()}};
}





