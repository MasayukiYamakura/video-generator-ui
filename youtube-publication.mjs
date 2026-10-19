import {jstInput,utcFromJst} from './social.mjs?v=mbti-20261019';
export {jstInput};
export const REMOTE_LABEL={private_ready:'非公開・処理完了（公開設定を確認できます）',processing:'YouTubeで動画処理中',scheduled:'予約公開を確認済み',overdue:'予約時刻経過・公開未確認',published:'公開済みを確認済み',unlisted:'限定公開を確認済み',failed:'YouTubeで処理失敗・拒否',unavailable:'動画の状態を確認できません',needs_review:'状態の手動確認が必要です'};
export const PUBLICATION_LABEL={unknown:'公開設定の変更結果が不明・再送保留',needs_review:'確認した設定と一致しません・再送保留',rejected:'設定変更は拒否されました。原因を直して新しい内容確認が必要です',scheduled:'予約公開を確認済み',overdue:'予約時刻経過・公開未確認',published:'公開済みを確認済み',unlisted:'限定公開を確認済み'};
export function dueLabel(value){return value?new Date(value).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）':'';}
export function publicationReview(post,channel,{visibility,due,reviewed},clock=Date.now()){
 if(!post?.can_publish||!post.remote?.etag||!post.video_id||post.channel_id!==channel?.id||!channel?.can_update)throw Error('処理完了した未公開動画を、更新権限のあるチャンネルで確認してください');
 if(reviewed!==true)throw Error('先にYouTube Studioで非公開動画を再生し、内容を確認してください');
 if(!['public','unlisted','scheduled'].includes(visibility))throw Error('公開・限定公開・予約公開を選択してください');
 let publish_at=null;
 if(visibility==='scheduled'){
  publish_at=utcFromJst(due);
  if(jstInput(publish_at)!==due||Date.parse(publish_at)<=clock+2*60000)throw Error('予約は現在から2分より先の正しい日本時間で指定してください');
 }
 return {action:'publish',confirmed:true,reviewed_video:true,source_id:post.source_id,video_id:post.video_id,
         channel_id:channel.id,etag:post.remote.etag,visibility,...(publish_at?{publish_at}:{})};
}
