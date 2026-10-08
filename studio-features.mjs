const $=id=>document.getElementById(id);
export function decodeBlob(response){return Uint8Array.from(atob(response.content.replace(/\s/g,'')),c=>c.charCodeAt(0));}
export function validateRegistration(file, fields, catalog){
  if(!file||!file.size||file.size>20*1024*1024||! /\.(mp3|m4a|wav|ogg|flac)$/i.test(file.name))throw Error('BGMは対応する音源形式で1バイト〜20 MiBにしてください');
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(fields.id)||catalog.tracks.some(t=>t.id===fields.id))throw Error('曲IDの形式・重複を確認してください');
  for(const k of ['title','artist','source_url','license'])if(typeof fields[k]!=='string'||!fields[k].trim())throw Error('曲名・作者・出典URL・ライセンスを入力してください');
  const url=new URL(fields.source_url);if(!['https:','http:'].includes(url.protocol))throw Error('出典URLが不正です');
  if(!fields.categories.length||fields.categories.some(c=>!['calm','reflective','mysterious','hopeful','serious'].includes(c)))throw Error('カテゴリを選択してください');
  if(!fields.commercial_use_confirmed)throw Error('商用利用・投稿先の利用条件を確認してください');
  if(fields.attribution_required&&!fields.attribution_text.trim())throw Error('必要なクレジット文章を入力してください');
  if(!Number.isSafeInteger(fields.priority))throw Error('優先順位は整数です');
  return {...fields,file:fields.id+'.'+file.name.split('.').pop().toLowerCase(),gain_db:0,license_checked_at:new Date().toISOString().slice(0,10)};
}
export async function registerBgm(api,file,fields,encode){
  const repository=await api('');if(!repository.private)throw Error('保存先は非公開リポジトリにしてください');
  const ref=await api('git/ref/heads/main'),head=ref.object.sha;
  const commit=await api(`git/commits/${head}`);
  const response=await api(`contents/media/bgm/catalog.json?ref=${head}`);
  const catalog=JSON.parse(new TextDecoder().decode(decodeBlob(response)));
  if(catalog.version!==1||!Array.isArray(catalog.tracks))throw Error('BGM一覧が不正です');
  const track=validateRegistration(file,fields,catalog);
  try{await api(`contents/media/bgm/${track.file}?ref=${head}`);throw Error('同じ音源ファイル名が存在します');}catch(e){if(e.status!==404)throw e;}
  const data=await file.arrayBuffer(), digest=await crypto.subtle.digest('SHA-256',data);
  track.sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(catalog.tracks.some(t=>t.sha256===track.sha256))throw Error('同じ音源が登録済みです');
  const audio=await api('git/blobs','POST',{content:await encode(file),encoding:'base64'});
  const existingTree=await api(`git/trees/${commit.tree.sha}?recursive=1`);
  if(existingTree.tree.some(e=>e.path.startsWith('media/bgm/')&&e.sha===audio.sha))throw Error('同じ音源が登録済みです');
  const list=await api('git/blobs','POST',{content:JSON.stringify({...catalog,tracks:[...catalog.tracks,track]},null,2),encoding:'utf-8'});
  const tree=await api('git/trees','POST',{base_tree:commit.tree.sha,tree:[{path:'media/bgm/'+track.file,mode:'100644',type:'blob',sha:audio.sha},{path:'media/bgm/catalog.json',mode:'100644',type:'blob',sha:list.sha}]});
  const written=await api('git/commits','POST',{message:'Register BGM '+track.id,tree:tree.sha,parents:[head]});
  const current=await api('git/ref/heads/main');if(current.object.sha!==head)throw Error('別の更新がありました。再読込して登録し直してください');
  await api('git/refs/heads/main','PATCH',{sha:written.sha,force:false});
  return track;
}
export function mountBgmRegistration(api,encode){
  let localUrl,working=false;
  $('bgmFile').onchange=()=>{if(localUrl)URL.revokeObjectURL(localUrl);const f=$('bgmFile').files[0];$('bgmLocalPlayer').hidden=!f;if(f){localUrl=URL.createObjectURL(f);$('bgmLocalPlayer').src=localUrl;}};
  $('registerBgm').onclick=async()=>{if(working)return;working=true;$('registerBgm').disabled=true;const expected=$('repo').value.trim();const scoped=async(...args)=>{if($('repo').value.trim()!==expected)throw Error('接続先が変更されました');const value=await api(...args);if($('repo').value.trim()!==expected)throw Error('接続先が変更されました');return value;};
    try{const fields={id:$('bgmId').value.trim(),title:$('bgmTitle').value.trim(),artist:$('bgmArtist').value.trim(),source_url:$('bgmSource').value.trim(),license:$('bgmLicense').value.trim(),priority:Number($('bgmPriority').value),categories:[...document.querySelectorAll('#bgmCategories input:checked')].map(i=>i.value),commercial_use_confirmed:$('bgmCommercial').checked,attribution_required:$('bgmAttribution').checked,attribution_text:$('bgmCredit').value.trim()};
      $('bgmRegisterStatus').textContent='登録中。完了まで画面を開いてください';const track=await registerBgm(scoped,$('bgmFile').files[0],fields,encode);$('bgmRegisterStatus').textContent=track.title+'を登録しました';$('pbLoad').click();
    }catch(e){$('bgmRegisterStatus').textContent=e.message;}finally{working=false;$('registerBgm').disabled=false;}
  };
}
