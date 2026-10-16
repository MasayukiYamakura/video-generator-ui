import {TAROT_CARDS} from './tarot-cards.mjs';
import {TAROT_SIGNS, applyConfig, tarotTitle, availableCategories} from './compiler.mjs?v=maintenance-20261016';

export const SIGNS=Object.entries(TAROT_SIGNS);
export const POSITIONS=['overall','relationships','work','advice'];
export const CTA_PHRASES=['コメントで感想教えてね','見返せるように保存しておいてね','動画がいいなと思った方はフォローしてね'];
const cardIds=new Set(TAROT_CARDS.map(card=>card.id));
const cardNames=new Map(TAROT_CARDS.map(card=>[card.id,card.name]));
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
    'JSONのキーと文字列を囲む引用符は、必ずASCII半角のダブルクォート "（U+0022）を使う。“ ” ＂ などの装飾引用符に置き換えない。出力前にJSONとして解析可能か確認する。',
    'JSONのみ出力。説明・Markdown・コードフェンスは不要。形式: {"videos":[{"zodiac":"aries","cards":[{"position":"overall","card_id":"...","orientation":"upright"},...],"scenes":[...]},...]}。cardsは確定データの4枚を順序・ID・orientationを変えずに写す。BGMをAIが選ぶ場合は各videoにbgm_categoryも付ける。',
    '【全星座共通ルール】',
    '人間が確定したカードIDと正逆（orientation: upright=正位置, reversed=逆位置）・原稿・CTA・タイトルは変更しない。星座間で内容を混ぜない。入力の順番で全件を1度ずつ出し、指定外の星座を追加しない。cardsは出力形式どおり確定値を変更せず写す。映像には画面の選択値を適用する。',
    '各scenes[].tarot_phaseは intro→overall→relationships→work→advice→（任意でsummary）'+(shared.video.cta_enabled?'→cta（最後に1scene）':'。ctaは出力しない')+'。intro〜adviceにはそれぞれ1scene以上を割り当て、同じ役割は複数sceneでもよい。空sceneは出力しない。',
    'ナレーションの語句を変更・要約・追加せず、scenesのtextを順に結合した内容が原稿と一致するように意味のまとまりで分割する。画面で確定する字幕では星座名をひらがな（例: おうし座、いて座）で表示し、読み上げの言葉は変更しない。改行はJSON文字列中の\\nで維持。speech_text、start_time、end_timeは出力しない。',
    'introのhook_textには指定のtitleを改行を含めて完全一致で入れる。introの読み上げtextをtitleで置き換えない。',
    shared.video.cta_enabled?'ctaは最後の1sceneだけ。textは指定されたctaと完全一致させ、[[ ]]装飾、speech_text、情景映像を付けず、他のsceneと重複させない。':'CTAは作らない。',
    'introとctaに情景映像を付けない。overall, relationships, work, adviceの各役割で少なくとも1sceneに tarot_visual:"scenery", media_type:"pexels" または "pixabay", media_query:原稿に合う英語の具体的な検索語 を付ける。カードを表に返してから情景映像へ切り替える。1役割が1sceneだけでもよい。',
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
    const spoken=script.scenes.filter(s=>s.tarot_phase!=='cta').map(s=>s.speech_text??s.text).join('');
    if(plain(spoken)!==plain(entry.narration))throw Error(`${TAROT_SIGNS[zodiac]}の原稿とシーンの読み上げ文が一致しません`);
    if(response.scenes.some(s=>s.speech_text!==undefined))throw Error(`${TAROT_SIGNS[zodiac]}のAI回答にspeech_textは指定しないでください`);
    return {zodiac,script};
  });
  const size=new TextEncoder().encode(JSON.stringify({version:1,videos})).length;
  if(size>1024*1024)throw Error('一括入力は1 MiBまでです');
  return {version:1,videos};
}
export function importBatch(text, requested, entries=null) {
  if(new TextEncoder().encode(text).length>1024*1024)throw Error('AIの回答は1 MiBまでです');
  let data;
  try{data=JSON.parse(text);}
  catch{throw Error('AI回答が途中で切れたか、JSONが不正です。AIに有効なJSONとして再出力させてください');}
  if(!Array.isArray(data.videos)||!data.videos.length||data.videos.length>requested.length)throw Error('AI回答の星座数が不正です');
  const found={};
  for(const video of data.videos) {
    if(!video||!requested.includes(video.zodiac)||found[video.zodiac]||!Array.isArray(video.scenes))
      throw Error('AI回答の星座・scenesが不正です');
    if(entries) {
      const entry=entries[video.zodiac];
      if(!entry||!Array.isArray(video.cards)||video.cards.length!==4||video.cards.some((card,i)=>
        card?.position!==POSITIONS[i]||card.card_id!==entry.cards[i]||card.orientation!==(entry.orientations?.[i]??'upright')))
        throw Error(`${TAROT_SIGNS[video.zodiac]}のAI回答のカード・正逆が画面設定と一致しません`);
    }
    found[video.zodiac]=video;
  }
  return found;
}

const aliases = [
  [/恋人たち/,'恋人'],
  [/ペンタクルス/,'ペンタクル'],
  [/のACE/,'のエース'],
];
function narrationWarnings(text, sign, period) {
  const warnings=[];
  for (const [pattern, official] of aliases) if(pattern.test(text))
    warnings.push(`${sign}：原稿中に「${pattern.source}」があります。カード名の正式表記は「${official}」です（原稿は変更しません）。`);
  if(text.includes('恋人たちアカード')||text.includes('優しい優しさ')) warnings.push(`${sign}：原稿に不自然な表現があります。読み上げ前に確認してください。`);
  const expected=`${period.year}年${period.month}月${period.period==='full'?'':period.period==='first'?'前半':'後半'}`;
  if(!text.includes(expected)) warnings.push(`${sign}：原稿に対象期間「${expected}」が見つかりません。読み上げ内容を確認してください。`);
  return warnings;
}
// This is a source-data import. The existing importBatch handles the later scenes response.
export function importBatchSource(text) {
  if(new TextEncoder().encode(text).length>1024*1024)throw Error('占い結果JSONは1 MiBまでです');
  let data;
  try{data=JSON.parse(text);}
  catch{throw Error('占い結果JSONが不正です。JSONのみを貼り付けてください');}
  if(data?.version!==1||!Number.isInteger(data.year)||data.year<2000||data.year>2100
    ||!Number.isInteger(data.month)||data.month<1||data.month>12
    ||!['full','first','second'].includes(data.period)
    ||!Array.isArray(data.videos)||data.videos.length!==SIGNS.length)
    throw Error('年・月・対象期間、または12星座の件数が不正です');
  const found={}, warnings=[];
  for(const video of data.videos){
    if(!video||!TAROT_SIGNS[video.zodiac]||found[video.zodiac])
      throw Error('星座に重複または不明なIDがあります');
    const sign=TAROT_SIGNS[video.zodiac];
    if(!Array.isArray(video.cards)||video.cards.length!==4)
      throw Error(`${sign}：カードは4枚必要です`);
    const cards=[],orientations=[];
    for(const [i,position] of POSITIONS.entries()){
      const card=video.cards[i];
      if(card?.position!==position)throw Error(`${sign}：${i+1}枚目の位置が不正です（${position}）`);
      const official=cardNames.get(card.card_id);
      if(!official)throw Error(`${sign}：${i+1}枚目のカードID「${card.card_id}」は一覧にありません`);
      if(card.name!==official)throw Error(`${sign}：${i+1}枚目は「${card.name}」ではなく「${official}」を指定してください（${card.card_id}）`);
      if(!['upright','reversed'].includes(card.orientation))
        throw Error(`${sign}：${i+1}枚目の向きはuprightまたはreversedにしてください`);
      cards.push(card.card_id); orientations.push(card.orientation);
    }
    if(new Set(cards).size!==4)throw Error(`${sign}：同じカードを複数回使えません`);
    if(typeof video.narration!=='string'||!video.narration.trim())
      throw Error(`${sign}：ナレーション原稿がありません`);
    if(typeof video.cta!=='string'||Array.from(video.cta).length>40)
      throw Error(`${sign}：個別CTAは空欄または40文字以内にしてください`);
    found[video.zodiac]={cards,orientations,narration:video.narration,cta:video.cta};
    warnings.push(...narrationWarnings(video.narration,sign,data));
    if(video.cta.trim()&&video.narration.trim().endsWith(video.cta.trim())) warnings.push(`${sign}：CTA文が原稿末尾にもあります。二重読み上げにならないか確認してください。`);
  }
  return {year:data.year,month:data.month,period:data.period,entries:found,warnings};
}
export function batchSourcePrompt(year,month,period,ctaEnabled=false,sharedCta='') {
  if(!Number.isInteger(year)||year<2000||year>2100||!Number.isInteger(month)||month<1||month>12
    ||!['full','first','second'].includes(period))throw Error('占う年・月・対象期間を確認してください');
  return [
    '次の12星座の占い結果を、画面への一括入力用JSONとして作成してください。JSONのみ。Markdown・説明・省略は不要。',
    'JSONのキーと文字列を囲む引用符は、必ずASCII半角のダブルクォート "（U+0022）を使う。“ ” ＂ などの装飾引用符に置き換えない。出力前にJSONとして解析可能か確認する。',
    `共通設定: year=${year}, month=${month}, period=${period} (full=月全体, first=前半, second=後半)。`,
    `形式: {"version":1,"year":${year},"month":${month},"period":"${period}","videos":[{"zodiac":"aries","cards":[{"position":"overall","card_id":"major-00-fool","name":"愚者","orientation":"upright"},{"position":"relationships","card_id":"major-06-lovers","name":"恋人","orientation":"upright"},{"position":"work","card_id":"wands-01","name":"ワンドのエース","orientation":"upright"},{"position":"advice","card_id":"major-09-hermit","name":"隠者","orientation":"reversed"}],"narration":"CTAを含まない全文","cta":""}]}。`,
    '上記は1星座分の形式例です。実際は12星座をvideosへ入れ、確定した占い結果を使用してください。カードIDとnameは必ず次の正式な一覧の同じ行を使い、正逆はuprightまたはreversed。各星座内でカードの重複は不可。',
    '星座IDは '+SIGNS.map(([id,name])=>`${id}=${name}`).join(', ')+' を各1件ずつ。カード位置はoverall, relationships, work, adviceの順。原稿の言葉は省略・要約せず全文をJSON文字列に入れ、CTA文を原稿に重複させない。個別CTAが不要なら空文字にする（画面の共通CTAを使用）。',
    '各星座についてライダー版タロット78枚から全体運・恋愛／対人・仕事／行動・アドバイスに1枚ずつ引き、正位置か逆位置かも決める。各星座内の4枚は重複させない。カード名は一覧の正式名称を使い、原稿内でも同じ名称にする。',
    `各星座のナレーションは${year}年${month}月${{full:'全体',first:'前半',second:'後半'}[period]}と星座名が冒頭で分かる自然な日本語にする。全体運を結論として、恋愛・対人、仕事・行動、最後のアドバイスへ進める。4枚のカード名を該当する話の中で自然に読み上げ、選んだカードと向きに矛盾させない。書かれていない出来事や結果を断定せず、「必ず」「絶対」を避け、聞き手が生活に置き換えられる具体的で温かい言葉にする。最後に対象期間中に試せる行動を一つ示す。星座名は字幕に使うため、ひらがな表記（おひつじ座、おうし座、ふたご座、かに座、しし座、おとめ座、てんびん座、さそり座、いて座、やぎ座、みずがめ座、うお座）で書く。見出し・秒数・演出指示・絵文字は原稿に入れない。`,
    '本編とCTAを合わせて約60秒、合計約250〜300字を目安にする。字数より自然な読み上げを優先する。',
    ctaEnabled
      ? (sharedCta.trim()
        ? `CTAはON。共通CTA文は「${sharedCta.trim()}」。各videoのctaは空文字にし、画面の共通CTAを使う。指定文を一字一句変えず本編の後に読み上げるため、narrationには含めない。`
        : `CTAはON。共通CTA文が空欄なので、各videoのctaには次の定型文から1つだけ一字一句そのまま入れる。新しい文や星座名を足さない。narrationには含めない。星座の入力順に3文を繰り返す: ${CTA_PHRASES.map((phrase,index)=>`${index+1}.「${phrase}」`).join(' / ')}。`)
      : 'CTAはOFF。各videoのctaは空文字にし、narrationにもCTAを入れない。',
    'カード一覧: '+TAROT_CARDS.map(card=>`${card.id}=${card.name}`).join(', '),
  ].join('\n\n');
}

