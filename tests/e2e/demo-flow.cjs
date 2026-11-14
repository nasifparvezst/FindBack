const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {openBrowser,localBase,until}=require('./browser.cjs');
async function main(){
  const base=localBase(process.env.E2E_BASE_URL);const resultFile=path.resolve('.test-build/e2e/demo-result.json');fs.mkdirSync(path.dirname(resultFile),{recursive:true});
  const result={startedAt:new Date().toISOString(),base,status:'running',checks:[]};const record=()=>fs.writeFileSync(resultFile,JSON.stringify(result,null,2));record();
  const browser=await openBrowser(base);const snapshot=()=>browser.evaluate("JSON.parse(localStorage.getItem('findback_v2_demo_data'))");
  const passed=check=>{result.checks.push(check);record();console.log('PASS: '+check);};
  const account=async(name,id)=>{await browser.go('/login');await browser.evaluate(`Array.from(document.querySelectorAll('.demo-account')).find(e=>e.textContent.includes(${JSON.stringify(name)})).click()`);await until(()=>browser.evaluate(`localStorage.getItem('findback_v2_demo_user')===${JSON.stringify(id)}`),'Demo account '+id);};
  try{
    await browser.go('/');assert.ok(await browser.evaluate("!!document.querySelector('.demo-strip')"),'This flow requires Demo mode in a fresh browser profile.');
    const response=await fetch(base);const csp=response.headers.get('content-security-policy')||'';
    assert.ok(csp.includes("frame-ancestors 'none'")&&csp.includes("object-src 'none'"));assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('x-frame-options'),'DENY');
    for(const route of ['/auth/callback?code=invalid&next=https://evil.example','/auth/confirm?type=admin&token_hash=invalid']){
      const result=await fetch(base+route,{redirect:'manual'});assert.equal(result.status,307);assert.equal(new URL(result.headers.get('location')).origin,base);assert.equal(new URL(result.headers.get('location')).pathname,'/login');assert.ok(result.headers.get('cache-control').includes('no-store'));assert.equal(result.headers.get('referrer-policy'),'no-referrer');
    }
    await browser.go('/auth/callback?code=invalid','/login');assert.ok(await browser.evaluate("document.body.textContent.includes('Sign-in could not be completed')"));
    passed('HTTP security headers and actual Auth callback failure/redirect feedback');
    async function create(type){
      await browser.go('/report/'+type);await browser.field('#title','E2E Samsung blue phone');await browser.field('#category','Phone');await browser.field('#brand','Samsung');await browser.field('#color','blue');await browser.field('#location','Campus E2E lounge');
      const today=await browser.evaluate("new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-'+String(new Date().getDate()).padStart(2,'0')");await browser.field('#occurred',today);
      await browser.field('#description','Distinctive clear case with a blue sticker. <img src=x onerror="window.__e2eInjected=true">');await browser.field('#phone','01712345678');
      if(type==='lost'){
        const png=await browser.evaluate("(()=>{const c=document.createElement('canvas');c.width=2;c.height=2;c.getContext('2d').fillRect(0,0,2,2);return c.toDataURL('image/png').split(',')[1]})()");const file=path.join(browser.profile,'item.png');fs.writeFileSync(file,Buffer.from(png,'base64'));
        const {root}=await browser.command('DOM.getDocument');const {nodeId}=await browser.command('DOM.querySelector',{nodeId:root.nodeId,selector:'#image'});await browser.command('DOM.setFileInputFiles',{nodeId,files:[file]});await until(()=>browser.evaluate("!!document.querySelector('.uploaded-preview')&&!document.querySelector('button[type=submit]').disabled"),'photo compression under CSP');
      }
      await browser.click(type==='lost'?'Submit Lost Report':'Submit Found Report');await until(()=>browser.evaluate("location.pathname.startsWith('/item/')&&!!document.querySelector('.detail-main h1')"),'new report');
      assert.equal(await browser.evaluate('Boolean(window.__e2eInjected)'),false);assert.ok(await browser.evaluate("document.querySelector('.detail-description').textContent.includes('<img src=x')"));return browser.evaluate("location.pathname.split('/')[2]");
    }
    const lost=await create('lost');await account('Tanvir','student-2');const found=await create('found');await account('Ayesha','student-1');
    await browser.go('/matches');assert.ok(await browser.evaluate(`Array.from(document.querySelectorAll('.match-card')).some(e=>e.querySelector('a[href="/item/${lost}"]')&&e.querySelector('a[href="/item/${found}"]'))`));
    await browser.go('/item/'+found);await browser.click('Request to claim item');await browser.field('#claim-evidence','The clear phone case has a distinctive small blue sticker');await browser.field('#related',lost);await browser.click('Send Claim Request');
    await until(()=>browser.evaluate("location.pathname.startsWith('/claims/')&&!!document.querySelector('.claim-timeline')"),'claim room');const claimId=await browser.evaluate("location.pathname.split('/')[2]");const route='/claims/'+claimId;
    await browser.field('.chat-compose input','Please meet at the campus security desk.');await browser.click('Send');await until(async()=>(await snapshot()).messages.some(message=>message.claimId===claimId),'private message');
    await browser.go('/login');await browser.click('Browse as a guest');await browser.go(route);assert.ok(await browser.evaluate("document.body.textContent.includes('Conversation not available')"));
    passed('report creation/photo/CSP, inert report text, matching, private claim/chat and guest access boundary');
    await account('Tanvir','student-2');await browser.go(route);await browser.click('Approve claim');await until(async()=>(await snapshot()).claims.find(claim=>claim.id===claimId).status==='approved','approval');await browser.click('I handed over the item');
    await until(async()=>Boolean((await snapshot()).claims.find(claim=>claim.id===claimId).ownerConfirmedAt),'first confirmation');let db=await snapshot();assert.equal(db.claims.find(claim=>claim.id===claimId).status,'approved');assert.equal(db.reports.find(report=>report.id===found).status,'open');
    await account('Campus Admin','admin-1');await browser.go(route);assert.equal(await browser.evaluate("Array.from(document.querySelectorAll('button')).some(button=>/^I (received|handed)/.test(button.textContent.trim()))"),false);
    await account('Ayesha','student-1');await browser.go(route);await browser.click('I received the item');await until(async()=>(await snapshot()).claims.find(claim=>claim.id===claimId).status==='completed','second confirmation');
    db=await snapshot();assert.ok([lost,found].every(id=>db.reports.find(report=>report.id===id).status==='returned'));assert.equal(await browser.evaluate("document.querySelector('.chat-compose')===null"),true);assert.deepEqual(browser.errors,[]);assert.deepEqual(await browser.evaluate('window.__e2eCsp'),[]);
    passed('owner approval, two-party handover, Admin boundary and closed chat without runtime/CSP violations');result.status='passed';
  }catch(error){result.status='failed';result.error=error.message;await browser.screenshot('.test-build/e2e/demo-failure.png').catch(()=>{});throw error;}finally{result.finishedAt=new Date().toISOString();record();await browser.close();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
