// Pure visual contract shared by the browser preview and Remotion renderer.
export const VISUAL_FIELDS = [
  ['background_theme','背景の色合い',[['midnight_blue','ミッドナイトブルー'],['deep_purple','ディープパープル'],['dark_green','ダークグリーン']]],
  ['shuffle_variant','通常のシャッフル',[['a','A：現行'],['b','B：オーバーハンド'],['c','C：テーブルミックス']]],
  ['cut_variant','レボリューションカット',[['a','A：現行'],['b','B：3束の公転'],['c','C：縦の入れ替え']]],
  ['spread_variant','円形スプレッド',[['a','A：現行'],['b','B：二重リング'],['c','C：らせん展開']]],
  ['card_back_design','カード裏面',[['celestial','A：現行・星の紋章'],['geometric','B：幾何学模様'],['botanical','C：植物の装飾']]],
];
export const DEFAULT_VISUAL = {background_theme:'deep_purple',shuffle_variant:'a',cut_variant:'a',spread_variant:'a',card_back_design:'celestial'};
export const PALETTES = {
  midnight_blue:['#263e5b','#15283e','#081321'],
  deep_purple:['#383447','#202031','#0d1322'],
  dark_green:['#29483e','#182f29','#091b18'],
};
export const BACK_ART = {
  celestial:'<path d="M110 12L210 175L110 338L10 175Z M110 36L185 175L110 314L35 175Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="110" cy="175" r="54" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="110" cy="175" r="36" fill="none" stroke="currentColor"/><path d="M110 107L119 162L174 175L119 188L110 243L101 188L46 175L101 162Z" fill="#b99660"/><path d="M110 48V93 M110 257V302 M24 175H60 M160 175H196" stroke="currentColor" stroke-width="2"/><circle cx="110" cy="175" r="10" fill="#171c2f" stroke="currentColor" stroke-width="2"/>',
  geometric:'<g fill="none" stroke="currentColor" stroke-width="3"><path d="M20 30H200V320H20Z M35 45H185V305H35Z M110 60L190 175L110 290L30 175Z M110 100L165 175L110 250L55 175Z M20 30L200 320 M200 30L20 320"/><circle cx="110" cy="175" r="25"/></g>',
  botanical:'<g fill="none" stroke="currentColor" stroke-width="3"><path d="M110 35V315 M110 70Q25 35 55 110Q105 130 110 70 M110 70Q195 35 165 110Q115 130 110 70 M110 150Q15 100 50 185Q100 200 110 150 M110 150Q205 100 170 185Q120 200 110 150 M110 235Q20 200 55 275Q105 295 110 235 M110 235Q200 200 165 275Q115 295 110 235"/><circle cx="110" cy="175" r="140" transform="translate(0 70) scale(1 .6)"/></g>',
};
export function normalizeVisual(value) {
  if(value===undefined)return {...DEFAULT_VISUAL};
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('映像設定visualはオブジェクトにしてください');
  const out={...DEFAULT_VISUAL};
  for(const [key,label,choices] of VISUAL_FIELDS) {
    if(value[key]!==undefined&&!choices.some(([id])=>id===value[key]))throw Error(`${label}の指定が不正です`);
    if(value[key]!==undefined)out[key]=value[key];
  }
  return out;
}
// Progress values are supplied by the renderer so the existing timing/easing stays intact.
export function motionPose(i,local,shuffle,cut,spread,gather,visual) {
  const v=normalizeVisual(visual),side=i%2===0?-1:1,wave=Math.sin(local*12+i*.65);
  let sx=430+side*(95+55*wave)*shuffle,sy=1140-i*2.4+shuffle*(32*Math.sin(local*13+i*.48)-28),sa=side*(8+9*wave)*shuffle;
  if(v.shuffle_variant==='b') {
    const packet=Math.floor(i/4),p=(Math.sin(local*8+packet*2)+1)/2;
    sx=430+shuffle*(packet-1)*145;sy=1140-i*2.4-shuffle*p*(100+packet*45);sa=shuffle*(packet-1)*9;
  } else if(v.shuffle_variant==='c') {
    sx=430+shuffle*(210*Math.cos(i*2.4+local*3));sy=1140-i*2.4+shuffle*125*Math.sin(i*1.7-local*4);sa=shuffle*35*Math.sin(i+local*4);
  }
  const orbit=Math.PI*cut;
  let cx=430+side*175*Math.cos(orbit)+35*Math.sin(orbit*2+i*.16),cy=1110+side*110*Math.sin(orbit)-i*2.4,ca=side*16+side*155*cut;
  if(v.cut_variant==='b') {
    const p=Math.floor(i/4)*Math.PI*2/3+orbit*2;
    cx=430+190*Math.cos(p);cy=1090+155*Math.sin(p)-(i%4)*3;ca=p*180/Math.PI+90;
  } else if(v.cut_variant==='c') {
    cx=430+side*95*Math.sin(orbit);cy=1110+side*210*Math.cos(orbit)-i*2.4;ca=side*180*cut;
  }
  const radial=i/12*Math.PI*2-Math.PI/2;
  let px=430+280*Math.cos(radial),py=1040+240*Math.sin(radial),pa=radial*180/Math.PI+90;
  if(v.spread_variant==='b') {
    const p=(i%6)/6*Math.PI*2+(i<6?0:Math.PI/6)-Math.PI/2,r=i<6?165:320;
    px=430+r*Math.cos(p);py=1040+r*.85*Math.sin(p);pa=p*180/Math.PI+90;
  } else if(v.spread_variant==='c') {
    const p=i*.77-Math.PI/2,r=90+i*23;
    px=430+r*Math.cos(p);py=1040+r*.8*Math.sin(p);pa=p*180/Math.PI+90;
  }
  const mix=(a,b,p)=>a+(b-a)*p;
  return {x:mix(mix(mix(sx,cx,cut),px,spread),430,gather),y:mix(mix(mix(sy,cy,cut),py,spread),1140-i*2.4,gather),angle:mix(mix(mix(sa,ca,cut),pa,spread),0,gather)};
}
export function randomVisuals(signs, random=Math.random) {
  for(let attempt=0;attempt<100;attempt++) {
    const result=Object.fromEntries(signs.map(sign=>[sign,{}]));
    for(const [key,,choices] of VISUAL_FIELDS) {
      const values=signs.map((_,i)=>choices[i%choices.length][0]);
      for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}
      signs.forEach((sign,i)=>result[sign][key]=values[i]);
    }
    if(new Set(Object.values(result).map(x=>JSON.stringify(x))).size===signs.length)return result;
  }
  throw Error('映像設定のランダム割当を作り直してください');
}

// Rebuilding the same direct-AI request must keep its resume hash and allocation.
export function stableVisuals(signs, seed) {
  let state=2166136261;
  for(const char of seed){state^=char.codePointAt(0);state=Math.imul(state,16777619);}
  return randomVisuals(signs,()=>{
    let t=state+=0x6D2B79F5;
    t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  });
}
