// Stage 1 is a private draft editor only. There is no publish/schedule action.
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const decode=content=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
export function draftValue(fields, current=null){
 const value={...(current?{id:current.id,revision:current.revision}:{}),name:fields.name.value,
  service:fields.service.value,kind:fields.kind.value,body:fields.body.value,
  source_video_id:fields.source.value||null,link_url:fields.kind.value==='link'?fields.link.value:null,
  due_at:fields.due.value?new Date(fields.due.value+':00+09:00').toISOString():null};
 if(!value.name.trim()||value.name.length>100)throw Error('管理名を1〜100文字で入力してください');
 if(value.body.length>20000||(['text','link'].includes(value.kind)&&!value.body.trim()))throw Error('本文を確認してください');
 if(value.kind==='video'&&!value.source_video_id)throw Error('利用可能な元動画を選択してください');
 if(value.kind==='link'&&!/^https:\/\/[^\s<>]+$/.test(value.link_url||''))throw Error('httpsのリンクを入力してください');
 return value;
}
export function mountPostingFoundation(){
 const host=document.getElementById('postingSettings');if(!host)return;
 const adapter=window.postingAdapters.social;
 const section=el('details');section.id='postingFoundation';
 section.append(el('summary','新しい投稿下書き（準備機能）'));
 const status=el('p');status.id='foundationStatus';status.setAttribute('role','status');
 const form=el('div');form.id='foundationForm';form.hidden=true;
 section.append(status,form);host.append(section);
 const note=el('p','X・Threads用の原稿を保存する準備機能です。この画面からSNSへの送信・予約は行いません。希望日時も下書きです。');form.append(note);
 const fields={};
 function field(key,label,tag='input',options=null){const l=el('label',label),n=el(tag);n.id='foundation-'+key;
  if(options)for(const [value,text] of options){const o=el('option',text);o.value=value;n.append(o);}
  l.append(n);form.append(l);fields[key]=n;return n;}
 field('name','管理名');fields.name.maxLength=100;
 field('service','投稿先','select',[['x','X'],['threads','Threads']]);
 field('kind','投稿形式','select',[['text','文章'],['video','動画＋文章'],['image','画像＋文章（素材添付は今後対応）'],['link','リンク紹介']]);
 field('body','本文','textarea');fields.body.rows=5;fields.body.maxLength=20000;
 const count=el('p');form.append(count);fields.body.oninput=()=>{count.textContent=`本文 ${[...fields.body.value].length}文字（参考値）。SNSの投稿可否・文字数は送信機能の追加時に検証します。`;};
 field('source','関連する元動画・利用予定素材','select',[['','なし']]);
 field('link','紹介先URL');fields.link.type='url';
 field('due','希望日時（日本時間・予約は行いません）');fields.due.type='datetime-local';
 const actions=el('div');actions.className='actions';const save=el('button','下書きを保存'),fresh=el('button','新しい下書き'),cancel=el('button','この下書きを取り消す'),refresh=el('button','保存した下書きを再読込');
 actions.append(save,fresh,cancel,refresh);form.append(actions);
 const month=field('month','保存月','select');const list=el('div');list.id='foundationDrafts';form.append(list);
 let current=null,index=null,drafts={},repo='',enabled=false,loading=false,activeReceipt=null;
 const api=(...args)=>window.videoStudioApi(...args);
 function reset(){current=null;fields.name.value='';fields.body.value='';fields.source.value='';fields.link.value='';fields.due.value='';fields.body.oninput();cancel.disabled=true;}
 function controls(){const state=adapter.snapshot();enabled=state.foundation?.enabled===true;form.hidden=!enabled;
  status.textContent=enabled?'下書き保存のみON。SNS送信機能は未実装です。':'OFF：既存の動画投稿をご利用ください。有効化する場合は非公開リポジトリのVariable POSTING_FOUNDATION_ENABLEDをtrueにし、「投稿先を取得」等の処理後に一覧を更新してください。';
  if(activeReceipt){const receipt=state.requests?.[activeReceipt];status.textContent+=` ／ 受付ID：${activeReceipt} ／ ${receipt?.message||'受付を確認中です。投稿管理の受付履歴から同じIDで再依頼できます。'}`;}
  if(state.foundation?.protection_error)status.textContent+=' ／ '+state.foundation.protection_error;
  save.disabled=cancel.disabled=adapter.busy()||loading||!enabled;cancel.disabled ||= !current;
  refresh.disabled=loading||adapter.busy();
  const selected=fields.source.value;fields.source.replaceChildren();const none=el('option','なし');none.value='';fields.source.append(none);
  for(const v of Object.values(state.videos||{})){if(v.cloud?.status!=='uploaded')continue;const o=el('option',`${v.filename} ／ ${v.id}`);o.value=v.id;fields.source.append(o);}
  fields.source.value=selected;
 }
 function renderList(){list.replaceChildren();for(const d of Object.values(drafts).sort((a,b)=>b.updated_at.localeCompare(a.updated_at))){
  const item=el('article');item.className='item';item.append(el('strong',d.name),el('p',`${d.service==='x'?'X':'Threads'} ／ ${d.status==='cancelled'?'取消済み':'下書き'} ／ 改訂 ${d.revision}`),el('p',d.body));
  const edit=el('button','この下書きを編集');edit.onclick=()=>{current=d;fields.name.value=d.name;fields.service.value=d.service;fields.kind.value=d.kind;fields.body.value=d.body;fields.source.value=d.source_video_id||'';fields.link.value=d.link_url||'';fields.due.value=d.due_at?new Date(Date.parse(d.due_at)+9*3600000).toISOString().slice(0,16):'';fields.body.oninput();controls();};item.append(edit);list.append(item);
 }if(!list.children.length)list.append(el('p','この月の保存済み下書きはありません。'));}
 async function load(){if(!enabled||loading||adapter.busy())return;loading=true;controls();const selectedRepo=document.getElementById('repo').value.trim();
  try{let ref;try{ref=await api('git/ref/heads/posting-state');}catch(e){if(e.status!==404)throw e;if(selectedRepo!==document.getElementById('repo').value.trim())return;index=null;drafts={};month.replaceChildren();renderList();return;}
   const head=ref.object.sha;const next=decode((await api(`contents/index.json?ref=${head}`)).content);
   if(next.version!==1||!next.drafts)throw Error('下書きの形式を確認してください');
   const months=[...new Set(Object.values(next.drafts).map(d=>d.month))].sort().reverse();let chosen=months.includes(month.value)?month.value:months[0];
   let values={};if(chosen)values=decode((await api(`contents/drafts/${chosen}.json?ref=${head}`)).content).drafts;
   if(selectedRepo!==document.getElementById('repo').value.trim())return;
   index=next;drafts=values;month.replaceChildren();for(const m of months){const o=el('option',m);o.value=m;month.append(o);}month.value=chosen||'';renderList();
  }catch(e){status.textContent='保存済み下書きを取得できません。再読込してください。';}
  finally{loading=false;save.disabled=adapter.busy();refresh.disabled=adapter.busy();}
 }
 save.onclick=async()=>{try{if(!enabled||adapter.busy())return;const value=draftValue(fields,current);activeReceipt=await adapter.saveDraft(value);controls();}catch(e){status.textContent=e.message;}};
 cancel.onclick=async()=>{if(current&&enabled&&!adapter.busy()&&confirm('この下書きを取り消し、利用予定素材の保護を解除します。SNSへの変更は行いません。')){activeReceipt=await adapter.cancelDraft({id:current.id,revision:current.revision});controls();}};
 fresh.onclick=reset;refresh.onclick=load;month.onchange=load;
 window.addEventListener('posting-state',()=>{const selectedRepo=document.getElementById('repo').value.trim();if(repo!==selectedRepo){repo=selectedRepo;activeReceipt=null;index=null;drafts={};month.replaceChildren();reset();renderList();}controls();});
 controls();reset();renderList();
}
