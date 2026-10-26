// Shared deterministic contract. Offsets count Unicode code points, never UTF-16 units.
export const ANIMATIONS=['fade','slide','pop','bounce','typewriter','highlight','punch','stagger'];
export const SPRINGS={soft:{damping:24,stiffness:80,mass:1,overshootClamping:true},smooth:{damping:24,stiffness:160,mass:1,overshootClamping:true},bounce:{damping:12,stiffness:170,mass:1},energetic:{damping:9,stiffness:210,mass:.8},quick:{damping:25,stiffness:280,mass:.7,overshootClamping:true}};
export const graphemes=text=>Array.from(new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(text),x=>x.segment);
export function splitUnits(text,unit='phrase') {
  const clean=String(text).replace(/\[\[|\]\]/g,'');
  let parts=unit==='sentence'?[clean]:unit==='character'?graphemes(clean):Array.from(new Intl.Segmenter('ja',{granularity:'word'}).segment(clean),x=>x.segment);
  if(unit==='phrase') {
    const merged=[];
    for(const part of parts){const last=merged.at(-1);if(last&&(/^[\p{Script=Hiragana}ー]+$/u.test(part)||/^[、。，！？!?）」』】\s]+$/u.test(part)))merged[merged.length-1]+=part;else merged.push(part);}
    parts=merged;
  }
  let start=0;return parts.filter(Boolean).map((text,i)=>{const out={id:`u${String(i).padStart(4,'0')}`,text,start,end:start+Array.from(text).length};start=out.end;return out;});
}
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export function effectStyle(animation,progress,{scale=1.15,direction='up',springValue,visible=true}={}) {
  const p=clamp(progress),s=springValue??(1-Math.pow(1-p,3));
  if(!visible)return {opacity:0,transform:'none'};
  if(animation==='slide'){const d=(1-p)*24,xy={up:[0,d],down:[0,-d],left:[d,0],right:[-d,0]}[direction]||[0,d];return {opacity:p,transform:`translate(${xy[0]}px,${xy[1]}px)`};}
  if(animation==='pop'||animation==='bounce')return {opacity:clamp(p*3),transform:`scale(${.85+.15*(animation==='bounce'?s:1-Math.pow(1-p,3))})`};
  if(animation==='punch')return {opacity:1,transform:`scale(${1+(scale-1)*Math.sin(p*Math.PI)})`};
  return {opacity:animation==='fade'?p:1,transform:'none'};
}
export function pageRanges(pages,text) {
  const chars=Array.from(text.replace(/\[\[|\]\]/g,''));let cursor=0;
  return pages.map(page=>({...page,lines:page.lines.map(line=>{const spans=[];for(const ch of Array.from(line)){while(cursor<chars.length&&chars[cursor]!==ch)cursor++;spans.push(cursor++);}return {text:line,start:spans[0]??cursor,end:(spans.at(-1)??cursor-1)+1};})}));
}
export function effectiveAnimation(unit,settings){return unit.emphasis?unit.animation||settings.caption.emphasis_animation:settings.caption.default_animation;}
