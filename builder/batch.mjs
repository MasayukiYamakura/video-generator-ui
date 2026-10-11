import {TAROT_CARDS} from './tarot-cards.mjs';
import {TAROT_SIGNS, applyConfig, tarotTitle, availableCategories} from './compiler.mjs';

export const SIGNS=Object.entries(TAROT_SIGNS);
export const POSITIONS=['overall','relationships','work','advice'];
const cardIds=new Set(TAROT_CARDS.map(card=>card.id));
export function batchConfig(shared, zodiac, entry) {
  if(!Number.isInteger(entry.year)||entry.year<2000||entry.year>2100
    ||!Number.isInteger(entry.month)||entry.month<1||entry.month>12
    ||!['full','first','second'].includes(entry.period))throw Error('占う年・月・期間を確認してください');
  const cards=POSITIONS.map((position,index)=>({position,card_id:entry.cards[index],orientation:entry.orientations?.[index] ?? 'upright'}));
  if(cards.some(card=>!cardIds.has(card.card_id))||new Set(cards.map(card=>card.card_id)).size!==4)
    throw Error(`${TAROT_SIGNS[zodiac]}のカードを重複なく4枚選んでください`);
  if(cards.some(card=>!['upright','reversed'].includes(card.orientation)))
    throw Error(`${TAROT_SIGNS[zodiac]}のカードの向きを確認してください`);
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
    return {zodiac,title:tarotTitle(config.tarot),cards:config.tarot.cards,
      narration:entry.narration,cta:shared.video.cta_enabled?config.cta_text:null};
  });
  const aiBgm=shared.video.bgm_mode==='ai';
  if(aiBgm&&!availableCategories(bgmCatalog).length)throw Error('AIでBGMを選ぶには登録一覧を読み込んでください');
  return [
    '月間星座タロット動画のscene JSONを、次の各星座について独立して作成してください。',
    'JSONのみ出力。説明・Markdown・コードフェンスは不要。形式: {"videos":[{"zodiac":"aries","scenes":[...]},...]}。BGMをAIが選ぶ場合は各videoにbgm_categoryも付ける。',
    '【全星座共通ルール】',
    '人間が確定したカードIDと正逆（orientation: upright=正位置, reversed=逆位置）・原稿・CTA・タイトルは変更しない。星座間で内容を混ぜない。入力の順番で全件を1度ずつ出し、指定外の星座を追加しない。カード情報は出力不要で、画面の選択値を映像に適用する。',
    '各scenes[].tarot_phaseは intro→overall→relationships→work→advice→（任意でsummary）'+(shared.video.cta_enabled?'→cta（最後に1scene）':'。ctaは出力しない')+'。intro〜adviceにはそれぞれ1scene以上を割り当て、同じ役割は複数sceneでもよい。空sceneは出力しない。',
    'ナレーションの語句を変更・要約・追加せず、scenesのtextを順に結合した内容が原稿と一致するように意味のまとまりで分割する。改行はJSON文字列中の\\nで維持。speech_text、start_time、end_timeは出力しない。',
    'introのhook_textには指定のtitleを改行を含めて完全一致で入れる。introの読み上げtextをtitleで置き換えない。',
    shared.video.cta_enabled?'ctaは最後の1sceneだけ。textは指定されたctaと完全一致させ、[[ ]]装飾、speech_text、情景映像を付けず、他のsceneと重複させない。':'CTAは作らない。',
    'introに情景映像を付けない。本編に必要なら tarot_visual:"scenery", media_type:"pexels" または "pixabay", media_query:英語の具体的な検索語 を付ける。',
    aiBgm?'各星座のBGMカテゴリは登録済みの '+availableCategories(bgmCatalog).join(' / ')+' から選び、bgm_categoryに入れる。':'BGM設定は画面で確定するため出力不要。',
    '途中で全件を返せない場合は完成した星座のみを、必ず閉じた有効なJSONとして返す。不足分は別の依頼で作成する。',
    '【星座別の確定データ】',
    JSON.stringify(tasks,null,2),
  ].join('\n\n');
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
  let data;
  try{data=JSON.parse(text);}
  catch{throw Error('AI回答が途中で切れたか、JSONが不正です。AIに有効なJSONとして再出力させてください');}
  if(!Array.isArray(data.videos)||!data.videos.length||data.videos.length>requested.length)throw Error('AI回答の星座数が不正です');
  const found={};
  for(const video of data.videos) {
    if(!video||!requested.includes(video.zodiac)||found[video.zodiac]||!Array.isArray(video.scenes))
      throw Error('AI回答の星座・scenesが不正です');
    found[video.zodiac]=video;
  }
  return found;
}
