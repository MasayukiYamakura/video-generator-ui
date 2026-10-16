import test from 'node:test';
import assert from 'node:assert/strict';
import {syncHistory,cleanRecord,loadHistory} from './history.mjs';
const repo='owner/private';
const record={repo,runId:1,id:'receipt',audio:'録音.m4a',created:'2026-10-15T00:00:00Z',kind:'video',token:'SECRET',artifacts:[{token:'SECRET'}]};
function server(){
 const files=new Map();let conflict=true;
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64');
 const api=async(path,method='GET',body)=>{
  if(path==='')return {private:true};
  if(path.startsWith('git/ref/'))return {object:{sha:'head'}};
  if(path.startsWith('git/trees/'))return {tree:[...files].map(([id])=>({type:'blob',path:`history/${id}.json`,sha:encode(files.get(id))}))};
  if(path.startsWith('git/blobs/'))return {content:path.slice('git/blobs/'.length)};
  const id=/history\/(\d+)\.json/.exec(path)?.[1];
  if(method==='PUT'){
   if(conflict){conflict=false;throw Object.assign(Error('conflict'),{status:409});}
   files.set(id,JSON.parse(Buffer.from(body.content,'base64').toString()));return {};
  }
  if(!files.has(id))throw Object.assign(Error('missing'),{status:404});
  return {sha:id,content:encode(files.get(id))};
 };
 return {api,files};
}
test('migrates existing local history, retries conflict, loads on another device without credentials',async()=>{
 const {api,files}=server();const first=await syncHistory(api,repo,[record]);
 assert.equal(first.length,1);assert.equal(files.size,1);assert.ok(!JSON.stringify([...files]).includes('SECRET'));
 const second=await syncHistory(api,repo,[]);assert.equal(second[0].audio,'録音.m4a');
 await syncHistory(api,repo,[record]);assert.equal(files.size,1);
});
test('failed migration leaves original local records untouched',async()=>{
 const original=JSON.stringify(record);
 await assert.rejects(syncHistory(async()=>{throw Error('offline');},repo,[record]));
 assert.equal(JSON.stringify(record),original);
});
test('rejects other repositories and invalid run IDs',()=>{
 assert.equal(cleanRecord(record,'other/repo'),null);
 assert.equal(cleanRecord({...record,runId:'1'},repo),null);
});

test('refuses public history destinations',async()=>{await assert.rejects(syncHistory(async()=>({private:false}),repo,[record]),/非公開/);});

test('local audio label enriches background-created record',async()=>{
 const {api,files}=server();files.set('1',{repo,runId:1,audio:'動画生成'});
 const results=await syncHistory(api,repo,[record]);
 assert.equal(results[0].audio,'録音.m4a');assert.equal(files.get('1').audio,'録音.m4a');
});

test('normal history reads never write, including when the branch does not exist',async()=>{
 const {api,files}=server();files.set('1',record);let writes=0;
 const read=async(path,method='GET',body)=>{if(method!=='GET')writes++;return api(path,method,body);};
 assert.equal((await loadHistory(read,repo)).length,1);await loadHistory(read,repo);assert.equal(writes,0);
 assert.deepEqual(await loadHistory(async(path,method='GET')=>{assert.equal(method,'GET');if(!path)return {private:true};throw Object.assign(Error('missing'),{status:404});},repo),[]);
});
