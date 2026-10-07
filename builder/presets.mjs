// Semantic presets contain no pixel coordinates. Layouts and renderer internals
// have their own sources; anonymous is a one-field semantic override.
export const VIDEO_DEFAULTS = Object.freeze({
  format:'landscape', template:'standard', hook_enabled:false,
  hook_orientation:'vertical', intro_scenes:2, intro_caption:true,
  body_caption:true, intro_tags:false, body_tags:false,
  intro_visualizer:false, body_visualizer:false, background_mode:'stock',
  stock_provider:'pexels', bgm_mode:'off', bgm_category:'ai', bgm_track:'',
  voice_mode:'original', hook_band_enabled:false,
});
export const VIDEO_PRESETS = [
  {id:'tiktok_standard', name:'TikTok標準', default_layout:'portrait_standard', values:{
    format:'vertical', template:'portrait_brand', hook_enabled:true,
    hook_orientation:'horizontal', intro_scenes:1, intro_caption:false,
    body_tags:true, body_visualizer:true, background_mode:'mixed',
    hook_band_enabled:true,
  }},
  {id:'tiktok_anonymous', name:'TikTok匿名音声', extends:'tiktok_standard', values:{voice_mode:'anonymous'}},
  {id:'tiktok_vertical_hook', name:'TikTok縦書きフック', default_layout:'vertical_legacy', values:{
    format:'vertical', hook_enabled:true, intro_caption:false,
  }},
  {id:'youtube_landscape', name:'YouTube横型', default_layout:'landscape_standard', values:{}},
];
export const LAYOUT_DEFAULTS = Object.freeze({
  tag_x:36, tag_y:126, visualizer_x:960, visualizer_y:500,
  visualizer_size:680, visualizer_width_ratio:0.28,
  hook_center_y:540, hook_top:230, hook_margin_x:0.16,
  caption_center_y:860, hook_font_size:136, caption_font_size:72,
  max_width_ratio:0.75, hook_max_width_ratio:1, hook_band_opacity:0.58,
  safe_right:0.17, safe_bottom:0.18,
});
export const LAYOUT_PRESETS = [
  {id:'portrait_standard', name:'人物画像・標準', format:'vertical', values:{
    tag_x:100, tag_y:300, visualizer_x:800, visualizer_y:600,
    visualizer_size:320, hook_center_y:1100, caption_center_y:1100,
    hook_font_size:130, caption_font_size:72, max_width_ratio:0.78,
  }},
  {id:'vertical_legacy', name:'縦書き・従来', format:'vertical', values:{
    visualizer_x:540, visualizer_y:830, visualizer_size:980,
    hook_center_y:900, caption_center_y:1420,
    caption_font_size:64, max_width_ratio:0.84,
  }},
  {id:'landscape_standard', name:'横型・標準', format:'landscape', values:{}},
];
export const BACKGROUNDS = [
  {id:'background.png', name:'標準人物画像', file:'background.png', recommended_layout:'portrait_standard'},
  {id:'縦型本人画像.png', name:'縦型本人画像', file:'縦型本人画像.png'},
];
export const CATEGORIES = ['calm','reflective','mysterious','hopeful','serious'];
export const SYSTEM = Object.freeze({
  overlay:{portrait_brand:0.2, standard:0.35},
  anonymous:{pitch_semitones:-1.5, formant_mode:'preserved', low_gain_db:1,
    mid_gain_db:-0.5, high_gain_db:0.5, compressor_threshold_db:-18,
    compressor_ratio:2, output_gain_db:0.5},
  bgm:{volume_db:0, ducking:true, start_seconds:0, loop:false,
    fade_in_seconds:0.5, fade_out_seconds:1.5},
  visualizer:{style:'standard_bar', motion:'reactive', look:'studio', num_bars:40,
    bar_width_ratio:0.003, bar_gap_ratio:0.004, min_bar_height_ratio:0.005,
    max_bar_height_ratio:0.08, visualizer_opacity:0.95,
    visualizer_glow_strength:0.4, update_fps:20, background:'video'},
});
