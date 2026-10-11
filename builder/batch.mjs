import {TAROT_CARDS} from './tarot-cards.mjs';
import {TAROT_SIGNS, applyConfig, tarotTitle} from './compiler.mjs';
import {buildPrompt} from './prompt.mjs';

export const SIGNS=Object.entries(TAROT_SIGNS);
export const POSITIONS=['overall','relationships','work','advice'];
const cardIds=new Set(TAROT_CARDS.map(card=>card.id));
export function batchConfig(shared, zodiac, entry) {
  if(!Number.isInteger(entry.year)||entry.year<2000||entry.year>2100
    ||!Number.isInteger(entry.month)||entry.month<1||entry.month>12
    ||!['full','first','second'].includes(entry.period))throw Error('占う年・月・期間を確認してください');
  const cards=POSITIONS.map((position,index)=>({position,card_id:entry.cards[index]}));
  if(cards.some(card=>!cardIds.has(card.card_id))||new Set(cards.map(card=>card.card_id)).size!==4)
    throw Error(`${TAROT_SIGNS[zodiac]}のカードを重複なく4枚選んでください`);
  const c=structuredClone(shared);
  c.tarot={year:entry.year,month:entry.month,period:entry.period,zodiac,cards};
  c.cta_text=entry.cta || entry.sharedCta;
  if(c.video.cta_enabled&&(!c.cta_text||Array.from(c.cta_text).length>40))
    throw Error(`${TAROT_SIGNS[zodiac]}のCTAは1〜40文字にしてください`);
  return c;
}
export function batchPrompt(shared, entries, bgmCatalog) {
  const tasks=entries.map(([zodiac,entry])=>{
    if(!entry.narration.trim())throw Error(`${TAROT_SIGNS[zodiac]}のナレーション原稿を入力してください`);
    const config=batchConfig(shared,zodiac,entry);
    return {zodiac,title:tarotTitle(config.tarot),instruction:buildPrompt(config,entry.narration,bgmCatalog,'content')};
  });
  return ['以下の各星座を独立した動画として処理し、JSONのみ返してください。',
    '結果は {"videos":[{"zodiac":"aries","scenes":[...]},...]}。各zodiacを一度ずつ、指定順に出力。入力されていない星座を追加しない。',
    '各instructionの原稿・カード・タイトル・CTAを他の星座へ混ぜない。説明、Markdown、コードフェンスは不要。',
    JSON.stringify(tasks,null,2)].join('\n\n');
}
function plain(text) {return text.replaceAll('[[','').replaceAll(']]','').replace(/\s/g,'');}
export function compileBatch(shared, entries, responses, selected, bgmCatalog) {
  if(!selected.length||selected.some(sign=>!TAROT_SIGNS[sign])||new Set(selected).size!==selected.length)
    throw Error('制作する星座を選択してください');
  if(shared.video.voice_mode!=='tts'||shared.video.tarot_renderer!=='remotion'||shared.video.template!=='tarot_monthly')
    throw Error('一括制作にはRemotion版とAI読み上げを指定してください');
  const videos=selected.map(zodiac=>{
    const entry=entries[zodiac], response=responses[zodiac];
    if(!entry?.narration?.trim())throw Error(`${TAROT_SIGNS[zodiac]}の原稿がありません`);
    if(!response)throw Error(`${TAROT_SIGNS[zodiac]}のAI出力を取り込んでください`);
    const config=batchConfig(shared,zodiac,entry);
    const script=applyConfig(response,config,bgmCatalog);
    const spoken=script.scenes.filter(s=>s.tarot_phase!=='cta').map(s=>s.text).join('');
    if(plain(spoken)!==plain(entry.narration))throw Error(`${TAROT_SIGNS[zodiac]}の原稿とシーンの読み上げ文が一致しません`);
    if(script.scenes.some(s=>s.speech_text!==undefined))throw Error(`${TAROT_SIGNS[zodiac]}のspeech_textは一括制作で使えません`);
    return {zodiac,script};
  });
  const size=new TextEncoder().encode(JSON.stringify({version:1,videos})).length;
  if(size>1024*1024)throw Error('一括入力は1 MiBまでです');
  return {version:1,videos};
}
export function importBatch(text, requested) {
  if(new TextEncoder().encode(text).length>1024*1024)throw Error('AIの回答は1 MiBまでです');
  const data=JSON.parse(text);
  if(!Array.isArray(data.videos)||data.videos.length!==requested.length)throw Error('AI回答の星座数が指定数と違います');
  const found={};
  for(const video of data.videos) {
    if(!video||!requested.includes(video.zodiac)||found[video.zodiac]||!Array.isArray(video.scenes))
      throw Error('AI回答の星座・scenesが不正です');
    found[video.zodiac]=video;
  }
  if(requested.some(sign=>!found[sign]))throw Error('AI回答に不足している星座があります');
  return found;
}
