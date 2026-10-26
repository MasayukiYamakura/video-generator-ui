import {ANIMATIONS,SPRINGS} from './core.mjs';
export const MOTION_DEFAULTS={motion_enabled:false,motion_mode:'ai_hybrid',motion_intensity:'standard',motion_unit:'phrase',motion_animation:'fade',motion_emphasis:'pop',motion_duration_ms:300,motion_frequency:8,motion_scale:1.15,motion_direction:'up',motion_sync:true,motion_offset_ms:0,motion_physics:true,motion_spring:'smooth'};
export const MOTION_FIELDS=[
 ['motion_enabled','モーション演出（OFFで安定版）'],
 ['motion_mode','演出モード',[['manual','手動固定'],['ai_hybrid','AI＋手動'],['ai_auto','AI自動']]],
 ['motion_intensity','演出の強さ',[['subtle','控えめ'],['standard','標準'],['dynamic','ダイナミック']]],
 ['motion_animation','字幕の基本動作',ANIMATIONS.map((a,i)=>[a,['フェード','スライド','ポップ','バウンス','タイプライター','発声中ハイライト','パンチ','スタッガー'][i]])],
 ['motion_emphasis','強調字幕の動作',ANIMATIONS.map(a=>[a,a])],
 ['motion_sync','音声同期（失敗箇所は従来字幕）'],
 ['motion_physics','物理演算'],['motion_spring','動きのプリセット',Object.keys(SPRINGS).map((a,i)=>[a,['ソフト','スムーズ','バウンス','エネルギッシュ','クイック'][i]])],
 ['motion_unit','表示単位',[['sentence','文章'],['phrase','文節'],['character','文字']]],
 ['motion_duration_ms','動作時間（100〜1500ms）',null,'number'],['motion_frequency','強調上限（0〜30回／分）',null,'number'],['motion_scale','強調最大倍率（1〜1.5）',null,'number'],['motion_offset_ms','同期補正（-500〜500ms）',null,'number'],
 ['motion_direction','スライド方向',[['up','下から'],['down','上から'],['left','右から'],['right','左から']]],
];
export function validateMotionValues(v){
 const enums={motion_mode:['manual','ai_hybrid','ai_auto'],motion_intensity:['subtle','standard','dynamic'],motion_unit:['sentence','phrase','character'],motion_animation:ANIMATIONS,motion_emphasis:ANIMATIONS,motion_direction:['up','down','left','right'],motion_spring:Object.keys(SPRINGS)};
 for(const [key,allowed] of Object.entries(enums))if(Object.hasOwn(v,key)&&!allowed.includes(v[key]))throw Error(`${key}が不正です`);
 for(const [key,lo,hi] of [['motion_duration_ms',100,1500],['motion_frequency',0,30],['motion_scale',1,1.5],['motion_offset_ms',-500,500]])if(Object.hasOwn(v,key)&&(!Number.isFinite(v[key])||v[key]<lo||v[key]>hi))throw Error(`${key}は${lo}〜${hi}です`);
}
export function motionSettings(video){
 const v={...MOTION_DEFAULTS,...video};validateMotionValues(v);
 return {version:1,enabled:v.motion_enabled,mode:v.motion_mode,intensity:v.motion_intensity,caption:{unit:v.motion_unit,default_animation:v.motion_animation,emphasis_animation:v.motion_emphasis,duration_ms:v.motion_duration_ms,max_emphasis_per_minute:v.motion_frequency,max_scale:v.motion_scale,direction:v.motion_direction},audio_sync:{enabled:v.motion_sync,offset_ms:v.motion_offset_ms,fallback:'legacy'},physics:{enabled:v.motion_physics,preset:v.motion_spring,targets:['hook','caption','heading','card','cta','icon']}};
}
