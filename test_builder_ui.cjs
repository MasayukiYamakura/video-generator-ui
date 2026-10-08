// Optional browser integration: npm install --no-save playwright-core, then
// use a locally installed Chromium or Playwright's downloaded browser.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');

(async()=>{
 const root=__dirname,errors=[],writes=[],blobs=[];
 const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try{res.setHeader('Content-Type',file.endsWith('.mjs')||file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  page.on('pageerror',e=>errors.push(e.message));
  let registry={version:1,video_presets:[],layout_presets:[],backgrounds:[],favorites:[]},sha='head1',receipt=null,conflict=false;
  const catalog={version:1,tracks:[{id:'calm_01',title:'穏やかな曲',categories:['calm']}]};
  const data=value=>({content:Buffer.from(JSON.stringify(value)).toString('base64'),sha});
  await page.route('https://api.github.com/**',async route=>{
   const req=route.request(),url=new URL(req.url()),base='/repos/MasayukiYamakura/video-generator',endpoint=url.pathname===base?'':url.pathname.replace(base+'/',''),body=req.postDataJSON();
   assert.notEqual(url.pathname,base+'/', 'Repository root must not have a trailing slash: GitHub rejects its CORS preflight');
   let result={};
   if(endpoint==='config/prompt-builder.json')throw Error('bad endpoint');
   if(endpoint==='contents/config/prompt-builder.json'){
    if(req.method()==='PUT'){assert.equal(body.branch,'main');assert.equal(body.sha,sha);registry=JSON.parse(Buffer.from(body.content,'base64'));sha='head'+(writes.length+2);writes.push(body);result={content:{sha}};}
    else{result=data(registry);if(conflict)result.sha='other-device';}
   }else if(endpoint==='contents/media/bgm/catalog.json')result=data(catalog);
   else if(endpoint==='git/blobs'){blobs.push(body);result={sha:'a'.repeat(40)};}
   else if(endpoint==='git/trees'||endpoint==='git/commits'||endpoint==='git/refs')result={sha:'a'.repeat(40)};
   else if(endpoint==='actions/workflows/generate_video_ui.yml/dispatches'){receipt=body.inputs.receipt_id;return route.fulfill({status:204});}
   else if(endpoint==='actions/workflows/generate_video_ui.yml/runs')result={workflow_runs:receipt?[{id:123,display_title:'Pages '+receipt,status:'completed',conclusion:'success'}]:[]};
   else if(endpoint==='actions/workflows/generate_video_ui.yml')result={state:'active'};
   else if(endpoint==='')result={private:true};
   else if(endpoint==='contents/media/background.png')result={content:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7M8AAAAASUVORK5CYII=','base64').toString('base64')};
   else throw Error('Unexpected GitHub endpoint: '+endpoint);
   await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>window.videoConfigurator);
  assert.equal(await page.locator('#pbVideo option').count(),4);
  assert.equal(await page.locator('#audioUpload').isVisible(),true);
  assert.equal(await page.locator('#pbTtsFields').isVisible(),false);
  await page.locator('#pb_voice_mode').selectOption('tts');
  assert.equal(await page.locator('#audioUpload').isVisible(),false);
  assert.equal(await page.locator('#pbTtsFields').isVisible(),true);
  assert.equal(await page.locator('#pb_tts_voice').inputValue(),'hashimoto');
  assert.equal(await page.locator('#pbTtsDetails').getAttribute('open'),null);
  await page.locator('#pb_voice_mode').selectOption('anonymous');
  assert.equal(await page.locator('#audioUpload').isVisible(),true);
  assert.equal(await page.locator('#pbDspHelp').isVisible(),true);
  await page.locator('#pb_voice_mode').selectOption('original');
  assert.equal(await page.locator('#pbDspHelp').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.locator('#pbTranscript').fill('自分の人生を選ぶ');
  await page.locator('#pbBuild').click();
  assert.match(await page.locator('#pbPrompt').inputValue(),/共通ルール/);
  assert.equal(await page.locator('#pbApplyOnSend').isChecked(),true);
  const ai={global_settings:{voice_mode:'original',brand_layout:{tag_y:999}},scenes:[{text:'人生を選ぶ',hook_text:'人生',category_tags:true},{text:'自分を知る',visualizer:false}]};
  await page.getByText('レイアウト調整・保存',{exact:true}).click();
  await page.locator('#pb_tag_y').fill('222');
  await page.locator('#script').fill(JSON.stringify(ai));
  await page.locator('#pbApply').click();assert.match(await page.locator('#builderStatus').innerText(),/生成してください/);
  await page.locator('#pb_voice_mode').selectOption('anonymous');
  await page.locator('#pbBuild').click();await page.locator('#pbApply').click();
  let result=JSON.parse(await page.locator('#script').inputValue());assert.equal(result.global_settings.brand_layout.tag_y,222);assert.equal(result.global_settings.voice_mode,'anonymous');assert.equal(result.scenes[0].category_tags,false);
  await page.locator('#token').fill('test-only-token');await page.locator('#connect').click();await page.waitForFunction(()=>document.getElementById('connectionStatus').textContent==='接続できました');
  await page.locator('#pbLoad').click();await page.waitForFunction(()=>document.getElementById('builderStatus').textContent.includes('読み込みました'));
  await page.locator('#pbSaveId').fill('male_layout');await page.locator('#pbSaveName').fill('人物レイアウト');await page.locator('#pbSaveLayout').click();
  await page.waitForFunction(()=>document.getElementById('builderStatus').textContent.includes('を保存しました'));
  assert.equal(registry.layout_presets[0].values.tag_y,222);assert.equal(await page.locator('#pbLayout').inputValue(),'male_layout');
  await page.locator('#pbSaveId').fill('anonymous_custom');await page.locator('#pbSaveName').fill('匿名動画');await page.locator('#pbSaveVideo').click();
  await page.waitForFunction(()=>document.getElementById('pbVideo').value==='anonymous_custom');assert.deepEqual(registry.video_presets[0].values,{voice_mode:'anonymous'});
  assert.ok(writes.every(b=>!JSON.stringify(b).includes('test-only-token')));
  await page.reload();await page.waitForFunction(()=>window.videoConfigurator);
  assert.equal(await page.locator('#token').inputValue(),'');
  await page.locator('#token').fill('test-only-token');await page.locator('#pbLoad').click();await page.waitForFunction(()=>document.getElementById('pbLayout').querySelector('option[value="male_layout"]'));
  await page.locator('#pbVideo').selectOption('anonymous_custom');await page.locator('#pbLayout').selectOption('male_layout');
  await page.getByText('レイアウト調整・保存',{exact:true}).click();assert.equal(await page.locator('#pb_tag_y').inputValue(),'222');
  conflict=true;await page.locator('#pbSaveId').fill('conflict_layout');await page.locator('#pbSaveName').fill('競合');await page.locator('#pbSaveLayout').click();
  await page.waitForFunction(()=>document.getElementById('builderStatus').textContent.includes('他の端末'));assert.equal(writes.length,2);conflict=false;
  await page.locator('#pb_bgm_mode').selectOption('ai');await page.locator('#pbBuild').click();assert.match(await page.locator('#pbPrompt').inputValue(),/calm_01/);
  assert.equal(await page.locator('#pb_bgm_volume_db').getAttribute('max'),'24');
  await page.locator('#pb_bgm_volume_db').fill('18');await page.locator('#pb_bgm_volume_db').dispatchEvent('change');await page.locator('#pb_bgm_ducking').uncheck();
  await page.locator('#pb_bgm_mode').selectOption('track');await page.locator('#pb_bgm_track').selectOption('calm_01');
  await page.getByText('AI設定',{exact:true}).click();await page.locator('#pbHookMode').selectOption('manual');await page.locator('#pbHookText').fill('今幸せじゃないよって\n言う女性\n孤独を受け入れて\nみてください');
  await page.locator('#pbBuild').click();await page.locator('#script').fill(JSON.stringify(ai));await page.locator('#pbApply').click();
  result=JSON.parse(await page.locator('#script').inputValue());assert.equal(result.global_settings.bgm.volume_db,18);assert.equal(result.global_settings.bgm.ducking,false);assert.equal(result.scenes[0].hook_text,'今幸せじゃないよって\n言う女性\n孤独を受け入れて\nみてください');
  await page.locator('#pb_bgm_mode').selectOption('off');await page.locator('#pbBuild').click();
  // Verify actual submission goes through the compiler before isolated input
  // upload. These are mock API calls: no Actions run or real token is used.
  await page.locator('#script').fill(JSON.stringify(ai));
  await page.locator('#audio').setInputFiles({name:'recording.m4a',mimeType:'audio/mp4',buffer:Buffer.from('fixture')});
  await page.locator('#generate').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('実行受付完了'));
  result=JSON.parse(blobs.find(b=>b.encoding==='utf-8').content);
  assert.equal(result.global_settings.bgm.volume_db,18);assert.equal(result.global_settings.bgm.ducking,false);assert.equal(result.global_settings.bgm.enabled,false);
  assert.equal(result.scenes[0].hook_text,'今幸せじゃないよって\n言う女性\n孤独を受け入れて\nみてください');
  assert.equal(result.audio_file,'input.m4a');assert.equal(result.global_settings.brand_layout.tag_y,222);assert.equal(result.global_settings.voice_mode,'anonymous');assert.ok(receipt);
  await page.locator('#pbApplyOnSend').uncheck();
  assert.deepEqual(await page.evaluate(s=>window.videoConfigurator.prepareScript(s),ai),ai);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.deepEqual(errors,[]);
  await page.locator('#pb_voice_mode').selectOption('tts');
  await page.locator('#pb_tts_voice').selectOption('male_a');
  await page.locator('#pbBuild').click();
  await page.locator('#audio').setInputFiles([]);
  await page.locator('#script').fill(JSON.stringify(ai));
  const before=blobs.length;
  await page.locator('#generate').click();await page.waitForFunction(()=>document.getElementById('status').textContent.includes('実行受付完了'));
  assert.equal(blobs.length,before+1,'TTS sends only script JSON, no recording blob');
  result=JSON.parse(blobs.at(-1).content);assert.equal(result.global_settings.voice_mode,'tts');
  assert.equal(result.global_settings.tts.voice,'male_a');assert.equal(Object.hasOwn(result,'audio_file'),false);
  assert.deepEqual(errors,[]);
  if(process.env.BUILDER_SCREENSHOT)await page.screenshot({path:process.env.BUILDER_SCREENSHOT,fullPage:true});
  console.log('Mobile builder integration passed: prompt, protected submission, save/reload, SHA conflict, legacy bypass; no real API writes.');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});


