// Horizontal tarot header only. Cards, captions, timing and vertical layout stay fixed.
export const TAROT_BRAND_VIDEO=['intro_theme','body_theme','intro_subtitle','body_subtitle'];
export const TAROT_BRAND_LAYOUT=['theme_x','theme_y','theme_font_size','subtitle_x','subtitle_y','subtitle_font_size'];
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(value||{},k)).map(k=>[k,value[k]]));
export function tarotBrand(config,title='月間星座タロット') {
  const saved=config.presentation?.landscape||{};
  return {video:{intro_theme:true,body_theme:true,intro_subtitle:true,body_subtitle:true,...pick(saved.video,TAROT_BRAND_VIDEO)},
    layout:{theme_x:920,theme_y:54,theme_font_size:36,subtitle_x:920,subtitle_y:130,subtitle_font_size:28,...pick(saved.layout,TAROT_BRAND_LAYOUT)},
    theme:{title:saved.theme?.title||title.replaceAll('\n',' · '),subtitle:saved.theme?.subtitle??'ハシモトの占いと思想'},
    icon:{file:'icon.png',x:800,y:54,size:90,intro:false,body:false,...saved.icon},
    scenery_visibility:pick(saved.scenery_visibility,['theme','subtitle','icon'])};
}
export function tarotBrandElements(slot,intro=false,scenery=false) {
  if(!slot)return [];
  const elements=[],v=slot.video||{},l=slot.layout||{},t=slot.theme||{},prefix=intro?'intro_':'body_';
  for(const kind of ['theme','subtitle']) {
    const text=kind==='theme'?t.title:t.subtitle;
    if(!v[prefix+kind]||!text||(scenery&&slot.scenery_visibility?.[kind]===false))continue;
    const x=l[kind+'_x'],y=l[kind+'_y'],size=l[kind+'_font_size'];
    elements.push({kind,text:text.replaceAll('[[','').replaceAll(']]',''),x,y,size,width:Math.max(1,1920-x-54),height:size*(kind==='theme'?1.75:1.6)});
  }
  if(slot.icon?.[intro?'intro':'body']&&!(scenery&&slot.scenery_visibility?.icon===false)) {
    const a=slot.icon;elements.push({kind:'icon',...a,width:a.size,height:a.size});
  }
  return elements;
}
