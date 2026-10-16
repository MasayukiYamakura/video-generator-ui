import {SIGNS,POSITIONS,batchConfig,batchPrompt,compileBatch,importBatch,importBatchSource,batchSourcePrompt} from './batch.mjs?v=batch-social-20261016';
import {TAROT_CARDS} from './tarot-cards.mjs';
import {TAROT_POSITIONS} from './single-editor.mjs?v=maintenance-20261016';
import {el,options} from './dom.mjs?v=maintenance-20261016';
const TAROT_SIGNS=SIGNS;
const $=id=>document.getElementById(id);
export function mountBatchEditor({config,status,getCatalog,getLoadedRepo}) {
  const batchEntries=Object.fromEntries(SIGNS.map(([sign])=>[sign,{cards:['','','',''],orientations:['upright','upright','upright','upright'],narration:'',cta:''}]));
  let batchResponses={},batchRequested=[];
  const BATCH_DRAFT='tarot-batch-draft-v1';
  options($('pbBatchMonth'),Array.from({length:12},(_,i)=>[String(i+1),`${i+1}月`]),String(new Date().getMonth()+1));
  $('pbBatchYear').value=new Date().getFullYear();
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
    const socialPreview=el('p');socialPreview.className='muted';socialPreview.dataset.socialPreview='';
    details.append(transcriptLabel,ctaLabel,socialPreview,checkLabel);batchBox.append(details);
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
      d.querySelector('[data-social-preview]').textContent=e.social?'投稿説明文：'+e.social.description+' ／ '+e.social.hashtags.join(' '):'投稿説明文なし：投稿時は共通定型文を使用';
      d.querySelector('summary').textContent=TAROT_SIGNS.find(([s])=>s===d.dataset.sign)[1]+' · '+(batchResponses[d.dataset.sign]?'AI出力取込済':ready?'原稿入力済':'未入力');
    }
    saveDraft();
    status('一括設定を変更しました。必要な組のプロンプトを確認してください。');
  }
  for(const id of ['pbBatchYear','pbBatchMonth','pbBatchPeriod','pbBatchCta'])$(id).addEventListener('input',()=>{batchResponses={};$('pbBatchSourcePrompt').value='';batchChanged();});
  $('pbBatchSourcePromptBuild').onclick=()=>{
    try {
      $('pbBatchSourcePrompt').value=batchSourcePrompt(Number($('pbBatchYear').value),Number($('pbBatchMonth').value),$('pbBatchPeriod').value,config().video.cta_enabled,$('pbBatchCta').value);
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
      if(c.video.bgm_mode!=='off'&&getLoadedRepo()!==$('repo').value.trim())throw Error('BGM登録一覧を読み込んでください');
      batchRequested=signs.filter(sign=>!batchResponses[sign]);
      if(!batchRequested.length)throw Error('選択した星座はすべて取り込み済みです。作り直す星座の原稿を編集してください');
      const input=batchRequested.map(sign=>[sign,{...batchEntries[sign],year:Number($('pbBatchYear').value),month:Number($('pbBatchMonth').value),period:$('pbBatchPeriod').value,sharedCta:$('pbBatchCta').value.trim()}]);
      $('pbBatchPrompt').value=batchPrompt(c,input,getCatalog());
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
        const result=compileBatch(c,{[sign]:entry},{[sign]:parsed[sign]},[sign],getCatalog());
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
    return compileBatch(c,entries,batchResponses,batchSelection(),getCatalog());
  }
  $('pbBatchCheck').onclick=()=>{try{
    const m=manifest(), minutes=Number($('pbBatchMinutes').value);
    if($('pbBatchMinutes').value&&(minutes<1||!Number.isInteger(minutes)))throw Error('1本目の制作時間は1分以上の整数で入力してください');
    status(`${m.videos.length}本を確認しました。AI読み上げは${m.videos.length}回実行されます。${minutes?`過去の実績から制作時間は約${minutes*m.videos.length}分＋準備時間です。`:''} 一括制作ボタンで開始します。`);
  }catch(e){status(e.message);}};
  $('pbBatchReset').onclick=()=>{
    if(!window.confirm('12星座の入力内容と保存済みの下書きを消して、最初からやり直しますか？'))return;
    batchResponses={};batchRequested=[];
    $('pbBatchYear').value=new Date().getFullYear();
    $('pbBatchMonth').value=String(new Date().getMonth()+1);
    $('pbBatchPeriod').value='full';
    for(const id of ['pbBatchCta','pbBatchSourcePrompt','pbBatchSource','pbBatchPrompt','pbBatchResponse','pbBatchMinutes'])$(id).value='';
    $('pbBatchSourceWarnings').textContent='';
    for(const d of batchBox.querySelectorAll('details')){
      const sign=d.dataset.sign;
      batchEntries[sign]={cards:['','','',''],orientations:['upright','upright','upright','upright'],narration:'',cta:''};
      d.querySelectorAll('select').forEach((input,i)=>input.value=i%2?'upright':'');
      d.querySelector('textarea').value='';
      d.querySelector('input[maxlength]').value='';
      d.querySelector('.batch-select').checked=true;
      d.open=false;
    }
    batchChanged();
    localStorage.removeItem(BATCH_DRAFT);
    status('12星座の入力と保存済みの下書きを消しました。最初から入力できます。');
  };
  $('pbBatchGenerate').onclick=()=>window.videoStudioSubmitBatch?.();
  try{
    const draft=JSON.parse(localStorage.getItem(BATCH_DRAFT)||'null');
    if(draft?.repo===$('repo').value.trim()&&draft.entries){
      for(const id of ['year','month','period','cta']) $('pbBatch'+id[0].toUpperCase()+id.slice(1)).value=draft[id]??'';
      batchResponses=draft.responses||{};
      for(const d of batchBox.querySelectorAll('details')){
        const sign=d.dataset.sign, e=draft.entries[sign];if(!e)continue;
        batchEntries[sign]={cards:e.cards||['','','',''],orientations:e.orientations||['upright','upright','upright','upright'],narration:e.narration||'',cta:e.cta||'',...(e.social?{social:e.social}:{})};
        d.querySelectorAll('select').forEach((input,i)=>input.value=i%2?batchEntries[sign].orientations[(i-1)/2]:batchEntries[sign].cards[i/2]);
        d.querySelector('textarea').value=batchEntries[sign].narration;
        d.querySelector('input[maxlength]').value=batchEntries[sign].cta;
        d.querySelector('.batch-select').checked=draft.selected?.includes(sign)??true;
      }
      batchChanged();
    }
  }catch{}
  return {changed:batchChanged,manifest};
}
