import {PRESENTATION_VIDEO_KEYS,mergePresentation,clone} from './model.mjs?v=tarot-brand-20261019';
import {LAYOUT_DEFAULTS,LAYOUT_PRESETS} from './presets.mjs?v=tarot-brand-20261019';

export function designDefaults(config,format) {
  const w=format==='vertical'?1080:1920,h=format==='vertical'?1920:1080;
  const same=format===config.video.format;
  const layout=same?{...config.layout}:{...LAYOUT_DEFAULTS,...LAYOUT_PRESETS.find(p=>p.id===(format==='vertical'?'portrait_standard':'landscape_standard')).values};
  if(!same&&format==='landscape')Object.assign(layout,{hook_center_y:250,caption_center_y:690,tag_x:710,tag_y:55,
    visualizer_x:1320,visualizer_y:900,visualizer_size:500,hook_font_size:config.video.template==='portrait_brand'?62:72,
    caption_font_size:52,max_width_ratio:config.video.template==='portrait_brand'?0.52:0.84});
  const slot={video:Object.fromEntries(PRESENTATION_VIDEO_KEYS.map(k=>[k,config.video[k]])),layout:{...layout,
    caption_center_x:Math.round(w*(format==='landscape'&&config.video.template==='portrait_brand'?0.68:0.5)),
    hook_center_x:Math.round(w*(format==='landscape'&&config.video.template==='portrait_brand'?0.68:0.5)),tag_font_size:40,tag_scale:1},
    background:config.background,theme:{title:config.ai.theme_title||'',subtitle:'ハシモトの占いと思想'},
    icon:{file:'icon.png',x:40,y:60,size:90,intro:false,body:false},
    person:{file:config.background,x:36,y:0,width:Math.min(600,w),height:h,enabled:false},scenery_visibility:{}};
  if(format==='vertical')for(const k of ['intro_theme','body_theme','intro_subtitle','body_subtitle'])slot.video[k]=false;
  if(!same&&format==='landscape')slot.video.hook_orientation='horizontal';
  const merged=mergePresentation({version:1,[format]:slot},config.presentation);
  return clone(merged[format]);
}

export function formatConfig(config,format) {
  const slot=designDefaults(config,format),video={...config.video,...slot.video,format};
  // The established landscape design uses the standard box-caption renderer.
  if(format==='landscape'&&video.template==='portrait_brand')video.template='standard';
  return {...config,presentation:undefined,video,layout:slot.layout,background:slot.background,
    width:format==='vertical'?1080:1920,height:format==='vertical'?1920:1080,
    ai:{...config.ai,...(slot.theme.title?{theme:'manual',theme_title:slot.theme.title}:{})},
    design:slot};
}
export function requestedFormats(config) {
  if(config.video.format==='landscape')return ['landscape'];
  return config.video.output_mode==='vertical_horizontal'?['vertical','landscape']:config.video.output_mode==='horizontal_only'?['landscape']:['vertical'];
}
export function promptConfig(config) {
  if(config.video.template==='tarot_monthly')return config;
  const views=requestedFormats(config).map(f=>formatConfig(config,f));
  const background_mode=views.some(c=>c.video.background_mode==='stock')?'stock':views.some(c=>c.video.background_mode==='mixed')?'mixed':'fixed';
  return {...config,video:{...config.video,background_mode,hook_enabled:views.some(c=>c.video.hook_enabled),
    intro_scenes:Math.max(...views.map(c=>c.video.intro_scenes))}};
}
