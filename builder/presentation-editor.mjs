// One editor per format. Legacy common settings remain read-only fallbacks.
import {PRESENTATION_VIDEO_KEYS,validatePresentation,clone} from './model.mjs?v=stock-plan-20261021';
import {VIDEO_FIELDS,LAYOUT_LABELS} from './fields.mjs?v=stock-plan-20261021';
import {designDefaults} from './presentation.mjs?v=stock-plan-20261021';
import {tarotBrand,TAROT_BRAND_VIDEO,TAROT_BRAND_LAYOUT} from './tarot-brand.mjs?v=tarot-display-20261021';
export {designDefaults} from './presentation.mjs?v=stock-plan-20261021';
import {el,options} from './dom.mjs?v=maintenance-20261016';

export function mountPresentationEditor({root,guideRoot,getConfig,getFormat,setFormat,onChange,onInvalid}) {
  const errors=new Map(),controls=[],groups=[],themeModes=new Map();
  const tabs=el('div');tabs.className='actions';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','編集する形式');
  const tabButtons=['vertical','landscape'].map(format=>{
    const b=el('button',format==='vertical'?'縦型 9:16':'横型 16:9');b.type='button';b.id='pdTab_'+format;
    b.onclick=()=>{try{assertValid();setFormat(format);render();}catch(e){message.textContent=e.message;}};
    tabs.append(b);return b;
  });
  root.append(tabs);
  const message=el('p');message.id='pdStatus';message.setAttribute('role','status');root.append(message);
  const content=el('div');root.append(content);
  function group(title,open=false) {const d=el('details'),grid=el('div');d.open=open;grid.className='builder-grid';d.append(el('summary',title),grid);content.append(d);groups.push({d,grid});return grid;}
  const grids=Object.fromEntries([['caption','字幕'],['hook','フック'],['tags','タグ'],['visualizer','波形'],['theme','テーマ'],['subtitle','サブタイトル'],['background','背景画像'],['icon','アイコン'],['person','人物画像を別に重ねる']].map(([k,t])=>[k,group(t,k==='caption')]));
  function target(key) {
    if(key.startsWith('safe_'))return guideRoot;
    if(key==='background_mode'||key==='stock_provider')return grids.background;
    const element=key.replace(/^(intro|body)_/,'').split('_')[0];
    if(element==='tag'||element==='tags')return grids.tags;
    if(key==='max_width_ratio')return grids.caption;
    return grids[element]||grids.hook;
  }
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
          if(section==='scenery_visibility'&&value==='inherit')delete next[format][section][key];
          else next[format][section][key]=section==='scenery_visibility'?value==='show':value;
        }
        validatePresentation(next);errors.delete(input);input.setCustomValidity('');onChange(next);render();
      }catch(e){errors.set(input,e.message);input.setCustomValidity(e.message);onInvalid?.();message.textContent=e.message;}
    });
  }
  for(const [key,label,items,type] of VIDEO_FIELDS.filter(([key])=>PRESENTATION_VIDEO_KEYS.includes(key)))
    add(key==='intro_scenes'?grids.hook:target(key),'video',key,label,{items,type:items?'text':type||'checkbox',...(key==='intro_scenes'?{min:1,max:10,step:1}:{})});
  add(grids.background,'background','file','media内の背景ファイル名');
  for(const [key,label] of Object.entries({...LAYOUT_LABELS,caption_center_x:'字幕 X（中心）',hook_center_x:'フック X（中心）',tag_font_size:'タグ文字サイズ',tag_scale:'タグ倍率'})) {
    const items=key==='hook_font_size_mode'?[['auto','自動調整（指定サイズが上限）'],['fixed','固定サイズ']]:undefined;
    const ratio=key.includes('ratio')||key.startsWith('safe_')||key==='hook_margin_x'||key==='hook_band_opacity';
    add(target(key),'layout',key,label,{items,type:items?'text':key==='hook_band_color'?'color':'number',
      min:key.includes('font_size')?1:key==='visualizer_size'?16:key==='tag_scale'?0.05:0,
      max:ratio?1:key.includes('font_size')?300:key==='visualizer_size'?2000:key==='tag_scale'?5:3840,step:ratio||key==='tag_scale'?0.01:1});
  }
  const modeWrap=el('label','テーマタイトルの作り方'),themeMode=el('select');themeMode.id='pdThemeMode';options(themeMode,[['ai','自動'],['manual','手動']]);modeWrap.append(themeMode);grids.theme.prepend(modeWrap);
  themeMode.onchange=()=>{
    const format=getFormat();themeModes.set(format,themeMode.value);
    if(themeMode.value==='ai'){const next=clone(getConfig().presentation||{version:1});next[format]??={};next[format].theme={...next[format].theme,title:''};onChange(next);}
    else {const next=clone(getConfig().presentation||{version:1});next[format]??={};next[format].theme={...next[format].theme,title:document.getElementById('pd_theme_title').value};onChange(next);}
    render();
  };
  add(grids.theme,'theme','title','手動テーマタイトル');add(grids.subtitle,'theme','subtitle','サブタイトル');
  for(const [kind,fields] of [['icon',{intro:'冒頭のアイコン',body:'本編のアイコン',file:'アイコン画像',x:'アイコン X',y:'アイコン Y',size:'アイコンサイズ'}],
    ['person',{enabled:'人物画像を別に重ねる',file:'人物画像',x:'人物 X',y:'人物 Y',width:'人物の幅',height:'人物の高さ'}]]) {
    for(const [key,label] of Object.entries(fields))add(grids[kind],kind,key,label,{type:key==='file'?'text':['intro','body','enabled'].includes(key)?'checkbox':'number',min:0,step:1});
  }
  document.getElementById('pd_person_enabled').parentElement.append(el('span','（背景画像に人物が写っている場合、別に重ねる必要はありません）'));
  for(const [key,label] of Object.entries({caption:'字幕',hook:'フック',tags:'タグ',visualizer:'波形',theme:'テーマ',subtitle:'サブタイトル',icon:'アイコン'}))
    add(grids[key],'scenery_visibility',key,'外部映像中の'+label,{items:[['inherit','標準の動作'],['show','表示'],['hide','非表示']]});
  function assertValid(){
    if(errors.size)throw Error('形式別デザインの入力を修正してください：'+[...errors.values()].join(' / '));
    const title=document.getElementById('pd_theme_title');
    if(themeMode.value==='manual'&&!title.parentElement.hidden&&!title.value.trim())throw Error('手動テーマタイトルを入力してください');
  }
  function render() {
    if(errors.size)return;
    let config,format,slot,tarot;
    try{config=getConfig();tarot=config.video.template==='tarot_monthly';format=getFormat();slot=tarot&&format==='landscape'?tarotBrand(config):designDefaults(config,format);}catch(e){message.textContent=e.message;return;}
    for(const [i,b] of tabButtons.entries())b.setAttribute('aria-pressed',String(format===['vertical','landscape'][i]));
    const v=slot.video||{},horizontal=v.hook_orientation==='horizontal',on=kind=>Boolean(v['intro_'+kind]||v['body_'+kind]);
    const rawTitle=tarot?config.presentation?.landscape?.theme?.title??'':slot.theme.title;
    themeMode.value=themeModes.get(format)||(rawTitle?'manual':'ai');
    for(const {input,section,key,type} of controls){
      let hidden=tarot&&(format==='vertical'||config.video.tarot_renderer!=='remotion'||!(section==='video'&&TAROT_BRAND_VIDEO.includes(key)||section==='layout'&&TAROT_BRAND_LAYOUT.includes(key)||section==='theme'||section==='icon'||section==='scenery_visibility'&&['theme','subtitle','icon'].includes(key)));
      if(!hidden){
        if(section==='video')hidden=(['hook_orientation','intro_scenes'].includes(key)&&!v.hook_enabled)||(key==='hook_band_enabled'&&(!v.hook_enabled||!horizontal))||(key==='stock_provider'&&v.background_mode==='fixed');
        if(section==='background')hidden=v.background_mode==='stock';
        if(section==='layout'){
          if(key.startsWith('hook_'))hidden=!v.hook_enabled||(['hook_top','hook_margin_x'].includes(key)?horizontal:['hook_center_x','hook_center_y','hook_max_width_ratio'].includes(key)?!horizontal:key.startsWith('hook_band_')?(!horizontal||!v.hook_band_enabled):false);
          if(key.startsWith('caption_')||key==='max_width_ratio')hidden=!on('caption');
          if(key.startsWith('tag_'))hidden=!on('tags');
          if(key.startsWith('visualizer_'))hidden=!on('visualizer');
          if(key.startsWith('theme_'))hidden=!on('theme');
          if(key.startsWith('subtitle_'))hidden=!on('subtitle');
          if(key.startsWith('safe_'))hidden=format!=='vertical';
        }
        if(section==='theme')hidden=key==='title'?(!on('theme')||themeMode.value!=='manual'):!on('subtitle');
        if(section==='icon')hidden=!['intro','body'].includes(key)&&!slot.icon?.intro&&!slot.icon?.body;
        if(section==='person')hidden=key!=='enabled'&&!slot.person?.enabled;
        if(section==='scenery_visibility')hidden=tarot?false:v.background_mode==='fixed'||(key==='hook'?!v.hook_enabled:key==='icon'?!slot.icon?.intro&&!slot.icon?.body:!on(key));
      }
      input.parentElement.hidden=hidden;
      let value=section==='background'?slot.background:slot[section]?.[key];
      if(section==='theme'&&key==='title')value=rawTitle;
      if(section==='scenery_visibility')value=value===undefined?'inherit':value?'show':'hide';
      if(type==='checkbox')input.checked=Boolean(value);else input.value=value??'';
    }
    modeWrap.hidden=tarot?(format!=='landscape'||config.video.tarot_renderer!=='remotion'):false;
    modeWrap.hidden ||= !on('theme');
    for(const {d,grid} of groups)d.hidden=Array.from(grid.children).every(e=>e.hidden);
    message.textContent=`${format==='vertical'?'縦型':'横型'}のデザインを編集中。${tarot?(format==='landscape'&&config.video.tarot_renderer==='remotion'?'左上のテーマ・サブタイトル・アイコンを設定します。自動タイトルは各星座・タイプの年月と名前です。':'カード・本編字幕は固定配置です。変更できる共通設定は下にあります。'):'表示中の値がこの形式に適用されます。位置は動画のピクセル座標です。'}変更は「設定の保存」で保存できます。`;
  }
  function reset(){errors.clear();themeModes.clear();for(const {input} of controls)input.setCustomValidity('');render();}
  return {render,assertValid,reset};
}


