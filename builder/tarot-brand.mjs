// Shared landscape coordinates for the video and its position preview.
export const TAROT_LANDSCAPE_LAYOUT = Object.freeze({
  format:"landscape",width:1920,height:1080,headerTop:54,
  cardLeft:[280,660,1040,1420],cardTop:[350],cardWidth:220,cardHeight:365,
  subtitleLeft:180,subtitleWidth:1560,subtitleCenterY:880,subtitleFontSize:54,
});
export const tarotCardPosition=(layout,i)=>({left:layout.cardLeft[layout.format==='landscape'?i:i%2],top:layout.cardTop[layout.format==='landscape'?0:Math.floor(i/2)]});
export const TAROT_BRAND_VIDEO=['intro_theme','body_theme','intro_subtitle','body_subtitle'];
export const TAROT_BRAND_LAYOUT=['theme_x','theme_y','theme_font_size','subtitle_x','subtitle_y','subtitle_font_size'];
const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(value||{},k)).map(k=>[k,value[k]]));
export function tarotBrand(config,title='月間星座タロット') {
  const saved=config.presentation?.landscape||{};
  return {video:{intro_theme:true,body_theme:true,intro_subtitle:true,body_subtitle:true,...pick(saved.video,TAROT_BRAND_VIDEO)},
    layout:{theme_x:174,theme_y:54,theme_font_size:36,subtitle_x:174,subtitle_y:130,subtitle_font_size:28,...pick(saved.layout,TAROT_BRAND_LAYOUT)},
    theme:{title:saved.theme?.title||title.replaceAll('\n',' · '),subtitle:saved.theme?.subtitle??'ハシモトの占いと思想'},
    icon:{file:'icon.png',x:54,y:54,size:90,intro:true,body:true,...saved.icon},
    scenery_visibility:pick(saved.scenery_visibility,['theme','subtitle','icon'])};
}
export function tarotBrandElements(slot,intro=false,scenery=false) {
  if(!slot)return [];
  const elements=[],v=slot.video||{},l=slot.layout||{},t=slot.theme||{},prefix=intro?'intro_':'body_';
  for(const kind of ['theme','subtitle']) {
    const text=kind==='theme'?t.title:t.subtitle;
    if(!v[prefix+kind]||!text||(scenery&&slot.scenery_visibility?.[kind]===false))continue;
    const x=l[kind+'_x'],y=l[kind+'_y'],size=l[kind+'_font_size'];
    elements.push({kind,text:text.replaceAll('[[','').replaceAll(']]',''),x,y,size,maxWidth:Math.max(1,1920-x-54),height:size*(kind==='theme'?1.75:1.6)});
  }
  if(slot.icon?.[intro?'intro':'body']&&!(scenery&&slot.scenery_visibility?.icon===false)) {
    const a=slot.icon;elements.push({kind:'icon',...a,width:a.size,height:a.size});
  }
  return elements;
}


// The vertical MBTI intro gives the type code its own prominent row. Keep the
// existing two-line title in JSON, filenames, horizontal video and later phases.
export function mbtiVerticalIntroRows(title) {
 const [date,subject]=title.split('\n');
 const match=/^([A-Z]{4})（(.+)）の運勢$/u.exec(subject||'');
 if(!date||!match)return null;
 const fit=(text,desired)=>Math.min(desired,Math.floor(864/Math.max(1,Array.from(text).reduce((n,c)=>n+(/^[ -~]$/.test(c)?.75:1.1),0))));
 return [{text:date,size:fit(date,112)},{text:`${match[1]}の運勢`,size:fit(`${match[1]}の運勢`,150)},{text:`（${match[2]}）`,size:fit(`（${match[2]}）`,112)}];
}

// Fit long type names on one line without changing narration or line breaks.
export function tarotTitleFontSize(title,format,desired=130,fit=false) {
 const limit=format==='landscape'?100:140;
 if(!fit&&format!=='landscape')return Math.min(desired,limit);
 const units=Math.max(1,...title.split('\n').map(line=>Array.from(line).reduce((n,c)=>n+(/^[ -~]$/.test(c)?.75:1.1),0)));
 return Math.min(format==='landscape'?100:desired,limit,Math.floor((format==='landscape'?1920:1080)*.74/units));
}

// Canvas and Remotion measure the same font, wrap the same lines, and use the
// same padding/border dimensions. Text frames shrink; maxWidth is only a limit.
export const TAROT_BRAND_FONT_FAMILY='"Noto Sans CJK JP", "Noto Sans CJK", sans-serif';
export const tarotBrandFont=size=>`800 ${size}px ${TAROT_BRAND_FONT_FAMILY}`;
export function layoutTarotBrandElements(elements,context) {
  const result=elements.map(e=>{
    if(e.kind==='icon')return {...e};
    context.font=tarotBrandFont(e.size);
    const border=e.kind==='theme'?2:0;
    const paddingX=Math.min(e.size*.4,e.maxWidth/4),paddingY=e.size*.25;
    const contentWidth=Math.max(1,e.maxWidth-2*(paddingX+border));
    const lines=[];
    for(const paragraph of e.text.replace(/\r\n?/g,'\n').split('\n')) {
      let line='';
      for(const character of Array.from(paragraph)) {
        if(line&&context.measureText(line+character).width>contentWidth) {lines.push(line);line='';}
        line+=character;
      }
      lines.push(line);
    }
    const lineHeight=e.size*1.25;
    const width=Math.min(e.maxWidth,Math.ceil(Math.max(0,...lines.map(line=>context.measureText(line).width))+2*(paddingX+border)));
    const height=Math.ceil(Math.max(e.height,lines.length*lineHeight+2*(paddingY+border)));
    return {...e,width,height,lines,lineHeight,paddingX,paddingY,border};
  });
  // If a long theme grows into its subtitle, keep the requested subtitle position
  // as a minimum and move it just below the theme. Other saved coordinates stay.
  const theme=result.find(e=>e.kind==='theme'),subtitle=result.find(e=>e.kind==='subtitle');
  if(theme&&subtitle&&theme.x<subtitle.x+subtitle.width&&subtitle.x<theme.x+theme.width&&subtitle.y>=theme.y&&subtitle.y<theme.y+theme.height) {
    subtitle.y=theme.y+theme.height+Math.ceil(subtitle.size*.25);
  }
  return result;
}
