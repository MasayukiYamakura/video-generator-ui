import {VIDEO_DEFAULTS, VIDEO_PRESETS, COMPAT_VIDEO_PRESETS, LAYOUT_DEFAULTS, LAYOUT_PRESETS, BACKGROUNDS, CATEGORIES} from './presets.mjs?v=mbti-20261019';

export const emptyRegistry = () => ({version:1, video_presets:[], layout_presets:[], backgrounds:[], favorites:[]});
export const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value && typeof value==='object' && !Array.isArray(value);
const own = (value,key) => Object.hasOwn(value,key);
const forbidden = new Set(['__proto__','constructor','prototype']);
export function assertObject(value, label) { if(!object(value)) throw Error(`${label}はオブジェクトにしてください`); }
export function validateValues(values, kind) {
  assertObject(values, kind);
  const defaults=kind==='video' ? VIDEO_DEFAULTS : LAYOUT_DEFAULTS;
  for(const [key,value] of Object.entries(values)) {
    if(forbidden.has(key)||!own(defaults,key)) throw Error(`未対応の${kind}設定: ${key}`);
    if(typeof value!==typeof defaults[key] || (typeof value==='number' && !Number.isFinite(value))) throw Error(`${key}の型が不正です`);
  }
  if(kind==='video') {
    const enums={tarot_subject:['zodiac','mbti'],tarot_mode:['single','batch'],tiktok_style:['standard','legacy_vertical'],output_mode:['vertical_only','vertical_horizontal','horizontal_only'],format:['vertical','landscape'], template:['standard','portrait_brand','tarot_monthly'], tarot_renderer:['classic','remotion'],
      hook_orientation:['horizontal','vertical'], voice_mode:['original','anonymous','tts'], tts_voice:['hashimoto','male_a','male_b'], tts_style:['natural','calm','gentle','bright','serious','powerful'], tts_pace:['slow','normal','fast'],
      background_mode:['fixed','mixed','stock'], stock_provider:['pexels','pixabay'],
      bgm_mode:['off','ai','category','track'], bgm_category:['ai',...CATEGORIES]};
    for(const [key,options] of Object.entries(enums)) if(own(values,key)&&!options.includes(values[key])) throw Error(`${key}の値が不正です`);
    if(own(values,'tts_custom_style')&&values.tts_custom_style.length>500) throw Error('カスタム話し方は500文字以内です');
    if(own(values,'intro_scenes')&&(!Number.isInteger(values.intro_scenes)||values.intro_scenes<1||values.intro_scenes>10)) throw Error('冒頭シーン数は1〜10です');
    if(own(values,'bgm_track')&&!/^[\w-]*$/.test(values.bgm_track)) throw Error('BGM曲IDが不正です');
    if(own(values,'bgm_volume_db')&&(values.bgm_volume_db < -30 || values.bgm_volume_db > 24)) throw Error('BGM音量は-30〜+24 dBです');
    for(const key of ['bgm_start_seconds','bgm_delay_seconds','bgm_fade_in_seconds','bgm_fade_out_seconds']) if(own(values,key)&&(values[key]<0||values[key]>(key.includes('fade')?30:86400))) throw Error(`${key}が範囲外です`);
  } else {
    for(const [key,value] of Object.entries(values)) {
      if(key==='hook_band_color') {if(!/^#[0-9a-fA-F]{6}$/.test(value)) throw Error('帯の色は#RRGGBBです');continue;}
      if(key==='hook_font_size_mode') {if(!['auto','fixed'].includes(value)) throw Error('文字サイズ方式が不正です');continue;}
      let range=[0,3840];
      if(key==='hook_band_padding_y') range=[0,300];
      if(key.includes('ratio')) range=[0.05,1];
       if(['safe_top','safe_right','safe_bottom','hook_margin_x'].includes(key)) range=[0,0.45];
      if(key==='hook_band_opacity') range=[0,1];
      if(key.includes('font_size')) range=[1,300];
      if(key==='visualizer_size') range=[16,2000];
      if(value<range[0]||value>range[1]) throw Error(`${key}は${range[0]}〜${range[1]}です`);
    }
  }
  return values;
}
// Optional, versioned storage contract. Rendering/preview activation belongs to
// the next PRs; absent values never manufacture or replace legacy defaults.
export const PRESENTATION_VIDEO_KEYS = Object.freeze([
  'hook_enabled','hook_orientation','intro_scenes','intro_caption','body_caption',
  'intro_tags','body_tags','intro_visualizer','body_visualizer',
  'intro_theme','body_theme','intro_subtitle','body_subtitle',
  'background_mode','stock_provider','hook_band_enabled',
]);
const PRESENTATION_ELEMENTS = ['caption','hook','tags','visualizer','theme','subtitle','icon'];
function knownKeys(value, allowed, label) {
  assertObject(value,label);
  for(const key of Object.keys(value)) if(forbidden.has(key)||!allowed.includes(key)) throw Error(`未対応の${label}: ${key}`);
}
function numberIn(value, min, max, label) {
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max) throw Error(`${label}は${min}〜${max}の数値です`);
}
export function validatePresentation(value) {
  knownKeys(value,['version','vertical','landscape'],'形式別設定');
  if(value.version!==1) throw Error('未対応の形式別設定バージョンです');
  for(const format of ['vertical','landscape']) {
    if(!own(value,format)) continue;
    const slot=value[format],w=format==='vertical'?1080:1920,h=format==='vertical'?1920:1080;
    knownKeys(slot,['video','layout','background','icon','person','theme','scenery_visibility'],'形式別表示');
    if(own(slot,'video')) {
      knownKeys(slot.video,[...PRESENTATION_VIDEO_KEYS],'形式別video');
      validateValues(slot.video,'video');
    }
    if(own(slot,'layout')) {
      const extra=['caption_center_x','hook_center_x','tag_font_size','tag_scale'];
      knownKeys(slot.layout,[...Object.keys(LAYOUT_DEFAULTS),...extra],'形式別layout');
      validateValues(Object.fromEntries(Object.entries(slot.layout).filter(([k])=>!extra.includes(k))),'layout');
      for(const [k,v] of Object.entries(slot.layout)) {
        if(k.endsWith('_x'))numberIn(v,0,w,k);
        if(k.endsWith('_y')||k==='hook_top')numberIn(v,0,h,k);
        if(k==='hook_center_y')numberIn(v,1,h-1,k);
        if(k==='tag_font_size')numberIn(v,1,300,k);
        if(k==='tag_scale')numberIn(v,0.05,5,k);
      }
    }
    if(own(slot,'background'))validateBackground(slot.background);
    for(const kind of ['icon','person']) {
      if(!own(slot,kind))continue;
      const asset=slot[kind];
      knownKeys(asset,kind==='icon'?['file','x','y','size','intro','body']:['file','x','y','width','height','enabled'],kind);
      if(own(asset,'file'))validateBackground(asset.file);
      for(const key of ['x','y','size','width','height']) if(own(asset,key)) {
        const max=key==='x'||key==='width'?w:key==='y'||key==='height'?h:Math.min(w,h);
        numberIn(asset[key],['x','y'].includes(key)?0:1,max,`${kind}.${key}`);
      }
      for(const key of ['intro','body','enabled'])if(own(asset,key)&&typeof asset[key]!=='boolean')throw Error(`${kind}.${key}は真偽値です`);
    }
    if(own(slot,'theme')) {
      knownKeys(slot.theme,['title','subtitle'],'形式別theme');
      for(const text of Object.values(slot.theme))if(typeof text!=='string'||text.length>500)throw Error('形式別themeは500文字以内の文字列です');
    }
    if(own(slot,'scenery_visibility')) {
      knownKeys(slot.scenery_visibility,PRESENTATION_ELEMENTS,'外部映像中の表示');
      for(const flag of Object.values(slot.scenery_visibility))if(typeof flag!=='boolean')throw Error('外部映像中の表示は真偽値です');
    }
  }
  return value;
}
export function mergePresentation(parent, override) {
  if(parent===undefined&&override===undefined)return undefined;
  if(parent!==undefined)validatePresentation(parent);
  if(override!==undefined)validatePresentation(override);
  const result={version:1};
  for(const format of ['vertical','landscape']) {
    const a=parent?.[format],b=override?.[format];
    if(a===undefined&&b===undefined)continue;
    const slot={...(a||{}),...(b||{})};
    for(const key of ['video','layout','icon','person','theme','scenery_visibility']) {
      if(a?.[key]!==undefined||b?.[key]!==undefined)slot[key]={...(a?.[key]||{}),...(b?.[key]||{})};
    }
    result[format]=slot;
  }
  validatePresentation(result);
  return clone(result);
}

function entries(registry, kind) {
 const saved=registry[`${kind}_presets`];
 const list=[...(kind==='video'?[...VIDEO_PRESETS,...COMPAT_VIDEO_PRESETS]:LAYOUT_PRESETS).filter(p=>!saved.some(q=>q.id===p.id)),...saved];
 if(kind!=='video')return list;
 return list.map(p=>p.id==='tarot_monthly_batch'?{...p,values:{tarot_mode:'batch',...p.values}}:
  p.id==='tiktok_vertical_hook'?{...p,values:{tiktok_style:'legacy_vertical',...p.values}}:p);
}
export function resolvePreset(registry, kind, id, seen=new Set()) {
  const entry=entries(registry,kind).find(p=>p.id===id);
  if(!entry) throw Error(`プリセットが見つかりません: ${id}`);
  if(seen.has(id)) throw Error('プリセットの継承が循環しています');
  seen.add(id);
  const parent=entry.extends ? resolvePreset(registry,kind,entry.extends,seen) : {};
  const presentation=mergePresentation(parent.presentation,entry.presentation);
  return {...parent,...entry,...(presentation===undefined?{}:{presentation}),layout:{...(parent.layout||{}),...(entry.layout||{})},values:{...(parent.values||{}),...entry.values}};
}
export function validateRegistry(registry) {
  assertObject(registry,'プリセット一覧');
  if(registry.version!==1) throw Error('未対応のプリセット一覧バージョンです');
  for(const kind of ['video','layout']) {
    const list=registry[`${kind}_presets`];
    if(!Array.isArray(list)||list.length>200) throw Error('プリセット一覧が不正です');
    const ids=new Set((kind==='video'?[]:LAYOUT_PRESETS).map(p=>p.id));
    for(const p of list) {
      assertObject(p,'プリセット');
      if(typeof p.id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(p.id)||ids.has(p.id)) throw Error('プリセットIDの重複・形式を確認してください');
      if(typeof p.name!=='string'||!p.name.trim()||p.name.length>100) throw Error('プリセット名が不正です');
      if(p.extends!==undefined&&typeof p.extends!=='string') throw Error('継承元が不正です');
      if(kind==='layout'&&!['vertical','landscape'].includes(p.format)) throw Error('レイアウトの画面形式が必要です');
      validateValues(p.values,kind);
      if(kind==='video'){if(p.layout!==undefined)validateValues(p.layout,'layout');if(p.background!==undefined)validateBackground(p.background);if(p.presentation!==undefined)validatePresentation(p.presentation);}
      else if(p.presentation!==undefined)throw Error('形式別設定は動画プリセットに保存してください');
      ids.add(p.id);
    }
    for(const p of list) {
      const resolved=resolvePreset(registry,kind,p.id);
      if(kind==='video'&&resolved.default_layout) resolvePreset(registry,'layout',resolved.default_layout);
      if(kind==='layout'&&p.extends&&resolvePreset(registry,kind,p.extends).format!==p.format) throw Error('異なる画面形式のレイアウトは継承できません');
    }
  }
  if(!Array.isArray(registry.backgrounds)||!Array.isArray(registry.favorites)) throw Error('backgrounds/favoritesは配列にしてください');
  const ids=new Set(BACKGROUNDS.map(b=>b.id));
  for(const b of registry.backgrounds) {
    if(!object(b)||typeof b.id!=='string'||!b.id||ids.has(b.id)||typeof b.name!=='string') throw Error('背景画像の登録が不正です');
    validateBackground(b.file); ids.add(b.id);
    if(b.recommended_layout) resolvePreset(registry,'layout',b.recommended_layout);
  }
  return registry;
}
export function validateBackground(file) {
  if(typeof file!=='string'||!file||file.length>200||file.includes('..')||/[\\\x00-\x1f]/.test(file)||file.startsWith('/')||!(/\.(png|jpe?g|webp)$/i.test(file))) throw Error('背景画像はmedia内のPNG/JPEG/WebPファイル名にしてください');
}
export function catalog(registry,kind) {
  const list=kind==='background' ? [...BACKGROUNDS,...registry.backgrounds] : entries(registry,kind);
  return kind==='video'?list.filter(p=>!COMPAT_VIDEO_PRESETS.some(old=>old.id===p.id)||(p.id==='youtube_landscape'&&registry.video_presets.some(q=>q.id===p.id))).map(p=>p.id==='tarot_monthly_remotion'?{...p,name:'月間星座タロット'}:p.id==='tiktok_standard'?{...p,name:'思想語り'}:p.id==='youtube_landscape'?{...p,name:'思想語り（保存済み横型互換）'}:p):list;
}
export function defaultLayout(registry,id) {
  const p=resolvePreset(registry,'video',id), v={...VIDEO_DEFAULTS,...p.values};
  return p.default_layout || (v.format==='vertical'?(v.template==='portrait_brand'?'portrait_standard':'vertical_legacy'):'landscape_standard');
}
export function resolveConfig(registry, session) {
  validateRegistry(registry);
  const video=resolvePreset(registry,'video',session.video_preset);
  const layout=resolvePreset(registry,'layout',session.layout_preset || defaultLayout(registry,session.video_preset));
  const ov=session.overrides || {};
  validateValues(ov.video || {},'video'); validateValues(ov.layout || {},'layout');
  const v={...VIDEO_DEFAULTS,...video.values,...ov.video};
  const l={...LAYOUT_DEFAULTS,...layout.values,...video.layout,...ov.layout};
  if(layout.format!==v.format) throw Error('動画とレイアウトの縦横が一致していません');
  if(v.template==='portrait_brand'&&v.format!=='vertical') throw Error('portrait_brandは縦型専用です');
  if(v.template==='tarot_monthly'&&v.format!=='vertical') throw Error('月間星座タロットは縦型専用です');
  if(v.tarot_subject==='mbti'&&(v.template!=='tarot_monthly'||v.tarot_renderer!=='remotion'))throw Error('MBTIタロットはRemotion専用です');
  if(v.tarot_renderer==='remotion'&&v.template!=='tarot_monthly') throw Error('Remotion版は月間星座タロット専用です');
  if(v.template==='portrait_brand'&&l.caption_font_size<72) throw Error('portrait_brandの字幕サイズは既存描画に合わせ72以上にしてください');
  if(v.template!=='portrait_brand'&&v.format!=='landscape'&&(v.intro_tags||v.body_tags)) throw Error('カテゴリタグはportrait_brandまたは横型専用です');
  if(v.background_mode==='mixed'&&v.template!=='portrait_brand'&&!(v.template==='standard'&&v.format==='landscape')) throw Error('一部動画＋背景画像はTikTok標準またはYouTube横型で選択してください');
  if(v.bgm_mode==='category'&&!CATEGORIES.includes(v.bgm_category)) throw Error('手動BGMカテゴリを選択してください');
  if(v.bgm_mode==='track'&&!v.bgm_track) throw Error('手動BGM曲を選択してください');
  const w=v.format==='vertical'?1080:1920, h=v.format==='vertical'?1920:1080;
  for(const k of ['tag_x','visualizer_x','theme_x','subtitle_x']) if(l[k]>w) throw Error(`${k}が画面の外です`);
  for(const k of ['tag_y','visualizer_y','caption_center_y','hook_top','theme_y','subtitle_y']) if(l[k]>h) throw Error(`${k}が画面の外です`);
  if(l.hook_center_y<=0||l.hook_center_y>=h) throw Error('フック中心は画面内に配置してください');
  const background=session.background || video.background || 'background.png';
  if(v.background_mode!=='stock'||v.template==='portrait_brand') validateBackground(background);
  const ai={hook:'ai', search:'ai', search_text:'', manual_hook:'', stock_scenes:'ai', stock_percent:10, stock_indices:'', theme:'ai', ...(session.ai||{})};
  if(!Number.isInteger(ai.stock_percent)||ai.stock_percent<0||ai.stock_percent>100) throw Error('AI自動の動画シーン割合は0〜100%の整数です');
  for(const k of ['hook','search','stock_scenes','theme']) if(!['ai','manual'].includes(ai[k])) throw Error(`AI設定 ${k} が不正です`);
  for(const k of ['manual_hook','search_text','stock_indices']) if(typeof ai[k]!=='string') throw Error(`${k}は文字列にしてください`);
  if((v.format==='landscape'||['vertical_horizontal','horizontal_only'].includes(v.output_mode))&&ai.theme==='manual'&&(typeof ai.theme_title!=='string'||!ai.theme_title.trim())) throw Error('手動テーマタイトルを入力してください');
  if(v.template!=='tarot_monthly'&&v.hook_enabled&&ai.hook==='manual'&&!ai.manual_hook.trim()) throw Error('手動フック文章を入力してください');
  if(v.background_mode!=='fixed'&&ai.search==='manual'&&!ai.search_text.trim()) throw Error('手動の英語検索語を入力してください');
  if(ai.stock_scenes==='manual'&&ai.stock_indices.trim()&&!/^\d+(\s*,\s*\d+)*$/.test(ai.stock_indices.trim())) throw Error('素材シーンは1から始まる番号をカンマで指定してください');
  const presentation=mergePresentation(video.presentation,session.presentation);
  return {video:v, layout:l, ai, background, width:w, height:h,...(presentation===undefined?{}:{presentation})};
}
export function savePreset(registry, kind, entry, overwrite=false) {
  const next=clone(registry), key=`${kind}_presets`;
  if(!['video','layout'].includes(kind)) throw Error('保存の種類が不正です');
  const existing=next[key].findIndex(p=>p.id===entry.id);
  const found=entries(registry,kind).some(p=>p.id===entry.id);
  if(overwrite&&(!found||kind!=='video')) throw Error('上書き対象の動画プリセットが見つかりません');
  if(!overwrite&&found) throw Error('同じIDが存在します。新しいIDで保存してください');
  if(existing>=0) next[key][existing]=clone(entry); else next[key].push(clone(entry));
  return validateRegistry(next);
}





// Remove retired selectable presets without breaking custom descendants or losing their settings.
export function migrateRegistry(registry) {
  validateRegistry(registry);
  const next=clone(registry), retired=new Set(['tiktok_anonymous','tarot_monthly']);
  next.video_presets=next.video_presets.filter(p=>!retired.has(p.id)).map(p=>{
    let ancestor=p, depends=false;
    while(ancestor.extends) {
      if(retired.has(ancestor.extends)){depends=true;break;}
      ancestor=entries(registry,'video').find(q=>q.id===ancestor.extends);
    }
    if(depends){const resolved=resolvePreset(registry,'video',p.id);delete resolved.extends;return resolved;}
    return p.id==='tarot_monthly_remotion'?{...p,name:'月間星座タロット'}:p;
  });
  if(next.video_presets.some(p=>p.id==='youtube_landscape')) {
    const old=resolveConfig(next,{video_preset:'youtube_landscape'});
    const inherited={version:1,landscape:{video:Object.fromEntries(PRESENTATION_VIDEO_KEYS.map(k=>[k,old.video[k]])),layout:clone(old.layout),background:old.background}};
    const target=next.video_presets.find(p=>p.id==='tiktok_standard');
    if(target)target.presentation=mergePresentation(inherited,target.presentation);
  }
  return validateRegistry(next);
}


