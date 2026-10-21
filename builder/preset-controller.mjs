import {VIDEO_DEFAULTS,LAYOUT_DEFAULTS} from './presets.mjs?v=mbti-20261019';
import {clone,resolvePreset,savePreset,mergePresentation} from './model.mjs?v=settings-20261021';
import {readRegistry,writeRegistry,decodeContent} from './storage.mjs?v=mbti-20261019';
export async function loadPresetData(api) {
  const preset=await readRegistry(api),bgm=decodeContent(await api('contents/media/bgm/catalog.json?ref=main'));
  if(bgm.version!==1||!Array.isArray(bgm.tracks))throw Error('BGM登録一覧が不正です');
  return {preset,bgm};
}
export async function savePresetSettings({api,registry,sha,session,config:c,id,name,kind='video',overwrite=false}) {
  const parent=resolvePreset(registry,kind,kind==='video'?session.video_preset:session.layout_preset);
  const values=kind==='video'?c.video:c.layout,defaults=kind==='video'?VIDEO_DEFAULTS:LAYOUT_DEFAULTS;
  const base={...defaults,...parent.values},delta=Object.fromEntries(Object.entries(values).filter(([k,value])=>value!==base[k]));
  const entry={id,name,...(overwrite?{}:{extends:parent.id}),values:overwrite?clone(values):delta,default_layout:session.layout_preset,layout:clone(c.layout),background:c.background};
  if(kind==='video') {
    const presentation=mergePresentation(parent.presentation,c.presentation);
    if(presentation!==undefined)entry.presentation=presentation;
  }
  const next=savePreset(registry,kind,entry,overwrite);
  return writeRegistry(api,next,sha);
}



