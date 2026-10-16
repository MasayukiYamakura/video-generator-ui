export const LINE_CTA='占い無料鑑定・無料コーチングはプロフィールの公式LINEから！';
export const ZODIAC_TAGS={aries:'牡羊座',taurus:'牡牛座',gemini:'双子座',cancer:'蟹座',leo:'獅子座',virgo:'乙女座',libra:'天秤座',scorpio:'蠍座',sagittarius:'射手座',capricorn:'山羊座',aquarius:'水瓶座',pisces:'魚座'};
export function normalizeSocial(value,zodiac){
 if(value===undefined||value===null)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||(zodiac!==undefined&&!ZODIAC_TAGS[zodiac]))throw Error('投稿情報の形式が不正です');
 const description=value.description;
 if(typeof description!=='string'||!description.trim()||Array.from(description).length>500||/[#＃]/u.test(description)||description.includes(LINE_CTA))throw Error('投稿説明文はハッシュタグ・LINE誘導文を含めず1〜500文字にしてください');
 const required=['#大阪','#占い',...(zodiac?['#'+ZODIAC_TAGS[zodiac]]:[])];
 const relatedCount=5-required.length;
 if(!Array.isArray(value.hashtags)||![relatedCount,5].includes(value.hashtags.length)||value.hashtags.some(t=>typeof t!=='string'||!/^#[\p{L}\p{N}_]{1,40}$/u.test(t)))throw Error('関連ハッシュタグを重複なく2個指定してください');
 const tags=value.hashtags.length===relatedCount?[...required,...value.hashtags]:[...value.hashtags];
 if(new Set(tags).size!==5||required.some((t,i)=>tags[i]!==t))throw Error(`必須タグ${required.length}個と関連タグ${relatedCount}個を重複なく指定してください`);
 return {description:description.trim(),hashtags:tags};
}
export function socialBody(value,zodiac,fallback=''){
 const social=normalizeSocial(value,zodiac);
 return social?[social.description,LINE_CTA,social.hashtags.join(' ')].join('\n\n'):fallback;
}
