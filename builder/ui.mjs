import {VIDEO_DEFAULTS, LAYOUT_DEFAULTS} from './presets.mjs';
import {emptyRegistry,catalog,clone,resolvePreset,resolveConfig,savePreset,defaultLayout} from './model.mjs';
import {buildPrompt} from './prompt.mjs';
import {applyConfig} from './compiler.mjs';
import {readRegistry,writeRegistry,decodeContent} from './storage.mjs';
import {drawPreview} from './preview.mjs';

const $=id=>document.getElementById(id);
const VIDEO_FIELDS=[
  ['voice_mode','音声',[['original','元音声'],['anonymous','匿名音声']]],
  ['bgm_mode','BGM',[['off','OFF'],['ai','ON・AIカテゴリ選択'],['category','ON・カテゴリ指定'],['track','ON・曲指定']]],
  ['bgm_category','BGMカテゴリ',[['ai','AI自動'],['calm','安心感'],['reflective','内省'],['mysterious','神秘'],['hopeful','前向き'],['serious','注意喚起']]],
  ['bgm_track','登録済みBGM曲',[['','保存済み設定を読み込んで選択']]],
  ['bgm_volume_db','BGM音量（標準からの増減 dB・-30〜+6）',null,'number'],
  ['bgm_ducking','発話中にBGM音量を下げる（ダッキング）'],
  ['hook_enabled','フック表示'],
  ['hook_orientation','フック方向',[['horizontal','横書き'],['vertical','縦書き']]],
  ['intro_scenes','冒頭シーン数',null,'number'],
  ['intro_caption','冒頭の通常字幕'],['body_caption','本編の通常字幕'],
  ['intro_tags','冒頭のタグ'],['body_tags','本編のタグ'],
  ['intro_visualizer','冒頭の波形'],['body_visualizer','本編の波形'],
  ['background_mode','背景素材',[['fixed','固定画像のみ'],['mixed','人物画像＋一部動画'],['stock','全編AI動画素材']]],
  ['stock_provider','動画素材提供元',[['pexels','Pexels'],['pixabay','Pixabay']]],
  ['hook_band_enabled','横書きフックの黒帯'],
];
const LAYOUT_LABELS={tag_x:'タグ X（左端）',tag_y:'タグ Y（上端）',
  visualizer_x:'波形 X（中心）',visualizer_y:'波形 Y（中心）',visualizer_size:'波形 size（キャンバス）',
  visualizer_width_ratio:'バー波形の表示幅比率',hook_center_y:'横書きフック Y（中心）',
  hook_top:'縦書きフック Y（上端）',hook_margin_x:'縦書きフック左右余白比率',
  caption_center_y:'字幕 Y（中心）',hook_font_size:'フック最大文字サイズ',caption_font_size:'字幕文字サイズ',
  max_width_ratio:'字幕最大幅比率',hook_max_width_ratio:'横書きフック最大幅比率',
  hook_band_opacity:'黒帯の不透明度',safe_right:'右ガイド比率',safe_bottom:'下ガイド比率'};
function el(tag,text) {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
function options(select,items,current) {select.replaceChildren();for(const [value,label] of items){const o=el('option',label);o.value=value;select.append(o);}if(current!==undefined)select.value=current;}
function field(root,key,label,items,type='checkbox') {
  const wrapper=el('label',label), input=el(items?'select':'input');input.id='pb_'+key;
  if(items) options(input,items);else input.type=type;
  if(type==='checkbox'&&!items)wrapper.className='check';
  wrapper.append(input);root.append(wrapper);return input;
}
export function mountBuilder(apiProvider) {
  let registry=emptyRegistry(), sha=null, registryRepo=null, bgmCatalog=null, image=null, imageRequest=0;
  let session={video_preset:'tiktok_standard',layout_preset:'portrait_standard',background:'background.png',overrides:{video:{},layout:{}},ai:{}};
  let snapshot=null, loadedRepo='', working=false;
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
  async function run(action) {if(working)return;working=true;for(const id of ['pbLoad','pbSaveVideo','pbSaveLayout','pbBackgroundPreview'])$(id).disabled=true;try{await action();}catch(e){status(e.message);}finally{working=false;for(const id of ['pbLoad','pbSaveVideo','pbSaveLayout','pbBackgroundPreview'])$(id).disabled=false;}}
  function config() {return resolveConfig(registry,session);}
  function invalidate() {snapshot=null;$('pbPrompt').value='';status('設定が変わりました。プロンプトを生成し直してください。');}
  function paint() {
    try {const c=config();drawPreview($('pbCanvas'),c,image,$('pbPreviewIntro').checked,$('pbSafe').checked);$('pbPreviewError').textContent='';}
    catch(e){$('pbPreviewError').textContent=e.message;}
  }
  function renderFields() {
    const p=resolvePreset(registry,'video',session.video_preset), v={...VIDEO_DEFAULTS,...p.values,...session.overrides.video};
    const lp=resolvePreset(registry,'layout',session.layout_preset), l={...LAYOUT_DEFAULTS,...lp.values,...session.overrides.layout};
    for(const [key] of VIDEO_FIELDS) {const input=$('pb_'+key);if(typeof v[key]==='boolean')input.checked=v[key];else input.value=v[key];}
    for(const key of Object.keys(LAYOUT_DEFAULTS)) $('pb_'+key).value=l[key];
    $('pb_bgm_category').disabled=v.bgm_mode!=='category';$('pb_bgm_track').disabled=v.bgm_mode!=='track';
    $('pb_bgm_volume_db').disabled=v.bgm_mode==='off';$('pb_bgm_ducking').disabled=v.bgm_mode==='off';
    for(const key of ['intro_tags','body_tags']) $('pb_'+key).disabled=v.template!=='portrait_brand';
    $('pb_hook_orientation').disabled=!v.hook_enabled;$('pb_hook_band_enabled').disabled=v.hook_orientation!=='horizontal';
    $('pbBackground').disabled=v.background_mode==='stock';$('pbBackgroundFile').disabled=v.background_mode==='stock';
    $('pbHookText').disabled=$('pbHookMode').value!=='manual'||!v.hook_enabled;
    $('pbSearchText').disabled=$('pbSearchMode').value!=='manual'||v.background_mode==='fixed';
    $('pbStockIndices').disabled=$('pbStockMode').value!=='manual'||v.background_mode!=='mixed';
    $('pbThemeTitle').disabled=$('pbThemeMode').value!=='manual'||v.format!=='landscape';
    paint();
  }
  function lists() {
    options($('pbVideo'),catalog(registry,'video').map(p=>[p.id,p.name]),session.video_preset);
    const v=resolvePreset(registry,'video',session.video_preset), format={...VIDEO_DEFAULTS,...v.values,...session.overrides.video}.format;
    options($('pbLayout'),catalog(registry,'layout').filter(p=>p.format===format).map(p=>[p.id,p.name]),session.layout_preset);
    options($('pbBackground'),[...catalog(registry,'background').map(p=>[p.file,p.name]),['custom','ファイル名を指定']],session.background);
    if(!$('pbBackground').value)$('pbBackground').value='custom';
    $('pbBackgroundFile').value=session.background;
    options($('pb_bgm_track'),[['','曲を選択'],...(bgmCatalog?.tracks||[]).map(t=>[t.id,t.title])]);
    renderFields();
  }
  for(const [key,label,items,type] of VIDEO_FIELDS) {
    const input=field($('pbVideoFields'),key,label,items,type);
    if(key==='intro_scenes'){input.min=1;input.max=10;input.step=1;}
    if(key==='bgm_volume_db'){input.min=-30;input.max=6;input.step=1;}
    input.addEventListener('change',()=>{session.overrides.video[key]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;invalidate();renderFields();});
  }
  for(const [key,label] of Object.entries(LAYOUT_LABELS)) {
    const input=field($('pbLayoutFields'),key,label,null,'number');
    input.min=key.includes('font_size')?1:key==='visualizer_size'?16:0;
    input.max=key.includes('ratio')||key.includes('safe_')||key==='hook_margin_x'||key==='hook_band_opacity'?1:key.includes('font_size')?300:key==='visualizer_size'?2000:3840;
    input.step=Number(input.max)===1?0.01:1;
    input.addEventListener('input',()=>{session.overrides.layout[key]=Number(input.value);invalidate();paint();});
  }
  $('pbVideo').onchange=()=>{
    session.video_preset=$('pbVideo').value;session.overrides={video:{},layout:{}};
    session.layout_preset=defaultLayout(registry,session.video_preset);
    invalidate();lists();
  };
  $('pbLayout').onchange=()=>{session.layout_preset=$('pbLayout').value;session.overrides.layout={};invalidate();renderFields();};
  $('pbReset').onclick=()=>{session.overrides={video:{},layout:{}};invalidate();renderFields();};
  $('pbBackground').onchange=()=>{
    if($('pbBackground').value!=='custom')session.background=$('pbBackground').value;
    const recommendation=catalog(registry,'background').find(b=>b.file===session.background)?.recommended_layout;
    $('pbRecommendation').textContent=recommendation?`推奨レイアウト: ${resolvePreset(registry,'layout',recommendation).name}（変更は「推奨を適用」）`:'';
    image=null;invalidate();lists();
  };
  $('pbUseRecommendation').onclick=()=>{const id=catalog(registry,'background').find(b=>b.file===session.background)?.recommended_layout;if(id){const p=resolvePreset(registry,'layout',id);const v=resolvePreset(registry,'video',session.video_preset);if(p.format!==({...VIDEO_DEFAULTS,...v.values}).format)return status('推奨レイアウトの縦横が一致しません');session.layout_preset=id;session.overrides.layout={};invalidate();lists();}};
  $('pbBackgroundFile').onchange=()=>{session.background=$('pbBackgroundFile').value.trim();image=null;invalidate();lists();};
  for(const [id,key] of [['pbHookMode','hook'],['pbHookText','manual_hook'],['pbSearchMode','search'],['pbSearchText','search_text'],['pbStockMode','stock_scenes'],['pbStockIndices','stock_indices'],['pbThemeMode','theme'],['pbThemeTitle','theme_title']]) {
    $(id).addEventListener('input',()=>{session.ai[key]=$(id).value;invalidate();renderFields();});
  }
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
    const r=await readRegistry(api), bgm=decodeContent(await api('contents/media/bgm/catalog.json?ref=main'));
    if(bgm.version!==1||!Array.isArray(bgm.tracks))throw Error('BGM登録一覧が不正です');
    registry=r.registry;sha=r.sha;registryRepo=expected;bgmCatalog=bgm;loadedRepo=expected;
    invalidate();lists();status('保存済みプリセットとBGM一覧を読み込みました');
  });
  async function save(kind) {
    if(registryRepo!==$('repo').value.trim())throw Error('先に「保存済み設定を読込」を押してください');
    const c=config(), id=$('pbSaveId').value.trim(), name=$('pbSaveName').value.trim();
    const parent=resolvePreset(registry,kind,kind==='video'?session.video_preset:session.layout_preset);
    const values=kind==='video'?c.video:c.layout, defaults=kind==='video'?VIDEO_DEFAULTS:LAYOUT_DEFAULTS;
    const base={...defaults,...parent.values}, delta=Object.fromEntries(Object.entries(values).filter(([k,value])=>value!==base[k]));
    const entry={id,name,extends:parent.id,values:delta,...(kind==='layout'?{format:c.video.format}:{})};
    const next=savePreset(registry,kind,entry), written=await writeRegistry(connection(),next,sha);
    registry=written.registry;sha=written.sha;
    if(kind==='video'){session.video_preset=id;session.overrides.video={};}else{session.layout_preset=id;session.overrides.layout={};}
    lists();status(`${name}を保存しました。プリセット保存では動画生成を実行しません。`);
  }
  $('pbSaveVideo').onclick=()=>run(()=>save('video'));$('pbSaveLayout').onclick=()=>run(()=>save('layout'));
  $('pbBuild').onclick=()=>{try{const c=config();if(c.video.bgm_mode!=='off'&&loadedRepo!==$('repo').value.trim())throw Error('BGMを使用する場合は登録一覧を読み込んでください');$('pbPrompt').value=buildPrompt(c,$('pbTranscript').value,bgmCatalog,$('pbOutputMode').value);snapshot=clone(c);$('pbApplyOnSend').checked=true;status('プロンプトを生成しました。AIの返答をscript.json欄へ貼り付けてください。');}catch(e){status(e.message);}};
  $('pbCopy').onclick=async()=>{try{if(!$('pbPrompt').value)throw Error('先にプロンプトを生成してください');await navigator.clipboard.writeText($('pbPrompt').value);status('コピーしました');}catch{$('pbPrompt').focus();$('pbPrompt').select();status('プロンプト欄を選択しました。iPhoneの「コピー」を使用してください。');}};
  function prepare(script) {
    if(!$('pbApplyOnSend').checked)return script;
    if(!snapshot)throw Error('画面設定を適用するには、設定変更後にプロンプトを生成してください');
    if(snapshot.video.bgm_mode!=='off'&&loadedRepo!==$('repo').value.trim())throw Error('現在のリポジトリのBGM登録一覧を読み込んでください');
    return applyConfig(script,snapshot,bgmCatalog);
  }
  $('pbApply').onclick=()=>{try{if(!$('pbApplyOnSend').checked)throw Error('「送信時に画面設定を適用」を有効にしてください');const result=prepare(JSON.parse($('script').value));$('script').value=JSON.stringify(result,null,2);$('script').dispatchEvent(new Event('input'));status('画面の確定設定をJSONへ適用しました。内容を確認して動画生成できます。');}catch(e){status(e.message);}};
  $('repo').addEventListener('input',()=>{registry=emptyRegistry();sha=null;registryRepo=null;bgmCatalog=null;loadedRepo='';image=null;imageRequest++;session={video_preset:'tiktok_standard',layout_preset:'portrait_standard',background:'background.png',overrides:{video:{},layout:{}},ai:{}};invalidate();lists();});
  lists();
  return {prepareScript:prepare};
}
