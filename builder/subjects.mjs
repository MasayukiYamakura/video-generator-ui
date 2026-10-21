// Stable target IDs. `zodiac` remains the legacy wire slot for a target ID;
// subject_kind distinguishes the MBTI catalog without changing old JSON.
export const MBTI_NAMES={'intj':'INTJ（建築家）', 'intp':'INTP（論理学者）', 'entj':'ENTJ（指揮官）', 'entp':'ENTP（討論者）', 'infj':'INFJ（提唱者）', 'infp':'INFP（仲介者）', 'enfj':'ENFJ（主人公）', 'enfp':'ENFP（運動家）', 'istj':'ISTJ（管理者）', 'isfj':'ISFJ（擁護者）', 'estj':'ESTJ（幹部）', 'esfj':'ESFJ（領事）', 'istp':'ISTP（巨匠）', 'isfp':'ISFP（冒険家）', 'estp':'ESTP（起業家）', 'esfp':'ESFP（エンターテイナー）'};
export const ZODIAC_NAMES={aries:'牡羊座',taurus:'牡牛座',gemini:'双子座',cancer:'蟹座',leo:'獅子座',virgo:'乙女座',libra:'天秤座',scorpio:'蠍座',sagittarius:'射手座',capricorn:'山羊座',aquarius:'水瓶座',pisces:'魚座'};
export const CAPTION_NAMES={aries:'おひつじ座',taurus:'おうし座',gemini:'ふたご座',cancer:'かに座',leo:'しし座',virgo:'おとめ座',libra:'てんびん座',scorpio:'さそり座',sagittarius:'いて座',capricorn:'やぎ座',aquarius:'みずがめ座',pisces:'うお座',...MBTI_NAMES};
export function subjectKind(value) {
 const kind=typeof value==='string'?value:value?.video?.tarot_subject??value?.subject_kind??'zodiac';
 if(!['zodiac','mbti'].includes(kind))throw Error('対象の種類が不正です');return kind;
}
export const subjects=value=>subjectKind(value)==='mbti'?MBTI_NAMES:ZODIAC_NAMES;
export const subjectMeta=value=>subjectKind(value)==='mbti'?{subject_kind:'mbti'}:{};

