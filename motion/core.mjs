// Shared deterministic contract. Offsets count Unicode code points, never UTF-16 units.
export const ANIMATIONS=['fade','slide','pop','bounce','typewriter','highlight','punch','stagger'];
export const SPRINGS={soft:{damping:24,stiffness:80,mass:1,overshootClamping:true},smooth:{damping:24,stiffness:160,mass:1,overshootClamping:true},bounce:{damping:12,stiffness:170,mass:1},energetic:{damping:9,stiffness:210,mass:.8},quick:{damping:25,stiffness:280,mass:.7,overshootClamping:true}};
export const graphemes=text=>Array.from(new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(text),x=>x.segment);
// Display boundaries also drive timing units, so compounds never split at a page edge.
export const CAPTION_TERMS=['正位置','逆位置','ソード','ワンド','ペンタクル','カップ',
  'ましょう','でしょう','ください','ません','ようです','付き合えない','付き合えていない','付き合いたい','付き合う','付き合','付合','イメージ'];
export function japaneseUnits(text,protectedTerms=[]) {
 const segmenter=new Intl.Segmenter('ja',{granularity:'word'}),units=[];
 for(const paragraph of String(text).split('\n')) {
  const ranges=[];
  for(const term of [...CAPTION_TERMS,...protectedTerms].filter(Boolean))
   for(let at=paragraph.indexOf(term);at>=0;at=paragraph.indexOf(term,at+term.length))ranges.push([at,at+term.length]);
  let first=true;
  for(const part of segmenter.segment(paragraph)) {
   const previous=units.at(-1),word=part.segment;
   const protectedBoundary=ranges.some(([a,b])=>part.index>a&&part.index<b);
   const suffix=/^(?:は|が|を|に|で|と|も|へ|の|や|か|ね|よ|から|まで|より|ので|です|ます|ない|たい|た|て|な|う|れ|いる|れる|られる|する|した|いう|いく|ください|ましょう|でしょう|ようです)$/u.test(word)&&!/[。！？、，.!?,]$/.test(previous?.text||'');
   const closing=/^[、。，．！？!?.,)）」』】〉》〕］｝…・\s]+$/u.test(word);
   const opening=/[(（「『【〈《〔［｛・]$/.test(previous?.text||'');
   if(!first&&previous&&(protectedBoundary||suffix||closing||opening))previous.text+=word;
   else units.push({text:word,breakBefore:first&&units.length>0});
   first=false;
  }
 }
 return units;
}
export function splitUnits(text,unit='phrase') {
 const clean=String(text).replace(/\[\[|\]\]/g,'');
 const parts=unit==='sentence'?[clean]:unit==='character'?graphemes(clean):japaneseUnits(clean).map(u=>u.text);
 // Preserve whitespace/newline offsets exactly, including explicit paragraph breaks.
 let cursor=0;return parts.filter(Boolean).map((text,i)=>{
  const chars=Array.from(clean),needle=Array.from(text);
  while(cursor<chars.length&&chars.slice(cursor,cursor+needle.length).join('')!==text)cursor++;
  const out={id:`u${String(i).padStart(4,'0')}`,text,start:cursor,end:cursor+needle.length};cursor=out.end;return out;
 });
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
