import {VIDEO_DEFAULTS, LAYOUT_DEFAULTS} from './presets.mjs?v=tarot-batch-20261011';
import {emptyRegistry,catalog,clone,resolvePreset,resolveConfig,savePreset,defaultLayout} from './model.mjs?v=tarot-batch-20261011';
import {buildPrompt} from './prompt.mjs?v=tarot-orientation-20261011';
import {applyConfig,tarotTitle} from './compiler.mjs?v=tarot-batch-20261011';
import {readRegistry,writeRegistry,decodeContent} from './storage.mjs?v=tarot-batch-20261011';
import {drawPreview} from './preview.mjs?v=tarot-batch-20261011';
import {TAROT_CARDS} from './tarot-cards.mjs';
import {SIGNS, POSITIONS, batchConfig, batchPrompt, compileBatch, importBatch, importBatchSource, batchSourcePrompt} from './batch.mjs?v=tarot-source-20261012';

const TAROT_SIGNS=[['aries','牡羊座'],['taurus','牡牛座'],['gemini','双子座'],['cancer','蟹座'],['leo','獅子座'],['virgo','乙女座'],['libra','天秤座'],['scorpio','蠍座'],['sagittarius','射手座'],['capricorn','山羊座'],['aquarius','水瓶座'],['pisces','魚座']];
const TAROT_POSITIONS=[['overall','① 全体運'],['relationships','② 恋愛・対人'],['work','③ 仕事・行動'],['advice','④ アドバイス']];

const $=id=>document.getElementById(id);
const VIDEO_FIELDS=[
  ['voice_mode','音声方式',[['original','録音音声'],['anonymous','匿名加工音声'],['tts','AI読み上げ']]],
  ['tts_voice','声',[['hashimoto','ハシモト本人（Voice IDの登録が必要）'],['male_a','男性A'],['male_b','男性B']]],
  ['tts_style','話し方',[['natural','自然'],['calm','落ち着いた'],['gentle','優しい'],['bright','明るい'],['serious','真剣'],['powerful','力強い']]],
  ['tts_pace','話す速さ',[['slow','ゆっくり'],['normal','標準'],['fast','やや速い']]],
  ['tts_custom_style','カスタム話し方（500文字以内）',null,'text'],
  ['bgm_mode','BGM',[['off','OFF'],['ai','原稿に合うカテゴリをAIが提案'],['category','雰囲気で選ぶ'],['track','曲を直接選ぶ']]],
  ['bgm_category','BGMカテゴリ',[['ai','AI自動'],['calm','安心感'],['reflective','内省'],['mysterious','神秘'],['hopeful','前向き'],['serious','注意喚起']]],
  ['bgm_track','登録済みBGM曲',[['','保存済み設定を読み込んで選択']]],
  ['bgm_volume_db','BGM音量（標準からの増減 dB・-30〜+24）',null,'number'],
  ['bgm_ducking','発話中にBGM音量を下げる（ダッキング）'],
  ['bgm_start_seconds','曲のどこから使うか（秒）',null,'number'],
  ['bgm_delay_seconds','動画の何秒目から流すか（秒）',null,'number'],
  ['bgm_loop','曲が終わったら繰り返す'],
  ['bgm_fade_in_seconds','BGMフェードイン（秒）',null,'number'],
  ['bgm_fade_out_seconds','BGMフェードアウト（秒）',null,'number'],
  ['hook_enabled','フック表示'],
  ['cta_enabled','タロットの最後にCTAシーンを追加'],
  ['hook_orientation','フック方向',[['horizontal','横書き'],['vertical','縦書き']]],
  ['intro_scenes','冒頭シーン数',null,'number'],
  ['intro_caption','冒頭の通常字幕'],['body_caption','本編の通常字幕'],
  ['intro_tags','冒頭のタグ'],['body_tags','本編のタグ'],
  ['intro_visualizer','冒頭の波形'],['body_visualizer','本編の波形'],
  ['background_mode','背景素材',[['fixed','固定画像のみ'],['mixed','人物画像＋一部動画'],['stock','全編AI動画素材']]],
  ['stock_provider','動画素材提供元',[['pexels','Pexels'],['pixabay','Pixabay']]],
  ['hook_band_enabled','横書きフックの黒帯'],
];
const LAYOUT_LABELS={tag_x:'タグ X（左端）',tag_y:'タグ Y（上端）',
  visualizer_x:'波形 X（中心）',visualizer_y:'波形 Y（中心）',visualizer_size:'波形 size（キャンバス）',
  visualizer_width_ratio:'バー波形の表示幅比率',hook_center_y:'横書きフック Y（中心）',
  hook_top:'縦書きフック Y（上端）',hook_margin_x:'縦書きフック左右余白比率',
  caption_center_y:'字幕 Y（中心）',hook_font_size:'フック最大文字サイズ',caption_font_size:'字幕文字サイズ',
  max_width_ratio:'字幕最大幅比率',hook_max_width_ratio:'横書きフック最大幅比率',
  hook_band_color:'帯の色',hook_band_width_ratio:'帯の横幅比率',hook_band_padding_y:'帯の上下余白（px）',hook_font_size_mode:'文字サイズ方式',hook_band_opacity:'帯の不透明度',safe_top:'上ガイド比率',safe_right:'右ガイド比率',safe_bottom:'下ガイド比率'};
function el(tag,text) {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
function options(select,items,current) {select.replaceChildren();for(const [value,label] of items){const o=el('option',label);o.value=value;select.append(o);}if(current!==undefined)select.value=current;}
function field(root,key,label,items,type='checkbox') {
  const wrapper=el('label',label), input=el(items?'select':'input');input.id='pb_'+key;
  if(items) options(input,items);else input.type=type;
  if(type==='checkbox'&&!items)wrapper.className='check';
  wrapper.append(input);root.append(wrapper);return input;
}
export function mountBuilder(apiProvider) {
  let registry=emptyRegistry(), sha=null, registryRepo=null, bgmCatalog=null, image=null, imageRequest=0;
  let session={video_preset:'tiktok_standard',layout_preset:'portrait_standard',background:'background.png',overrides:{video:{},layout:{}},ai:{}};
  let snapshot=null, loadedRepo='', working=false;
  const batchEntries=Object.fromEntries(SIGNS.map(([sign])=>[sign,{cards:['','','',''],orientations:['upright','upright','upright','upright'],narration:'',cta:''}]));
  let batchResponses={}, batchRequested=[];
  const BATCH_DRAFT='tarot-batch-draft-v1';
  const status=text=>{$('builderStatus').textContent=text;};
  const connection=()=>{
    const expected=$('repo').value.trim();
    return async(...args)=>{
      if($('repo').value.trim()!==expected)throw Error('リポジトリが変更されました。操作をやり直してください');
      const r=await apiProvider()(...args);
      if($('repo').value.trim()!==expected)throw Error('リポジトリが変更されました。操作をやり直してください');
      return r;
    };
  };
  async function run(action) {if(working)return;working=true;for(const id of ['pbLoad','pbSaveVideo','pbOverwriteVideo','pbBackgroundPreview'])$(id).disabled=true;try{await action();}catch(e){status(e.message);}finally{working=false;for(const id of ['pbLoad','pbSaveVideo','pbOverwriteVideo','pbBackgroundPreview'])$(id).disabled=false;}}
  function tarotData() {
    const year=Number($('pbTarotYear').value),month=Number($('pbTarotMonth').value),period=$('pbTarotPeriod').value,zodiac=$('pbTarotZodiac').value;
    if(!['full','first','second'].includes(period))throw Error('対象期間を選択してください');
    if(!Number.isInteger(year)||year<2000||year>2100)throw Error('占う年は2000〜2100で入力してください');
    if(!Number.isInteger(month)||month<1||month>12)throw Error('占う月を選択してください');
    if(!TAROT_SIGNS.some(([id])=>id===zodiac))throw Error('星座を選択してください');
    const cards=TAROT_POSITIONS.map(([position],i)=>({position,card_id:$(`pbTarotCard${i}`).value,orientation:$(`pbTarotOrientation${i}`).value}));
    if(cards.some(c=>!TAROT_CARDS.some(x=>x.id===c.card_id)))throw Error('4枚のカードを選択してください');
    if(new Set(cards.map(c=>c.card_id)).size!==4)throw Error('同じカードを複数回選べません');
    if(cards.some(c=>!['upright','reversed'].includes(c.orientation)))throw Error('カードの正逆を選択してください');
    return {year,month,period,zodiac,cards};
  }
  function config() {return resolveConfig(registry,session);}
  function configuredInput() {
    const c=config();
    if(c.video.template==='tarot_monthly') {
      c.tarot=tarotData();
      c.cta_text=$('pbTarotCtaText').value.trim();
      if(c.video.cta_enabled&&(!c.cta_text||Array.from(c.cta_text).length>40))throw Error('CTA文は1〜40文字で入力してください');
    }
    return c;
  }
  function invalidate() {snapshot=null;$('pbPrompt').value='';batchChanged();status('設定が変わりました。プロンプトを生成し直してください。');}
  function paint() {
    try {const c=config();let title='';try{const script=JSON.parse($('script').value);title=script.scenes?.[0]?.hook_text||script.scenes?.[0]?.text||'';}catch{}
      if(c.ai.hook==='manual')title=c.ai.manual_hook.split('\n---\n')[0];
      if(c.video.template==='tarot_monthly'){
        const batch=session.video_preset==='tarot_monthly_batch';
        c.tarot={year:Number($(batch?'pbBatchYear':'pbTarotYear').value),month:Number($(batch?'pbBatchMonth':'pbTarotMonth').value),period:$(batch?'pbBatchPeriod':'pbTarotPeriod').value,zodiac:batch?'aries':$('pbTarotZodiac').value};
        title=tarotTitle(c.tarot);
      }
      drawPreview($('pbCanvas'),c,image,$('pbPreviewIntro').checked,$('pbSafe').checked,title);$('pbPreviewError').textContent='';}
    catch(e){$('pbPreviewError').textContent=e.message;}
  }
  function renderFields() {
    const p=resolvePreset(registry,'video',session.video_preset), v={...VIDEO_DEFAULTS,...p.values,...session.overrides.video};
    const lp=resolvePreset(registry,'layout',session.layout_preset), l={...LAYOUT_DEFAULTS,...lp.values,...p.layout,...session.overrides.layout};
    for(const [key] of VIDEO_FIELDS) {const input=$('pb_'+key);if(typeof v[key]==='boolean')input.checked=v[key];else input.value=v[key];}
    for(const key of Object.keys(LAYOUT_DEFAULTS)) $('pb_'+key).value=l[key];
    $('pb_bgm_category').disabled=v.bgm_mode!=='category';$('pb_bgm_track').disabled=v.bgm_mode!=='track';
    for(const key of ['bgm_start_seconds','bgm_delay_seconds','bgm_loop','bgm_fade_in_seconds','bgm_fade_out_seconds']) $('pb_'+key).disabled=v.bgm_mode==='off';
    $('pb_bgm_volume_db').disabled=v.bgm_mode==='off';$('pb_bgm_ducking').disabled=v.bgm_mode==='off';
    for(const key of ['intro_tags','body_tags']) $('pb_'+key).disabled=v.template!=='portrait_brand';
    $('pb_hook_orientation').disabled=!v.hook_enabled;$('pb_hook_band_enabled').disabled=v.hook_orientation!=='horizontal';
    $('pbBackgroundFile').disabled=v.background_mode==='stock';
    $('pbHookText').disabled=$('pbHookMode').value!=='manual'||!v.hook_enabled;
    $('pbSearchText').disabled=$('pbSearchMode').value!=='manual'||v.background_mode==='fixed';
    $('pbStockPercent').disabled=$('pbStockMode').value!=='ai'||v.background_mode!=='mixed';
    $('pbStockIndices').disabled=$('pbStockMode').value!=='manual'||v.background_mode!=='mixed';
    $('pbThemeTitle').disabled=$('pbThemeMode').value!=='manual'||v.format!=='landscape';
    $('pbTtsFields').hidden=v.voice_mode!=='tts';$('pbTtsDetails').hidden=v.voice_mode!=='tts';
    $('pbDspHelp').hidden=v.voice_mode!=='anonymous';
    const tarot=v.template==='tarot_monthly';
    const fixedTarot=tarot&&v.tarot_renderer==='remotion';
    const batch=session.video_preset==='tarot_monthly_batch';
    $('pbTarotArea').hidden=!tarot||batch;
    $('pbBatchArea').hidden=!batch;
    $('pbSingleNarration').hidden=batch;
    $('pbSingleScript').hidden=batch;
    $('pbBatchRun').hidden=!batch;
    $('generate').hidden=batch;
    $('pbBuild').parentElement.hidden=batch;
    $('pbPrompt').parentElement.hidden=batch;
    $('pbOutputMode').parentElement.hidden=batch;
    $('pbApplyOnSend').parentElement.hidden=batch;
    $('pbApplyOnSend').checked=!batch&&$('pbApplyOnSend').checked;
    $('pb_cta_enabled').parentElement.hidden=!tarot;
    $('pbTarotCtaText').parentElement.hidden=!tarot||!v.cta_enabled;
    $('pbBackgroundFile').parentElement.hidden=tarot;
    $('pbHookMode').parentElement.hidden=tarot;
    $('pbHookText').parentElement.hidden=tarot;
    for(const key of ['background_mode','stock_provider','intro_tags','body_tags']) $('pb_'+key).parentElement.hidden=tarot;
    for(const id of ['pbSearchMode','pbSearchText','pbStockMode','pbStockPercent','pbStockIndices']) $(id).parentElement.hidden=tarot;
    for(const key of ['tag_x','tag_y']) $('pb_'+key).parentElement.hidden=tarot;
    for(const key of ['caption_center_y','caption_font_size','max_width_ratio']) $('pb_'+key).parentElement.hidden=fixedTarot;
    $('pbGeneralLayoutArea').querySelector('p').textContent=fixedTarot
      ? 'Remotion版タロットの見出し・カード・本編字幕は投稿画面向けの固定配置です。フックと波形は下の項目で調整できます。ガイドは動画に入りません。'
      : '左上を原点とする動画のピクセル座標。入力値をそのままJSONへ反映します。縦書きフックは中心Yではなく上端Yを使用します。タグはportrait_brandで表示します。';
    $('pbBackgroundPreview').hidden=tarot;
    $('pb_intro_scenes').parentElement.hidden=tarot; // Tarot intro is delimited by tarot_phase.
    $('pbThemeMode').parentElement.hidden=tarot;
    $('pbThemeTitle').parentElement.hidden=tarot;
    if($('pbApplyOnSend').checked||!$('script').value.trim()) $('audioUpload').hidden=v.voice_mode==='tts';
    if(batch)$('audioUpload').hidden=true;
    $('pbPreviewError').textContent=''; paint();
  }
  function lists() {
    options($('pbVideo'),catalog(registry,'video').map(p=>[p.id,p.name]),session.video_preset);
    $('pbBackgroundFile').value=session.background;
    options($('pb_bgm_track'),[['','曲を選択'],...(bgmCatalog?.tracks||[]).map(t=>[t.id,t.title])]);
    renderFields();
  }
  options($('pbTarotMonth'),Array.from({length:12},(_,i)=>[String(i+1),`${i+1}月`]),String(new Date().getMonth()+1));
  options($('pbBatchMonth'),Array.from({length:12},(_,i)=>[String(i+1),`${i+1}月`]),String(new Date().getMonth()+1));
  options($('pbTarotZodiac'),TAROT_SIGNS,'sagittarius');
  $('pbTarotYear').value=new Date().getFullYear();
  $('pbBatchYear').value=new Date().getFullYear();
  for(const [i,[position,label]] of TAROT_POSITIONS.entries()) {
    const box=el('div');box.className='tarot-card-input';
    const title=el('h4',label), card=el('select');
    card.id=`pbTarotCard${i}`;
    options(card,[['','カードを選択'],...TAROT_CARDS.map(x=>[x.id,x.name])]);
    const cardLabel=el('label','引いたカード');cardLabel.append(card);
    const orientation=el('select');orientation.id=`pbTarotOrientation${i}`;
    options(orientation,[['upright','正位置'],['reversed','逆位置']]);
    const orientationLabel=el('label','カードの向き');orientationLabel.append(orientation);
    box.append(title,cardLabel,orientationLabel);$('pbTarotCards').append(box);
    card.addEventListener('change',invalidate);
    orientation.addEventListener('change',invalidate);
  }
  const batchBox=$('pbBatchEntries');
  for(const [sign,name] of SIGNS) {
    const details=el('details'), summary=el('summary',name+' · 未入力'), grid=el('div');
    grid.className='builder-grid';
    details.dataset.sign=sign;
    details.append(summary,grid);
    POSITIONS.forEach((position,index)=>{
      const label=el('label',TAROT_POSITIONS[index][1]), select=el('select');
      options(select,[['','カードを選択'],...TAROT_CARDS.map(card=>[card.id,card.name])]);
      select.addEventListener('change',()=>{batchEntries[sign].cards[index]=select.value;delete batchResponses[sign];batchChanged();});
      const orientation=el('select');options(orientation,[['upright','正位置'],['reversed','逆位置']]);
      orientation.addEventListener('change',()=>{batchEntries[sign].orientations[index]=orientation.value;delete batchResponses[sign];batchChanged();});
      const orientationLabel=el('label','カードの向き');orientationLabel.append(orientation);
      label.append(select);grid.append(label,orientationLabel);
    });
    const narration=el('textarea');narration.rows=7;narration.placeholder='この星座のナレーション原稿（CTAは含めない）';
    narration.addEventListener('input',()=>{batchEntries[sign].narration=narration.value;delete batchResponses[sign];batchChanged();});
    const transcriptLabel=el('label','ナレーション原稿');transcriptLabel.append(narration);
    const cta=el('input');cta.maxLength=40;cta.placeholder='空欄なら共通CTA';
    cta.addEventListener('input',()=>{batchEntries[sign].cta=cta.value;delete batchResponses[sign];batchChanged();});
    const ctaLabel=el('label','個別CTA（任意）');ctaLabel.append(cta);
    const check=el('input');check.type='checkbox';check.checked=true;check.className='batch-select';
    const checkLabel=el('label','この星座を制作する');checkLabel.className='check';checkLabel.prepend(check);
    check.addEventListener('change',batchChanged);
    details.append(transcriptLabel,ctaLabel,checkLabel);batchBox.append(details);
  }
  function batchSelection(){return [...batchBox.querySelectorAll('details')].filter(d=>d.querySelector('.batch-select').checked).map(d=>d.dataset.sign);}
  function saveDraft(){
    try{localStorage.setItem(BATCH_DRAFT,JSON.stringify({repo:$('repo').value.trim(),entries:batchEntries,responses:batchResponses,
      year:$('pbBatchYear').value,month:$('pbBatchMonth').value,period:$('pbBatchPeriod').value,cta:$('pbBatchCta').value,
      selected:batchSelection()}));}catch{status('端末の保存容量が不足しています。画面を閉じる前に入力を控えてください。');}
  }
  function batchChanged(){
    batchRequested=[];$('pbBatchPrompt').value='';
    for(const d of batchBox.querySelectorAll('details')){
      const e=batchEntries[d.dataset.sign], ready=e.cards.every(Boolean)&&e.narration.trim();
      d.querySelector('summary').textContent=TAROT_SIGNS.find(([s])=>s===d.dataset.sign)[1]+' · '+(batchResponses[d.dataset.sign]?'AI出力取込済':ready?'原稿入力済':'未入力');
    }
    saveDraft();
    status('一括設定を変更しました。必要な組のプロンプトを確認してください。');
  }
  for(const id of ['pbBatchYear','pbBatchMonth','pbBatchPeriod','pbBatchCta'])$(id).addEventListener('input',()=>{batchResponses={};batchChanged();});
  $('pbBatchSourcePromptBuild').onclick=()=>{
    try {
      $('pbBatchSourcePrompt').value=batchSourcePrompt(Number($('pbBatchYear').value),Number($('pbBatchMonth').value),$('pbBatchPeriod').value);
      status('占い結果を作るためのプロンプトを用意しました');
    }catch(e){status(e.message);}
  };
  $('pbBatchSourcePromptCopy').onclick=async()=>{
    try{if(!$('pbBatchSourcePrompt').value)throw Error('先に占い結果用プロンプトを生成してください');
      await navigator.clipboard.writeText($('pbBatchSourcePrompt').value);status('占い結果用プロンプトをコピーしました');
    }catch(e){$('pbBatchSourcePrompt').select();status(e.message);}
  };
  $('pbBatchSourceImport').onclick=()=>{
    try {
      const result=importBatchSource($('pbBatchSource').value);
      if(config().video.cta_enabled && Object.values(result.entries).some(e=>!e.cta.trim())
        && !$('pbBatchCta').value.trim())throw Error('個別CTAが空欄の星座があります。先に共通CTAを入力してください');
      // Validation completes before any of the existing controls or saved draft are touched.
      $('pbBatchYear').value=result.year;
      $('pbBatchMonth').value=result.month;
      $('pbBatchPeriod').value=result.period;
      for(const d of batchBox.querySelectorAll('details')){
        const sign=d.dataset.sign,e=result.entries[sign];
        batchEntries[sign]={...e};
        d.querySelectorAll('select').forEach((input,i)=>{input.value=i%2?e.orientations[(i-1)/2]:e.cards[i/2];});
        d.querySelector('textarea').value=e.narration;
        d.querySelector('input[maxlength]').value=e.cta;
        delete batchResponses[sign];
      }
      batchChanged();
      $('pbBatchSourceWarnings').textContent=result.warnings.length
        ?'確認事項（原稿は変更していません）:\n'+result.warnings.join('\n'):'12星座のカード・向き・原稿・CTAを反映しました。内容を確認してください。';
      status('12星座・48枚を反映しました。既存のシーン回答は無効です。内容を確認後、未取込分のプロンプトを生成してください。');
    }catch(e){status(e.message);}
  };
  $('pbBatchBuild').onclick=()=>{
    try{
      const c=config(), signs=batchSelection();
      if(!signs.length)throw Error('制作する星座を選択してください');
      if(c.video.voice_mode!=='tts')throw Error('一括制作ではAI読み上げを選択してください');
      if(c.video.bgm_mode!=='off'&&loadedRepo!==$('repo').value.trim())throw Error('BGM登録一覧を読み込んでください');
      batchRequested=signs.filter(sign=>!batchResponses[sign]);
      if(!batchRequested.length)throw Error('選択した星座はすべて取り込み済みです。作り直す星座の原稿を編集してください');
      const input=batchRequested.map(sign=>[sign,{...batchEntries[sign],year:Number($('pbBatchYear').value),month:Number($('pbBatchMonth').value),period:$('pbBatchPeriod').value,sharedCta:$('pbBatchCta').value.trim()}]);
      $('pbBatchPrompt').value=batchPrompt(c,input,bgmCatalog);
      status(`${batchRequested.length}星座分をまとめたプロンプトを生成しました`);
    }catch(e){status(e.message);}
  };
  $('pbBatchCopy').onclick=async()=>{
    try{await navigator.clipboard.writeText($('pbBatchPrompt').value);status('コピーしました');}
    catch{$('pbBatchPrompt').select();status('選択しました。iPhoneの「コピー」を使ってください。');}
  };
  $('pbBatchImport').onclick=()=>{
    try{
      if(!batchRequested.length)throw Error('先にプロンプトを生成してください');
      const parsed=importBatch($('pbBatchResponse').value,batchRequested,batchEntries), c=config();
      for(const sign of Object.keys(parsed)){
        const entry={...batchEntries[sign],year:Number($('pbBatchYear').value),month:Number($('pbBatchMonth').value),period:$('pbBatchPeriod').value,sharedCta:$('pbBatchCta').value.trim()};
        const conf=batchConfig(c,sign,entry);
        const result=compileBatch(c,{[sign]:entry},{[sign]:parsed[sign]},[sign],bgmCatalog);
        if(!result.videos.length||!conf.tarot)throw Error('入力に不備があります');
      }
      const count=Object.keys(parsed).length, missing=batchRequested.length-count;
      Object.assign(batchResponses,parsed);$('pbBatchResponse').value='';batchChanged();
      status(`${count}星座分を検証・取り込みました。${missing?`残り${missing}星座は「未取込分のプロンプトを生成」から追加できます。`:'制作対象の全星座を取り込みました。'}`);
    }catch(e){status(e.message);}
  };
  function manifest(){
    const c=config(), entries={};
    for(const [sign] of SIGNS) entries[sign]={...batchEntries[sign],year:Number($('pbBatchYear').value),month:Number($('pbBatchMonth').value),period:$('pbBatchPeriod').value,sharedCta:$('pbBatchCta').value.trim()};
    return compileBatch(c,entries,batchResponses,batchSelection(),bgmCatalog);
  }
  $('pbBatchCheck').onclick=()=>{try{
    const m=manifest(), minutes=Number($('pbBatchMinutes').value);
    if($('pbBatchMinutes').value&&(minutes<1||!Number.isInteger(minutes)))throw Error('1本目の制作時間は1分以上の整数で入力してください');
    status(`${m.videos.length}本を確認しました。AI読み上げは${m.videos.length}回実行されます。${minutes?`過去の実績から制作時間は約${minutes*m.videos.length}分＋準備時間です。`:''} 一括制作ボタンで開始します。`);
  }catch(e){status(e.message);}};
  $('pbBatchGenerate').onclick=()=>window.videoStudioSubmitBatch?.();
  try{
    const draft=JSON.parse(localStorage.getItem(BATCH_DRAFT)||'null');
    if(draft?.repo===$('repo').value.trim()&&draft.entries){
      for(const id of ['year','month','period','cta']) $('pbBatch'+id[0].toUpperCase()+id.slice(1)).value=draft[id]??'';
      batchResponses=draft.responses||{};
      for(const d of batchBox.querySelectorAll('details')){
        const sign=d.dataset.sign, e=draft.entries[sign];if(!e)continue;
        batchEntries[sign]={cards:e.cards||['','','',''],orientations:e.orientations||['upright','upright','upright','upright'],narration:e.narration||'',cta:e.cta||''};
        d.querySelectorAll('select').forEach((input,i)=>input.value=i%2?batchEntries[sign].orientations[(i-1)/2]:batchEntries[sign].cards[i/2]);
        d.querySelector('textarea').value=batchEntries[sign].narration;
        d.querySelector('input[maxlength]').value=batchEntries[sign].cta;
        d.querySelector('.batch-select').checked=draft.selected?.includes(sign)??true;
      }
      batchChanged();
    }
  }catch{}
  $('pbTarotCtaText').addEventListener('input',invalidate);
  for(const id of ['pbTarotYear','pbTarotMonth','pbTarotPeriod','pbTarotZodiac'])$(id).addEventListener('change',invalidate);
  for(const [key,label,items,type] of VIDEO_FIELDS) {
    const input=field($(key==='voice_mode'?'pbVoiceFields':key==='tts_custom_style'?'pbTtsCustom':key.startsWith('tts_')?'pbTtsFields':'pbVideoFields'),key,label,items,type);
    if(key.startsWith('bgm_')&&type==='number'&&key!=='bgm_volume_db'){input.min=0;input.max=key.includes('fade')?30:86400;input.step=0.1;}
    if(key==='intro_scenes'){input.min=1;input.max=10;input.step=1;}
    if(key==='bgm_volume_db'){
      input.min=-30;input.max=24;input.step=1;
      const hint=document.createElement('small');hint.id='pbBgmVolumeHelp';hint.className='muted';
      hint.textContent='0 dB：従来の標準。+6で小さい場合は+12→+18の順に調整（最大+24）。ダッキングOFFで確認し、声が聞き取れる音量にしてください。';
      input.setAttribute('aria-describedby',hint.id);input.parentElement.append(hint);
    }
    input.addEventListener('change',()=>{session.overrides.video[key]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;invalidate();renderFields();});
  }
  for(const [key,label] of Object.entries(LAYOUT_LABELS)) {
    const input=field($('pbLayoutFields'),key,label,key==='hook_font_size_mode'?[['auto','自動調整（指定サイズが上限）'],['fixed','固定サイズ']]:null,key==='hook_band_color'?'color':'number');
    input.min=key.includes('font_size')?1:key==='visualizer_size'?16:0;
    input.max=key.includes('ratio')||key.includes('safe_')||key==='hook_margin_x'||key==='hook_band_opacity'?1:key.includes('font_size')?300:key==='visualizer_size'?2000:3840;
    input.step=Number(input.max)===1?0.01:1;
    input.addEventListener('input',()=>{session.overrides.layout[key]=input.type==='number'?Number(input.value):input.value;invalidate();paint();});
  }
  $('pbVideo').onchange=()=>{
    session.video_preset=$('pbVideo').value;session.overrides={video:{},layout:{}};
    session.layout_preset=defaultLayout(registry,session.video_preset);
    session.background=resolvePreset(registry,'video',session.video_preset).background||'background.png';image=null;
    invalidate();lists();
  };
  $('pbBackgroundFile').onchange=()=>{session.background=$('pbBackgroundFile').value.trim();image=null;invalidate();lists();};
  for(const [id,key] of [['pbHookMode','hook'],['pbHookText','manual_hook'],['pbSearchMode','search'],['pbSearchText','search_text'],['pbStockMode','stock_scenes'],['pbStockPercent','stock_percent'],['pbStockIndices','stock_indices'],['pbThemeMode','theme'],['pbThemeTitle','theme_title']]) {
    $(id).addEventListener('input',()=>{session.ai[key]=key==='stock_percent'?Number($(id).value):$(id).value;invalidate();renderFields();});
  }
  $('script').addEventListener('input',paint);
  $('pbTranscript').addEventListener('input',invalidate);$('pbOutputMode').onchange=invalidate;
  $('pbPreviewIntro').onchange=paint;$('pbSafe').onchange=paint;
  $('pbBackgroundPreview').onclick=()=>run(async()=>{
    const file=config().background, request=++imageRequest;
    const r=await connection()(`contents/media/${file.split('/').map(encodeURIComponent).join('/')}?ref=main`);
    if(request!==imageRequest||file!==session.background)return;
    const decoded=atob(r.content.replace(/\s/g,''));
    const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([bytes])), img=new Image();
    try {await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('背景画像をプレビューできません'));img.src=url;});if(file===session.background){image=img;paint();status('背景画像を読み込みました');}}finally{URL.revokeObjectURL(url);}
  });
  $('pbLoad').onclick=()=>run(async()=>{
    const api=connection(), expected=$('repo').value.trim();
    const r=await readRegistry(api), bgm=decodeContent(await api('contents/media/bgm/catalog.json?ref=main'));
    if(bgm.version!==1||!Array.isArray(bgm.tracks))throw Error('BGM登録一覧が不正です');
    registry=r.registry;sha=r.sha;registryRepo=expected;bgmCatalog=bgm;loadedRepo=expected;
    invalidate();lists();status('保存済みプリセットとBGM一覧を読み込みました');
  });
  async function save(kind, overwrite=false) {
    if(registryRepo!==$('repo').value.trim())throw Error('先に「保存済み設定を読込」を押してください');
    const c=config(), id=overwrite?session.video_preset:$('pbSaveId').value.trim(), name=overwrite?resolvePreset(registry,'video',session.video_preset).name:$('pbSaveName').value.trim();
    const parent=resolvePreset(registry,kind,kind==='video'?session.video_preset:session.layout_preset);
    const values=kind==='video'?c.video:c.layout, defaults=kind==='video'?VIDEO_DEFAULTS:LAYOUT_DEFAULTS;
    const base={...defaults,...parent.values}, delta=Object.fromEntries(Object.entries(values).filter(([k,value])=>value!==base[k]));
    const entry={id,name,...(overwrite?{}:{extends:parent.id}),values:overwrite?clone(values):delta,default_layout:session.layout_preset,layout:clone(c.layout),background:c.background};
    const next=savePreset(registry,kind,entry,overwrite), written=await writeRegistry(connection(),next,sha);
    registry=written.registry;sha=written.sha;
    if(kind==='video'){session.video_preset=id;session.overrides.video={};}else{session.layout_preset=id;session.overrides.layout={};}
    invalidate();lists();status(`${name}を保存しました。プリセット保存では動画生成を実行しません。`);
  }
  $('pbSaveVideo').onclick=()=>run(()=>save('video'));
  $('pbOverwriteVideo').onclick=()=>run(()=>save('video',true));
  $('pbBuild').onclick=()=>{try{const c=configuredInput();if(c.video.voice_mode==='tts'&&!$('pbTranscript').value.trim())throw Error('ナレーション原稿を入力してください');if(c.video.bgm_mode!=='off'&&loadedRepo!==$('repo').value.trim())throw Error('BGMを使用する場合は登録一覧を読み込んでください');$('pbPrompt').value=buildPrompt(c,$('pbTranscript').value,bgmCatalog,$('pbOutputMode').value);snapshot=clone(c);$('pbApplyOnSend').checked=true;renderFields();status('プロンプトを生成しました。AIの返答をscript.json欄へ貼り付けてください。');}catch(e){status(e.message);}};
  $('pbCopy').onclick=async()=>{try{if(!$('pbPrompt').value)throw Error('先にプロンプトを生成してください');await navigator.clipboard.writeText($('pbPrompt').value);status('コピーしました');}catch{$('pbPrompt').focus();$('pbPrompt').select();status('プロンプト欄を選択しました。iPhoneの「コピー」を使用してください。');}};
  function prepare(script) {
    if(!$('pbApplyOnSend').checked)return script;
    if(!snapshot)throw Error('画面設定を適用するには、設定変更後にプロンプトを生成してください');
    if(snapshot.video.bgm_mode!=='off'&&loadedRepo!==$('repo').value.trim())throw Error('現在のリポジトリのBGM登録一覧を読み込んでください');
    return applyConfig(script,snapshot,bgmCatalog);
  }
  $('repo').addEventListener('input',()=>{registry=emptyRegistry();sha=null;registryRepo=null;bgmCatalog=null;loadedRepo='';image=null;imageRequest++;session={video_preset:'tiktok_standard',layout_preset:'portrait_standard',background:'background.png',overrides:{video:{},layout:{}},ai:{}};invalidate();lists();});
  lists();
  return {prepareScript:prepare, previewConfig:config, batch:{active:()=>session.video_preset==='tarot_monthly_batch',manifest}};
}




