// Staged design editor: validates and saves metadata, never compiles a script.
import {PRESENTATION_VIDEO_KEYS,mergePresentation,validatePresentation,clone} from './model.mjs?v=presentation-editor-20261019';
import {VIDEO_FIELDS,LAYOUT_LABELS} from './fields.mjs?v=landscape-theme-20261019';
import {LAYOUT_DEFAULTS,LAYOUT_PRESETS} from './presets.mjs?v=landscape-theme-20261019';
import {el,options} from './dom.mjs?v=maintenance-20261016';

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
    person:{file:config.background,x:36,y:0,width:Math.min(600,w),height:h,enabled:true},scenery_visibility:{}};
  if(!same&&format==='landscape')slot.video.hook_orientation='horizontal';
  const merged=mergePresentation({version:1,[format]:slot},config.presentation);
  return clone(merged[format]);
}

export function mountPresentationEditor({root,getConfig,getFormat,setFormat,onChange}) {
  const errors=new Map(),controls=[];
  const tabs=el('div');tabs.className='actions';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','編集する形式');
  const tabButtons=['vertical','landscape'].map(format=>{
    const b=el('button',format==='vertical'?'縦型 9:16':'横型 16:9');b.type='button';b.id='pdTab_'+format;
    b.onclick=()=>{try{assertValid();setFormat(format);render();}catch(e){message.textContent=e.message;}};
    tabs.append(b);return b;
  });
  root.append(tabs);
  const message=el('p');message.id='pdStatus';message.setAttribute('role','status');root.append(message);
  const content=el('div');root.append(content);
  function group(title,open=false) {const d=el('details'),summary=el('summary',title),grid=el('div');d.open=open;grid.className='builder-grid';d.append(summary,grid);content.append(d);return grid;}
  function add(grid,section,key,label,{items,type='text',min,max,step}={}) {
    const wrap=el('label',label),input=el(items?'select':'input');input.id=`pd_${section}_${key}`;
    if(items){options(input,items);if(section==='scenery_visibility')input.options[0].disabled=true;}else input.type=type;
    if(type==='checkbox'&&!items)wrap.className='check';
    for(const [k,v] of Object.entries({min,max,step}))if(v!==undefined)input[k]=v;
    if(type==='text'){input.autocapitalize='none';input.spellcheck=false;}
    wrap.append(input);grid.append(wrap);controls.push({input,section,key,type});
    input.addEventListener(items||type==='checkbox'?'change':'input',()=>{
      try {
        const format=getFormat(),config=getConfig(),next=clone(config.presentation||{version:1});
        next[format]??={};
        const value=type==='checkbox'?input.checked:type==='number'?input.valueAsNumber:input.value;
        if(section==='background')next[format].background=value;
        else {next[format][section]??={};
          if(section==='scenery_visibility'&&value==='inherit')throw Error('表示または非表示を選択してください');
          next[format][section][key]=section==='scenery_visibility'?value==='show':value;
        }
        validatePresentation(next);onChange(next);errors.delete(input);input.setCustomValidity('');
        message.textContent=errors.size?[...errors.values()].join(' / '):'この形式の変更を保持しました。「レイアウト調整・保存」の保存ボタンで両形式を保存します。';
      }catch(e){errors.set(input,e.message);input.setCustomValidity(e.message);message.textContent=e.message;}
    });
  }
  const videoGrid=group('表示・背景',true);
  for(const [key,label,items,type] of VIDEO_FIELDS.filter(([key])=>PRESENTATION_VIDEO_KEYS.includes(key)))
    add(videoGrid,'video',key,label,{items,type:items?'text':type||'checkbox',...(key==='intro_scenes'?{min:1,max:10,step:1}:{})});
  add(videoGrid,'background','file','media内の背景ファイル名');
  const layoutGrid=group('位置・サイズ');
  for(const [key,label] of Object.entries({...LAYOUT_LABELS,caption_center_x:'字幕 X（中心）',hook_center_x:'フック X（中心）',tag_font_size:'タグ文字サイズ',tag_scale:'タグ倍率'})) {
    const items=key==='hook_font_size_mode'?[['auto','自動調整'],['fixed','固定サイズ']]:undefined;
    const ratio=key.includes('ratio')||key.startsWith('safe_')||key==='hook_margin_x'||key==='hook_band_opacity';
    add(layoutGrid,'layout',key,label,{items,type:items?'text':key==='hook_band_color'?'color':'number',
      min:key.includes('font_size')?1:key==='visualizer_size'?16:key==='tag_scale'?0.05:0,
      max:ratio?1:key.includes('font_size')?300:key==='visualizer_size'?2000:key==='tag_scale'?5:3840,step:ratio||key==='tag_scale'?0.01:1});
  }
  const brandGrid=group('テーマ・サブタイトル・アイコン・人物');
  add(brandGrid,'theme','title','テーマ（空欄は自動／既存値を使用）');add(brandGrid,'theme','subtitle','サブタイトル');
  for(const [kind,fields] of [['icon',{file:'アイコン画像',x:'アイコン X',y:'アイコン Y',size:'アイコンサイズ',intro:'冒頭のアイコン',body:'本編のアイコン'}],
    ['person',{file:'人物画像',x:'人物 X',y:'人物 Y',width:'人物の幅',height:'人物の高さ',enabled:'人物を表示'}]]) {
    for(const [key,label] of Object.entries(fields))add(brandGrid,kind,key,label,{type:key==='file'?'text':['intro','body','enabled'].includes(key)?'checkbox':'number',min:0,step:1});
  }
  const scenery=group('外部映像中の表示');
  for(const [key,label] of Object.entries({caption:'字幕',hook:'フック',tags:'タグ',visualizer:'波形',theme:'テーマ',subtitle:'サブタイトル',icon:'アイコン'}))
    add(scenery,'scenery_visibility',key,label,{items:[['inherit','既存の動作を引き継ぐ'],['show','表示'],['hide','非表示']]});
  function assertValid(){if(errors.size)throw Error('形式別デザインの入力を修正してください：'+[...errors.values()].join(' / '));}
  function render() {
    // Invalid text stays visible until corrected; save/mode changes are blocked.
    if(errors.size)return;
    let format,slot;
    try{format=getFormat();slot=designDefaults(getConfig(),format);}catch(e){message.textContent=e.message;return;}
    for(const [i,b] of tabButtons.entries())b.setAttribute('aria-pressed',String(format===['vertical','landscape'][i]));
    for(const {input,section,key,type} of controls){
      let value=section==='background'?slot.background:slot[section]?.[key];
      if(section==='scenery_visibility')value=value===undefined?'inherit':value?'show':'hide';
      if(type==='checkbox')input.checked=Boolean(value);else input.value=value??'';
    }
    message.textContent=`${format==='vertical'?'縦型':'横型'}の保存用デザインを編集中。動画・プレビューへの適用は準備中です。`;
  }
  function reset(){errors.clear();for(const {input} of controls)input.setCustomValidity('');render();}
  return {render,assertValid,reset};
}
