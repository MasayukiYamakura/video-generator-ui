import {VIDEO_DEFAULTS, VIDEO_PRESETS, LAYOUT_DEFAULTS, LAYOUT_PRESETS, BACKGROUNDS, CATEGORIES} from './presets.mjs?v=tarot-safe-layout-20261011';

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
    const enums={format:['vertical','landscape'], template:['standard','portrait_brand','tarot_monthly'], tarot_renderer:['classic','remotion'],
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
function entries(registry, kind) { const saved=registry[`${kind}_presets`]; return [...(kind==='video' ? VIDEO_PRESETS : LAYOUT_PRESETS).filter(p=>!saved.some(q=>q.id===p.id)), ...saved]; }
export function resolvePreset(registry, kind, id, seen=new Set()) {
  const entry=entries(registry,kind).find(p=>p.id===id);
  if(!entry) throw Error(`プリセットが見つかりません: ${id}`);
  if(seen.has(id)) throw Error('プリセットの継承が循環しています');
  seen.add(id);
  const parent=entry.extends ? resolvePreset(registry,kind,entry.extends,seen) : {};
  return {...parent,...entry,layout:{...(parent.layout||{}),...(entry.layout||{})},values:{...(parent.values||{}),...entry.values}};
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
      if(kind==='video'){if(p.layout!==undefined)validateValues(p.layout,'layout');if(p.background!==undefined)validateBackground(p.background);}
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
export function catalog(registry,kind) { return kind==='background' ? [...BACKGROUNDS,...registry.backgrounds] : entries(registry,kind); }
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
  if(v.tarot_renderer==='remotion'&&v.template!=='tarot_monthly') throw Error('Remotion版は月間星座タロット専用です');
  if(v.template==='portrait_brand'&&l.caption_font_size<72) throw Error('portrait_brandの字幕サイズは既存描画に合わせ72以上にしてください');
  if(v.template!=='portrait_brand'&&(v.intro_tags||v.body_tags)) throw Error('カテゴリタグはportrait_brand専用です');
  if(v.background_mode==='mixed'&&v.template!=='portrait_brand') throw Error('一部動画＋人物画像はportrait_brandで選択してください');
  if(v.bgm_mode==='category'&&!CATEGORIES.includes(v.bgm_category)) throw Error('手動BGMカテゴリを選択してください');
  if(v.bgm_mode==='track'&&!v.bgm_track) throw Error('手動BGM曲を選択してください');
  const w=v.format==='vertical'?1080:1920, h=v.format==='vertical'?1920:1080;
  for(const k of ['tag_x','visualizer_x']) if(l[k]>w) throw Error(`${k}が画面の外です`);
  for(const k of ['tag_y','visualizer_y','caption_center_y','hook_top']) if(l[k]>h) throw Error(`${k}が画面の外です`);
  if(l.hook_center_y<=0||l.hook_center_y>=h) throw Error('フック中心は画面内に配置してください');
  const background=session.background || video.background || 'background.png';
  if(v.background_mode!=='stock'||v.template==='portrait_brand') validateBackground(background);
  const ai={hook:'ai', search:'ai', search_text:'', manual_hook:'', stock_scenes:'ai', stock_percent:10, stock_indices:'', theme:'ai', ...(session.ai||{})};
  if(!Number.isInteger(ai.stock_percent)||ai.stock_percent<0||ai.stock_percent>100) throw Error('AI自動の動画シーン割合は0〜100%の整数です');
  for(const k of ['hook','search','stock_scenes','theme']) if(!['ai','manual'].includes(ai[k])) throw Error(`AI設定 ${k} が不正です`);
  for(const k of ['manual_hook','search_text','stock_indices']) if(typeof ai[k]!=='string') throw Error(`${k}は文字列にしてください`);
  if(v.format==='landscape'&&ai.theme==='manual'&&(typeof ai.theme_title!=='string'||!ai.theme_title.trim())) throw Error('手動テーマタイトルを入力してください');
  if(v.hook_enabled&&ai.hook==='manual'&&!ai.manual_hook.trim()) throw Error('手動フック文章を入力してください');
  if(v.background_mode!=='fixed'&&ai.search==='manual'&&!ai.search_text.trim()) throw Error('手動の英語検索語を入力してください');
  if(ai.stock_scenes==='manual'&&ai.stock_indices.trim()&&!/^\d+(\s*,\s*\d+)*$/.test(ai.stock_indices.trim())) throw Error('素材シーンは1から始まる番号をカンマで指定してください');
  return {video:v, layout:l, ai, background, width:w, height:h};
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




