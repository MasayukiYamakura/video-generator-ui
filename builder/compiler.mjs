import {SYSTEM, CATEGORIES} from './presets.mjs?v=tarot-settings-20261010';
import {clone, assertObject} from './model.mjs?v=tarot-settings-20261010';

export function fixedSettings(config) {
  const {video:v,layout:l}=config, branded=v.template==='portrait_brand';
  const g={format:v.format, overlay_opacity:SYSTEM.overlay[v.template],
    voice_mode:v.voice_mode, theme:{enabled:v.format==='landscape',title:'',
      subtitle:'ハシモトの占いと思想',icon:'icon.png',font_size:72,x:140,y:90,
      max_width_ratio:0.6,text_color:'white',highlight_color:'#FFC857',bg_color:'black',bg_opacity:0.85},
    hook:{enabled:v.hook_enabled, orientation:v.hook_orientation, scenes:v.intro_scenes,
      sides:['right','left'], visualizer:true,
      band_opacity:v.hook_band_enabled?l.hook_band_opacity:0,
      band_color:l.hook_band_color, band_width_ratio:l.hook_band_width_ratio,
      band_padding_y:l.hook_band_padding_y, font_size_mode:l.hook_font_size_mode,
      text_style:{style:'outline',font:'serif',font_weight:'black',
        font_size:l.hook_font_size,max_width_ratio:l.hook_max_width_ratio,
        max_chars:7,line_pitch:0.95,column_gap:0.18,
        position:{top:l.hook_top,margin_x:l.hook_margin_x},text_color:'white',
        highlight_color:branded?'white':'#FFC857',stroke_color:'black',stroke_width:branded?6:3,
        shadow:{opacity:0.65,blur:12,offset_x:4,offset_y:7}}},
    caption:{enabled:v.body_caption,style:v.format==='landscape'?'box':'outline',
      font:branded?'serif':'sans',font_weight:branded?'medium':'bold',font_size:l.caption_font_size,
      max_width_ratio:l.max_width_ratio,y_center:l.caption_center_y,text_color:'white',
      highlight_color:branded?'white':'#FFC857',stroke_color:'black',stroke_width:branded?4:3,
      box_color:[12,22,48],box_opacity:0.78,shadow:{opacity:0.55,blur:8,offset_x:3,offset_y:5}},
    visualizer:{...SYSTEM.visualizer,enabled:v.intro_visualizer||v.body_visualizer,
      x:l.visualizer_x,y:l.visualizer_y,size:l.visualizer_size,
      visualizer_width_ratio:l.visualizer_width_ratio},
    // brand_layout's hook coordinate is also used for explicit horizontal hooks
    // in the standard template. It is inert in old scripts.
    brand_layout:{tag_x:l.tag_x,tag_y:l.tag_y,hook_center_y:l.hook_center_y,
      caption_center_y:l.caption_center_y,hook_font_size:l.hook_font_size},
    bgm:{...SYSTEM.bgm,start_seconds:v.bgm_start_seconds,delay_seconds:v.bgm_delay_seconds,
      loop:v.bgm_loop,fade_in_seconds:v.bgm_fade_in_seconds,fade_out_seconds:v.bgm_fade_out_seconds,volume_db:v.bgm_volume_db,ducking:v.bgm_ducking,
      enabled:v.bgm_mode!=='off',selection_mode:v.bgm_mode==='track'?'track':'category'},
  };
  if(branded) g.template='portrait_brand';
  if(v.template==='tarot_monthly') g.template='tarot_monthly';
  if(v.background_mode!=='stock') g.background_image=config.background;
  // portrait_brand requires its fallback image even if all scenes use stock.
  if(branded&&!g.background_image) g.background_image=config.background;
  if(v.voice_mode==='tts') g.tts={voice:v.tts_voice,style:v.tts_style,pace:v.tts_pace,...(v.tts_custom_style?{custom_style:v.tts_custom_style}:{})};
  if(v.voice_mode==='anonymous') g.voice_processing=clone(SYSTEM.anonymous);
  if(v.bgm_mode==='track') g.bgm.track_id=v.bgm_track;
  if(v.bgm_mode==='category') g.bgm.category=v.bgm_category;
  return g;
}
export function availableCategories(bgmCatalog) {
  return CATEGORIES.filter(category=>bgmCatalog?.tracks?.some(t=>t.categories?.includes(category)));
}
export function applyConfig(script, config, bgmCatalog) {
  assertObject(script,'AI出力');
  if(!Array.isArray(script.scenes)||!script.scenes.length||script.scenes.length>1000) throw Error('空ではないscenes配列が必要です（最大1000）');
  const {video:v,ai}=config, g=fixedSettings(config);
  const aiCategory=v.bgm_mode==='ai'||(v.bgm_mode==='category'&&v.bgm_category==='ai');
  if(aiCategory) {
    const category=script.global_settings?.bgm?.category ?? script.bgm_category;
    if(!availableCategories(bgmCatalog).includes(category)) throw Error('AIが選んだBGMカテゴリが登録一覧にありません');
    g.bgm.category=category;
  }
  if(g.bgm.enabled) {
    if(!bgmCatalog?.tracks?.some(t=>g.bgm.selection_mode==='track'?t.id===g.bgm.track_id:t.categories?.includes(g.bgm.category))) throw Error('指定した登録済みBGMがありません');
  }
  if(g.theme.enabled) {
    const title=ai.theme==='manual' ? ai.theme_title : script.global_settings?.theme?.title ?? script.theme_title;
    if(typeof title!=='string'||!title.trim()) throw Error('横型動画のテーマタイトルが必要です');
    g.theme.title=title;
  }
  if(v.template==='tarot_monthly') {
    if(!config.tarot) throw Error('占い設定がありません');
    const order=['intro','overall','relationships','work','advice','summary'];
    const phases=script.scenes.map((s,i)=>{
      assertObject(s,`シーン${i+1}`);
      if(typeof s.text!=='string'||!s.text.trim()) throw Error(`シーン${i+1}の読み上げtextが必要です`);
      if(!order.includes(s.tarot_phase)) throw Error(`シーン${i+1}のtarot_phaseが不正です`);
      return s.tarot_phase;
    });
    if([...new Set(phases)].filter(x=>x!=='summary').join(',')!==order.slice(0,5).join(',') || phases.some((x,i)=>i&&order.indexOf(x)<order.indexOf(phases[i-1]))) throw Error('intro→全体運→恋愛・対人→仕事・行動→アドバイスの順に分けてください');
    let introIndex=0;
    const manualHooks=ai.manual_hook.split('\n---\n');
    const scenes=script.scenes.map(s=>{
      const intro=s.tarot_phase==='intro';
      const out={text:s.text,tarot_phase:s.tarot_phase,
        caption_enabled:intro?v.intro_caption:v.body_caption,
        visualizer:intro?v.intro_visualizer:v.body_visualizer};
      if(s.speech_text!==undefined) {if(typeof s.speech_text!=='string')throw Error('speech_textが不正です');out.speech_text=s.speech_text;}
      if(intro){
        if(v.hook_enabled){
          const hook=ai.hook==='manual'?(manualHooks[introIndex]??manualHooks[0]):s.hook_text;
          if(typeof hook!=='string'||!hook.trim())throw Error(`冒頭シーン${introIndex+1}のフック文章が必要です`);
          out.hook_text=hook;
        }
        introIndex++;
      }
      if(s.tarot_visual==='scenery') {
        if(intro)throw Error('冒頭の配札シーンには情景映像を指定できません');
        if(!['pexels','pixabay'].includes(s.media_type)||typeof s.media_query!=='string'||!s.media_query.trim())throw Error('情景にはPexels/Pixabayの検索語が必要です');
        Object.assign(out,{tarot_visual:'scenery',media_type:s.media_type,media_query:s.media_query});
      }
      return out;
    });
    return {...(v.voice_mode==='tts'?{}:{audio_file:typeof script.audio_file==='string'?script.audio_file:'新規録音.m4a'}),global_settings:g,tarot:clone(config.tarot),scenes};
  }
  const manualIndices=new Set(ai.stock_indices.split(',').filter(x=>x.trim()).map(x=>Number(x.trim())-1));
  if(ai.stock_scenes==='manual'&&[...manualIndices].some(i=>i<0||i>=script.scenes.length)) throw Error('素材シーン番号がシーン数の範囲外です');
  const manualHooks=ai.manual_hook.split('\n---\n');
  const scenes=script.scenes.map((source,index)=>{
    assertObject(source,`シーン${index+1}`);
    if(typeof source.text!=='string'||!source.text.trim()) {
      // Explicit local presenter clips remain an escape hatch for old prompts.
      if(source.media_type!=='local'||source.text!=='') throw Error(`シーン${index+1}のtextが必要です`);
    }
    if(source.speech_text!==undefined&&typeof source.speech_text!=='string') throw Error('speech_textは文字列にしてください');
    const intro=index<v.intro_scenes;
    const scene={text:source.text,caption_enabled:intro?v.intro_caption:v.body_caption,
      category_tags:intro?v.intro_tags:v.body_tags, visualizer:intro?v.intro_visualizer:v.body_visualizer};
    if(source.speech_text!==undefined) scene.speech_text=source.speech_text;
    if(v.hook_enabled&&intro&&!(source.media_type==='local'&&source.text==='')) {
      scene.hook_text=ai.hook==='manual'?(manualHooks[index]??manualHooks[0]):source.hook_text;
      if(typeof scene.hook_text!=='string'||!scene.hook_text.trim()) throw Error(`シーン${index+1}のhook_textが必要です`);
    }
    if(source.media_type==='local'&&source.text==='') {
      if(typeof source.media_query!=='string'||!source.media_query||source.media_query.includes('..')||source.media_query.startsWith('/')||source.media_query.includes('\\')) throw Error('本人映像のmedia_queryはmedia内のファイル名にしてください');
      if(!Number.isFinite(source.start_time)||!Number.isFinite(source.end_time)||source.start_time<0||source.end_time<=source.start_time) throw Error('本人映像には正しい開始・終了秒が必要です');
      Object.assign(scene,{media_type:'local',media_query:source.media_query,
        start_time:source.start_time,end_time:source.end_time,media_start:source.media_start??0,
        caption_enabled:false,visualizer:false});
      delete scene.hook_text;
    } else if(v.background_mode!=='fixed') {
      const selected=v.background_mode==='stock'||(ai.stock_scenes==='manual'?manualIndices.has(index):['pexels','pixabay'].includes(source.media_type));
      if(selected) {
        scene.media_type=v.stock_provider;
        scene.media_query=ai.search==='manual'?ai.search_text:source.media_query;
        if(typeof scene.media_query!=='string'||!scene.media_query.trim()) throw Error(`シーン${index+1}の素材検索語が必要です`);
      }
    }
    // No layout/style/time from AI: these are human-owned values. Old scripts
    // outside this opt-in compiler are sent unchanged by the existing UI.
    return scene;
  });
  return {...(v.voice_mode==='tts'?{}:{audio_file:typeof script.audio_file==='string'?script.audio_file:'新規録音.m4a'}),global_settings:g,scenes};
}


