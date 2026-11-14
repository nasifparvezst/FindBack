const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label,timeout=30000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await check())return;await pause(100);}throw new Error('Timed out: '+label);}

function localBase(value){
  const base=new URL(value||'http://localhost:3100');
  if(!['http:','https:'].includes(base.protocol)||!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('Demo E2E requires a loopback E2E_BASE_URL origin.');
  return base.origin;
}
function chromePath(){
  const candidates=[process.env.CHROME_PATH,...(process.platform==='win32'?[path.join(process.env.PROGRAMFILES||'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']||'C:/Program Files (x86)','Google/Chrome/Application/chrome.exe')]:['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'])];
  const found=candidates.find(candidate=>candidate&&fs.existsSync(candidate));if(!found)throw new Error('Install Chrome/Chromium or set CHROME_PATH to its executable.');return found;
}

async function openBrowser(base){
  await until(async()=>{try{return(await fetch(base)).ok;}catch{return false;}},'local server (start npm run dev first)');
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'findback-e2e-'));let socket;let sequence=0;const pending=new Map();const errors=[];
  const child=spawn(chromePath(),['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,...(process.env.E2E_NO_SANDBOX==='true'?['--no-sandbox']:[]),'about:blank'],{stdio:'ignore',windowsHide:true});
  let launchError;child.on('error',error=>{launchError=error;});
  function command(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
  async function evaluate(expression){const reply=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(reply.exceptionDetails)throw new Error(reply.exceptionDetails.exception?.description||reply.exceptionDetails.text);return reply.result.value;}
  async function close(){
    if(socket?.readyState===WebSocket.OPEN){await command('Browser.close').catch(()=>{});socket.close();}child.kill();
    await until(()=>child.exitCode!==null||child.signalCode!==null,'browser exit',3000).catch(()=>{});
    for(const item of pending.values()){clearTimeout(item.timer);item.reject(new Error('Browser closed'));}pending.clear();
    const absolute=path.resolve(profile);const temporary=path.resolve(os.tmpdir())+path.sep;
    if(absolute.startsWith(temporary)&&path.basename(absolute).startsWith('findback-e2e-')){try{fs.rmSync(absolute,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{/* OS may retain a temporary Chrome lock briefly. */}}
  }
  try{
    const portFile=path.join(profile,'DevToolsActivePort');await until(()=>{if(launchError)throw launchError;return fs.existsSync(portFile);},'Chrome startup');
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0].trim();const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    socket.addEventListener('message',event=>{
      const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.exception?.description||data.params.exceptionDetails.text);
      if(data.method==='Page.javascriptDialogOpening')void command('Page.handleJavaScriptDialog',{accept:true});
      const item=pending.get(data.id);if(!item)return;clearTimeout(item.timer);pending.delete(data.id);if(data.error)item.reject(new Error(data.error.message));else item.resolve(data.result);
    });
    await command('Runtime.enable');await command('Page.enable');await command('Emulation.setFocusEmulationEnabled',{enabled:true});
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await command('Page.addScriptToEvaluateOnNewDocument',{source:"window.__e2eCsp=[];document.addEventListener('securitypolicyviolation',event=>window.__e2eCsp.push(event.effectiveDirective));"});
    return{command,evaluate,errors,profile,close,
      async go(route,expectedPath=new URL(route,base).pathname){await command('Page.navigate',{url:new URL(route,base).href});await until(()=>evaluate(`location.pathname===${JSON.stringify(expectedPath)}&&!!document.querySelector('.site-root')`),'route '+expectedPath);},
      async click(text){await evaluate(`(()=>{const e=Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()===${JSON.stringify(text)});if(!e)throw new Error('Missing action '+${JSON.stringify(text)});e.focus();e.click();})()`);},
      async field(selector,value){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing field '+${JSON.stringify(selector)});const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);},
      async screenshot(file){const output=path.resolve(file);const root=path.resolve('.test-build')+path.sep;if(!output.startsWith(root))throw new Error('Screenshots must stay inside .test-build');fs.mkdirSync(path.dirname(output),{recursive:true});const result=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(output,Buffer.from(result.data,'base64'));},
    };
  }catch(error){await close();throw error;}
}
module.exports={openBrowser,localBase,until};
