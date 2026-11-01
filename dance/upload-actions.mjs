/** Non-exportable browser keys; only public JWKs and encrypted envelopes reach GitHub. */
export const UPLOAD_WORKFLOW='dance-upload.yml';
const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export async function generateUploadKey(){
  if(!globalThis.crypto?.subtle)throw Error('アップロードにはHTTPSとWebCrypto対応ブラウザが必要です。公開URLを通常のブラウザで開いてください。');
  const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},false,['encrypt','decrypt']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
  return {privateKey:pair.privateKey,publicJwk:{kty:jwk.kty,n:jwk.n,e:jwk.e}};
}
export async function keyStore(repo,id,value=undefined){
  if(typeof indexedDB==='undefined')throw Error('このブラウザでは復号鍵を保存できません。通常のブラウザで開いてください。');
  if(!/^[a-f0-9]{32}$/.test(id))throw Error('不正な受付IDです。');
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('d-generator-upload-keys',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('keys');
    request.onerror=()=>reject(Error('このブラウザに復号鍵を保存できません。通常のブラウザで開き直してください。'));
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('keys',value===undefined?'readonly':'readwrite'),store=tx.objectStore('keys');
      const key=repo+':'+id,op=value===undefined?store.get(key):value===null?store.delete(key):store.put(value,key);
      let result;
      op.onsuccess=()=>result=op.result;
      tx.oncomplete=()=>{db.close();resolve(result);};
      tx.onerror=tx.onabort=()=>{db.close();reject(Error('復号鍵の保存・読込に失敗しました。'));};
    };
  });
}
export async function decryptPermission(envelope,key,id,now=Date.now()/1000){
  if(!key || envelope?.version!==1 || envelope.alg!=='RSA-OAEP-256+A256GCM')throw Error('復号鍵またはアップロード許可を確認できません。');
  let permission;
  try {
    const aes=await crypto.subtle.decrypt({name:'RSA-OAEP'},key,bytes(envelope.key));
    const imported=await crypto.subtle.importKey('raw',aes,'AES-GCM',false,['decrypt']);
    const cipher=bytes(envelope.ciphertext),tag=bytes(envelope.tag),combined=new Uint8Array(cipher.length+tag.length);
    combined.set(cipher);combined.set(tag,cipher.length);
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(envelope.iv),additionalData:new TextEncoder().encode('d-generator-upload:'+id)},imported,combined);
    permission=JSON.parse(new TextDecoder().decode(plain));
  }catch{throw Error('アップロード許可を復号できません。この受付を開始したブラウザで再開してください。');}
  if(permission.upload_id!==id || permission.params?.public_id!==`d-generator/staging/68165303/${id}` ||
      permission.params?.type!=='authenticated' || permission.params?.overwrite!==false ||
      !/^[a-f0-9]{64}$/.test(permission.signature||'') || !Number.isFinite(permission.signature_expires_at) || permission.signature_expires_at<=now)
    throw Error('アップロード許可の内容または有効期限を確認してください。');
  return permission;
}
export async function waitForOperation(client,id,onWaiting=()=>{},wait=()=>new Promise(r=>setTimeout(r,3000)),limit=40){
  for(let n=0;n<limit;n++){
    const result=await client.json(`upload-operations/${id}.json`,'results',true);
    if(result)return result;
    onWaiting();await wait();
  }
  throw Error('アップロード許可はActionsで待機・準備中です。後で「登録を再開」を押してください。新しい受付は不要です。');
}
