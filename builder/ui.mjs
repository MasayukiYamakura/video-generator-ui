import {VIDEO_DEFAULTS, LAYOUT_DEFAULTS} from './presets.mjs?v=tarot-settings-20261010';
import {emptyRegistry,catalog,clone,resolvePreset,resolveConfig,savePreset,defaultLayout} from './model.mjs?v=tarot-settings-20261010';
import {buildPrompt} from './prompt.mjs?v=tarot-settings-20261010';
import {applyConfig} from './compiler.mjs?v=tarot-settings-20261010';
import {readRegistry,writeRegistry,decodeContent} from './storage.mjs?v=tarot-settings-20261010';
import {drawPreview} from './preview.mjs?v=tarot-settings-20261010';
import {TAROT_CARDS} from './tarot-cards.mjs';

const TAROT_SIGNS=[['aries','牡羊座'],['taurus','牡牛座'],['gemini','双子座'],['cancer','蟹座'],['leo','獅子座'],['virgo','乙女座'],['libra','天秤座'],['scorpio','蠍座'],['sagittarius','射手座'],['capricorn','山羊座'],['aquarius','水瓶座'],['pisces','魚座']];
const TAROT_POSITIONS=[['overall','① 全体運'],['relationships','② 恋愛・対人'],['work','③ 仕事・行動'],['advice','④ アドバイス']];

const $=id=>document.getElementById(id);
const VIDEO_FIELDS=[
  ['voice_mode','音声方式',[['original','録音音声'],['anonymous','匿名加工音声'],['tts','AI読み上げ']]],
  ['tts_voice','声',[['hashimoto','ハシモト本人（Voice IDの登録が必要）'],['male_a','男性A'],['male_b','男性B']]],
  ['tts_style','話し方',[['natural','自然'],['calm','落ち着いた'],['gentle','優しい'],['bright','明るい'],['serious','真剣'],['powerful','力強い']]],
  ['tts_pace','話す速さ',[['slow','ゆっくり'],['normal','標準'],['fast','やや速い']]],
  ['tts_custom_style','カスタム話し方（500文字以内）',null,'text'],
  ['bgm_mode','BGM',[['off','OFF'],['ai','原稿に合うカテゴリをAIが提案'],['category','雰囲気で選ぶ'],['track','曲を直接選ぶ']]],
  ['bgm_category','BGMカテゴリ',[['ai','AI自動'],['calm','安心感'],['reflective','内省'],['mysterious','神秘'],['hopeful','前向き'],['serious','注意喚起']]],
  ['bgm_track','登録済みBGM曲',[['','保存済み設定を読み込んで選択']]],
  ['bgm_volume_db','BGM音量（標準からの増減 dB・-30〜+24）',null,'number'],
  ['bgm_ducking','発話中にBGM音量を下げる（ダッキング）'],
  ['bgm_start_seconds','曲のどこから使うか（秒）',null,'number'],
  ['bgm_delay_seconds','動画の何秒目から流すか（秒）',null,'number'],
  ['bgm_loop','曲が終わったら繰り返す'],
  ['bgm_fade_in_seconds','BGMフェードイン（秒）',null,'number'],
  ['bgm_fade_out_seconds','BGMフェードアウト（秒）',null,'number'],
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
  hook_band_color:'帯の色',hook_band_width_ratio:'帯の横幅比率',hook_band_padding_y:'帯の上下余白（px）',hook_font_size_mode:'文字サイズ方式',hook_band_opacity:'帯の不透明度',safe_right:'右ガイド比率',safe_bottom:'下ガイド比率'};
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
  async function run(action) {if(working)return;working=true;for(const id of ['pbLoad','pbSaveVideo','pbOverwriteVideo','pbBackgroundPreview'])$(id).disabled=true;try{await action();}catch(e){status(e.message);}finally{working=false;for(const id of ['pbLoad','pbSaveVideo','pbOverwriteVideo','pbBackgroundPreview'])$(id).disabled=false;}}
  function tarotData() {
    const year=Number($('pbTarotYear').value),month=Number($('pbTarotMonth').value),zodiac=$('pbTarotZodiac').value;
    if(!Number.isInteger(year)||year<2000||year>2100)throw Error('占う年は2000〜2100で入力してください');
    if(!Number.isInteger(month)||month<1||month>12)throw Error('占う月を選択してください');
    if(!TAROT_SIGNS.some(([id])=>id===zodiac))throw Error('星座を選択してください');
    const cards=TAROT_POSITIONS.map(([position],i)=>({position,card_id:$(`pbTarotCard${i}`).value,reading:$(`pbTarotReading${i}`).value.trim()}));
    if(cards.some(c=>!TAROT_CARDS.some(x=>x.id===c.card_id)))throw Error('4枚のカードを選択してください');
    if(new Set(cards.map(c=>c.card_id)).size!==4)throw Error('同じカードを複数回選べません');
    if(cards.some(c=>!c.reading||c.reading.length>500))throw Error('4枚それぞれの解釈を1〜500文字で入力してください');
    return {year,month,zodiac,cards};
  }
  function config() {return resolveConfig(registry,session);}
  function configuredInput() {const c=config();if(c.video.template==='tarot_monthly')c.tarot=tarotData();return c;}
  function invalidate() {snapshot=null;$('pbPrompt').value='';status('設定が変わりました。プロンプトを生成し直してください。');}
  function paint() {
    try {const c=config();let title='';try{const script=JSON.parse($('script').value);title=script.scenes?.[0]?.hook_text||script.scenes?.[0]?.text||'';}catch{}
      if(c.ai.hook==='manual')title=c.ai.manual_hook.split('\n---\n')[0];
      drawPreview($('pbCanvas'),c,image,$('pbPreviewIntro').checked,$('pbSafe').checked,title);$('pbPreviewError').textContent='';}
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
    $('pbTarotArea').hidden=!tarot;
    $('pbBackgroundFile').parentElement.hidden=tarot;
    for(const key of ['background_mode','stock_provider','intro_tags','body_tags']) $('pb_'+key).parentElement.hidden=tarot;
    for(const id of ['pbSearchMode','pbSearchText','pbStockMode','pbStockPercent','pbStockIndices']) $(id).parentElement.hidden=tarot;
    for(const key of ['tag_x','tag_y']) $('pb_'+key).parentElement.hidden=tarot;
    $('pbBackgroundPreview').hidden=tarot;
    $('pb_intro_scenes').parentElement.hidden=tarot; // Tarot intro is delimited by tarot_phase.
    $('pbThemeMode').parentElement.hidden=tarot;
    $('pbThemeTitle').parentElement.hidden=tarot;
    if($('pbApplyOnSend').checked||!$('script').value.trim()) $('audioUpload').hidden=v.voice_mode==='tts';
    $('pbPreviewError').textContent=''; paint();
  }
  function lists() {
    options($('pbVideo'),catalog(registry,'video').map(p=>[p.id,p.name]),session.video_preset);
    $('pbBackgroundFile').value=session.background;
    options($('pb_bgm_track'),[['','曲を選択'],...(bgmCatalog?.tracks||[]).map(t=>[t.id,t.title])]);
    renderFields();
  }
  options($('pbTarotMonth'),Array.from({length:12},(_,i)=>[String(i+1),`${i+1}月`]),String(new Date().getMonth()+1));
  options($('pbTarotZodiac'),TAROT_SIGNS,'sagittarius');
  $('pbTarotYear').value=new Date().getFullYear();
  for(const [i,[position,label]] of TAROT_POSITIONS.entries()) {
    const box=el('div');box.className='tarot-card-input';
    const title=el('h4',label), card=el('select'), reading=el('textarea');
    card.id=`pbTarotCard${i}`;reading.id=`pbTarotReading${i}`;reading.rows=3;reading.maxLength=500;reading.placeholder='この位置でのカードの解釈（500文字以内）';
    options(card,[['','カードを選択'],...TAROT_CARDS.map(x=>[x.id,x.name])]);
    const cardLabel=el('label','引いたカード'),readingLabel=el('label','解釈');cardLabel.append(card);readingLabel.append(reading);
    box.append(title,cardLabel,readingLabel);$('pbTarotCards').append(box);
    card.addEventListener('change',invalidate);reading.addEventListener('input',invalidate);
  }
  for(const id of ['pbTarotYear','pbTarotMonth','pbTarotZodiac'])$(id).addEventListener('change',invalidate);
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
  $('pbVideo').onchange=()=>{
    session.video_preset=$('pbVideo').value;session.overrides={video:{},layout:{}};
    session.layout_preset=defaultLayout(registry,session.video_preset);
    session.background=resolvePreset(registry,'video',session.video_preset).background||'background.png';image=null;
    invalidate();lists();
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
    const r=await readRegistry(api), bgm=decodeContent(await api('contents/media/bgm/catalog.json?ref=main'));
    if(bgm.version!==1||!Array.isArray(bgm.tracks))throw Error('BGM登録一覧が不正です');
    registry=r.registry;sha=r.sha;registryRepo=expected;bgmCatalog=bgm;loadedRepo=expected;
    invalidate();lists();status('保存済みプリセットとBGM一覧を読み込みました');
  });
  async function save(kind, overwrite=false) {
    if(registryRepo!==$('repo').value.trim())throw Error('先に「保存済み設定を読込」を押してください');
    const c=config(), id=overwrite?session.video_preset:$('pbSaveId').value.trim(), name=overwrite?resolvePreset(registry,'video',session.video_preset).name:$('pbSaveName').value.trim();
    const parent=resolvePreset(registry,kind,kind==='video'?session.video_preset:session.layout_preset);
    const values=kind==='video'?c.video:c.layout, defaults=kind==='video'?VIDEO_DEFAULTS:LAYOUT_DEFAULTS;
    const base={...defaults,...parent.values}, delta=Object.fromEntries(Object.entries(values).filter(([k,value])=>value!==base[k]));
    const entry={id,name,...(overwrite?{}:{extends:parent.id}),values:overwrite?clone(values):delta,default_layout:session.layout_preset,layout:clone(c.layout),background:c.background};
    const next=savePreset(registry,kind,entry,overwrite), written=await writeRegistry(connection(),next,sha);
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
  $('repo').addEventListener('input',()=>{registry=emptyRegistry();sha=null;registryRepo=null;bgmCatalog=null;loadedRepo='';image=null;imageRequest++;session={video_preset:'tiktok_standard',layout_preset:'portrait_standard',background:'background.png',overrides:{video:{},layout:{}},ai:{}};invalidate();lists();});
  lists();
  return {prepareScript:prepare, previewConfig:config};
}




