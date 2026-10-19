import {TAROT_SIGNS as SIGN_NAMES} from './compiler.mjs?v=tarot-brand-20261019';
import {TAROT_CARDS} from './tarot-cards.mjs';
import {el,options} from './dom.mjs?v=maintenance-20261016';
const $=id=>document.getElementById(id);
const TAROT_SIGNS=Object.entries(SIGN_NAMES);
export const TAROT_POSITIONS=[['overall','① 全体運'],['relationships','② 恋愛・対人'],['work','③ 仕事・行動'],['advice','④ アドバイス']];
export function mountSingleEditor(onChange) {
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
  function configured(c) {
    if(c.video.template==='tarot_monthly') {
      c.tarot=tarotData();
      c.cta_text=$('pbTarotCtaText').value.trim();
      if(c.video.cta_enabled&&(!c.cta_text||Array.from(c.cta_text).length>40))throw Error('CTA文は1〜40文字で入力してください');
    }
    return c;
  }
  options($('pbTarotMonth'),Array.from({length:12},(_,i)=>[String(i+1),`${i+1}月`]),String(new Date().getMonth()+1));
  options($('pbTarotZodiac'),TAROT_SIGNS,'sagittarius');
  $('pbTarotYear').value=new Date().getFullYear();
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
    card.addEventListener('change',onChange);
    orientation.addEventListener('change',onChange);
  }
  $('pbTarotCtaText').addEventListener('input',onChange);
  for(const id of ['pbTarotYear','pbTarotMonth','pbTarotPeriod','pbTarotZodiac'])$(id).addEventListener('change',onChange);
  return {data:tarotData,configured};
}

