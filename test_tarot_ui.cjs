// Optional browser smoke test: install playwright-core and set CHROMIUM_EXECUTABLE.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');

(async()=>{
  const root=__dirname, errors=[];
  const server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    try {res.setHeader('Content-Type',/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}
    catch {res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>window.videoConfigurator);
    assert.equal(await page.locator('#pbVideo option').count(),6);
    await page.locator('#pbVideo').selectOption('tarot_monthly_remotion');
    for(const id of ['pbTarotArea','pb_bgm_mode','pb_hook_enabled','pb_body_caption','pb_voice_mode'])
      assert.equal(await page.locator('#'+id).isVisible(),true,id);
    assert.equal(await page.locator('#pbBackgroundFile').isVisible(),false);
    await page.locator('#pbTarotYear').fill('2026');
    await page.locator('#pbTarotMonth').selectOption('10');
    await page.locator('#pbTarotZodiac').selectOption('sagittarius');
    for(let i=0;i<4;i++){
      await page.locator(`#pbTarotCard${i}`).selectOption({index:i+1});
      await page.locator(`#pbTarotReading${i}`).fill(`解釈${i+1}`);
    }
    await page.locator('#pbTranscript').fill('2026年10月、射手座の運勢です。');
    await page.locator('#pbBuild').click();
    const scenes=['intro','overall','relationships','work','advice'].map(p=>({tarot_phase:p,text:p,...(p==='intro'?{hook_text:'射手座の10月'}:{})}));
    const result=await page.evaluate(input=>window.videoConfigurator.prepareScript({scenes:input}),scenes);
    assert.equal(result.global_settings.tarot_renderer,'remotion');
    assert.equal(result.tarot.cards.length,4);
    assert.equal(result.tarot.year,2026);
    await page.locator('#pbVideo').selectOption('tarot_monthly');
    assert.equal(await page.locator('#pbTarotArea').isVisible(),true);
    await page.locator('#pbBuild').click();
    const old=await page.evaluate(input=>window.videoConfigurator.prepareScript({scenes:input}),scenes);
    assert.equal(old.global_settings.tarot_renderer,undefined);
    await page.locator('#pbVideo').selectOption('tiktok_standard');
    assert.equal(await page.locator('#pbTarotArea').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('Tarot UI preset selection, shared controls and JSON compilation: OK');
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
