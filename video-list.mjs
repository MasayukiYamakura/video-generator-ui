export function generatedTime(video){
 const value=video.generated_at;
 if(!value||!Number.isFinite(Date.parse(value)))return '生成日時不明';
 return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
}
export function identity(video){return `${generatedTime(video)}（日本時間） ／ 実行ID：${video.run_id||'不明'} ／ 動画ID：${video.id}`;}
export function matches(video,query){return `${video.filename||''} ${video.id||''} ${video.run_id||''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());}
export function newest(videos){return Object.values(videos||{}).reverse().sort((a,b)=>(Date.parse(b.generated_at)||0)-(Date.parse(a.generated_at)||0));}
export function youtubeGroup(video,uploads){
 if(video.archived_at)return 'archived';
 if(Object.values(uploads||{}).some(p=>p.source_id===video.id))return 'sent';
 if(video.expires_at&&Date.parse(video.expires_at)<=Date.now())return 'expired';
 return 'active';
}
export function sourceLink(video,repo){
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo)||!/^\d+$/.test(String(video.run_id||'')))return null;
 return `https://github.com/${repo}/actions/runs/${video.run_id}${/^\d+$/.test(String(video.artifact_id||''))?`/artifacts/${video.artifact_id}`:''}`;
}
export function previewLink(video){
 try{const url=new URL(video.cloud?.url);return url.protocol==='https:'&&url.hostname==='res.cloudinary.com'?url.href:null;}catch{return null;}
}
