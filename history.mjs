const BRANCH = 'ui-history';
const cache = new Map();
const FIELDS = ['repo','runId','id','audio','created','kind','subjectKind','signs','sha','bgm','batchProgress',
  'outputMode','outputFormats','pairedOutput','audioMode','verticalArtifact','horizontalArtifact','outputStatus'];
export function cleanRecord(value, repository) {
  if (!value || value.repo !== repository || !Number.isSafeInteger(value.runId) || value.runId <= 0) return null;
  const result = {};
  for (const key of FIELDS) if (value[key] !== undefined) result[key] = value[key];
  if (result.signs) result.signs = result.signs.filter(x => typeof x === 'string');
  return result;
}
const decode = content => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(content.replace(/\s/g,'')), c=>c.charCodeAt(0))));
const encode = value => {const bytes=new TextEncoder().encode(JSON.stringify(value));let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text);};
async function ensureBranch(api) {
  try { return await api(`git/ref/heads/${BRANCH}`); }
  catch(e) { if(e.status!==404) throw e; }
  const main=await api('git/ref/heads/main');
  try { await api('git/refs','POST',{ref:`refs/heads/${BRANCH}`,sha:main.object.sha}); }
  catch(e) { if(e.status!==422) throw e; await api(`git/ref/heads/${BRANCH}`); }
}
export async function loadHistory(api, repository) {
  if(!(await api('')).private) throw Error('履歴の保存先は非公開リポジトリにしてください');
  let ref;
  try { ref=await api(`git/ref/heads/${BRANCH}`); }
  catch(e) { if(e.status===404)return [];throw e; }
  const tree=await api(`git/trees/${ref.object.sha}?recursive=1`);
  if(tree.truncated) throw Error('履歴一覧が大きすぎるため取得できません。端末の履歴は保持しています');
  const entries=tree.tree.filter(x=>x.type==='blob' && /^history\/\d+\.json$/.test(x.path));
  const records=new Map();
  // Sequential requests avoid a burst of GitHub API requests on phones.
  for(const entry of entries) {
    const key=`${repository}:${entry.sha}`;
    let value=cache.get(key);
    if(!value) { const blob=await api(`git/blobs/${entry.sha}`); value=decode(blob.content); cache.set(key,value); }
    const h=cleanRecord(value,repository);
    if(h) records.set(h.runId,h);
  }
  return [...records.values()].sort((a,b)=>Date.parse(b.created)-Date.parse(a.created));
}
// Used once per repository to import pre-server local history. Normal refresh is read-only.
export async function migrateHistory(api, repository, local) {
  const shared=await loadHistory(api,repository);
  const records=new Map(shared.map(h=>[h.runId,h]));
  if(local.length)await ensureBranch(api);
  for(const value of local) {
    const h=cleanRecord(value,repository); if(!h) continue;
    const remote=records.get(h.runId);
    const merged={...h,...remote};
    if(remote?.audio==='動画生成' && h.audio) merged.audio=h.audio;
    if(JSON.stringify(remote)===JSON.stringify(merged)) continue;
    const path=`contents/history/${h.runId}.json`;
    for(let attempt=0;attempt<4;attempt++) {
      let current;
      try { current=await api(`${path}?ref=${BRANCH}`); }
      catch(e) { if(e.status!==404) throw e; }
      const record={...merged,...(current?cleanRecord(decode(current.content),repository):{})};
      if(record.audio==='動画生成' && merged.audio) record.audio=merged.audio;
      if(current && JSON.stringify(cleanRecord(decode(current.content),repository))===JSON.stringify(record)) {records.set(h.runId,record);break;}
      try {
        await api(path,'PUT',{message:`Save generation history ${h.runId}`,branch:BRANCH,content:encode(record),...(current?{sha:current.sha}:{})});
        records.set(h.runId,record);break;
      } catch(e) { if(![409,422].includes(e.status)||attempt===3) throw e; }
    }
  }
  return [...records.values()].map(h=>({...local.find(x=>x.repo===repository&&x.runId===h.runId),...h,status:local.find(x=>x.repo===repository&&x.runId===h.runId)?.status||'queued'})).sort((a,b)=>Date.parse(b.created)-Date.parse(a.created));
}

// Compatibility for callers importing the previous migration helper.
export const syncHistory=migrateHistory;
