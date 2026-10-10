import {emptyRegistry, validateRegistry, clone} from './model.mjs?v=tarot-no-reading-20261010';
export const PRESET_PATH='config/prompt-builder.json';
export const decodeContent=response=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(response.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
export function encodeContent(value) {
  const bytes=new TextEncoder().encode(JSON.stringify(value,null,2)+'\n');
  let text=''; for(let i=0;i<bytes.length;i+=32768) text+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(text);
}
export async function readRegistry(api) {
  try { const r=await api(`contents/${PRESET_PATH}?ref=main`); return {registry:validateRegistry(decodeContent(r)),sha:r.sha}; }
  catch(e) { if(e.status===404) return {registry:emptyRegistry(),sha:null}; throw e; }
}
export async function writeRegistry(api, registry, expectedSha) {
  validateRegistry(registry);
  const repository=await api('');
  if(repository.private!==true) throw Error('プリセット保存先は非公開リポジトリにしてください');
  // Read before write and use GitHub's SHA compare-and-swap. Never silently
  // overwrite another device's presets or retry on a conflict.
  const current=await readRegistry(api);
  if(current.sha!==expectedSha) throw Error('他の端末で更新されています。「保存済み設定を読込」後に保存し直してください');
  const result=await api(`contents/${PRESET_PATH}`,'PUT',{
    message:'Save Prompt Builder preset', branch:'main',
    content:encodeContent(registry), ...(expectedSha?{sha:expectedSha}:{}),
  });
  return {registry:clone(registry),sha:result.content.sha};
}


