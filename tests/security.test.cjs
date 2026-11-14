const test=require('node:test');const assert=require('node:assert/strict');
const {inspectDeployment,isPublicSupabaseKey}=require('../.test-build/deployment.js');
const {securityHeaders,preventSessionCaching}=require('../.test-build/http-security.js');
const {authDestination,authRedirectUrl,authFeedback}=require('../.test-build/auth-flow.js');
const cloud={NEXT_PUBLIC_DEMO_MODE:'false',NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example',APP_ORIGIN:'https://findback.example'};
const jwt=role=>'header.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';

test('security: production Cloud configuration requires a canonical origin and rejects accidental Demo mode',()=>{
  assert.equal(inspectDeployment(cloud,true).mode,'cloud');
  for(const name of ['APP_ORIGIN','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'])assert.throws(()=>inspectDeployment({...cloud,[name]:''},true));
  assert.throws(()=>inspectDeployment({NEXT_PUBLIC_DEMO_MODE:'FALSE'},false),/exactly true or false/);
  assert.equal(inspectDeployment({},false).mode,'demo');
});
test('security: public configuration rejects privileged/user keys without leaking their values',()=>{
  assert.ok(isPublicSupabaseKey('sb_publishable_example'));assert.ok(isPublicSupabaseKey(jwt('anon')));
  for(const key of ['sb_secret_private-example',jwt('service_role'),jwt('authenticated'),'malformed']){
    assert.equal(isPublicSupabaseKey(key),false);
    assert.throws(()=>inspectDeployment({...cloud,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:key},true),error=>!error.message.includes(key));
  }
  assert.throws(()=>inspectDeployment({NEXT_PUBLIC_DEMO_MODE:'true',NEXT_PUBLIC_SERVICE_ROLE_KEY:'private-test-value'}),error=>error.message.includes('NEXT_PUBLIC_SERVICE_ROLE_KEY')&&!error.message.includes('private-test-value'));
});
test('security: deployment origins reject credential/path/header injection and insecure production URLs',()=>{
  for(const value of ['http://example.com','https://user:pass@example.com','https://example.com/path','https://example.com?x=1','javascript:alert(1)','https://example.com/;script-src%20*','https://example.com\r\nX-Evil: 1'])assert.throws(()=>inspectDeployment({...cloud,APP_ORIGIN:value},true));
  assert.doesNotThrow(()=>inspectDeployment({...cloud,APP_ORIGIN:'http://localhost:3100',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3112'},false));
  assert.throws(()=>inspectDeployment({...cloud,APP_ORIGIN:'http://localhost:3100'},true));
});
test('security: CSP allows only configured Supabase transport/photo origins and separates dev/production eval',()=>{
  const headers=Object.fromEntries(securityHeaders(cloud,true).map(header=>[header.key,header.value]));const csp=headers['Content-Security-Policy'];
  for(const text of ["frame-ancestors 'none'","object-src 'none'","form-action 'self'",'https://test.supabase.co','wss://test.supabase.co','blob:','data:','upgrade-insecure-requests'])assert.ok(csp.includes(text));
  assert.equal(csp.includes('unsafe-eval'),false);assert.equal(csp.includes('connect-src *'),false);assert.equal(headers['X-Content-Type-Options'],'nosniff');assert.equal(headers['X-Frame-Options'],'DENY');
  const dev=securityHeaders({NEXT_PUBLIC_DEMO_MODE:'true'},false).find(header=>header.key==='Content-Security-Policy').value;assert.ok(dev.includes('unsafe-eval'));assert.equal(dev.includes('upgrade-insecure-requests'),false);
});
test('security: private-session cache prevention preserves existing vary/cookies and is idempotent',()=>{
  const headers=new Headers({'Vary':'RSC, Next-Router-State-Tree','Set-Cookie':'sample=local; Path=/'});preventSessionCaching(headers);preventSessionCaching(headers);
  assert.ok(headers.get('Cache-Control').includes('private'));assert.ok(headers.get('Cache-Control').includes('no-store'));assert.equal(headers.get('Pragma'),'no-cache');assert.equal(headers.get('Expires'),'0');assert.equal(headers.get('Set-Cookie'),'sample=local; Path=/');
  assert.equal(headers.get('Vary'),'RSC, Next-Router-State-Tree, Cookie');
});
const auth=(failure=false)=>async()=>({auth:{verifyOtp:async()=>({error:failure?new Error('private detail'):null}),exchangeCodeForSession:async()=>({error:failure?new Error('private detail'):null})}});
test('security: malformed, expired, offline and Demo Auth flows fail with fixed messages and no 500',async()=>{
  for(const [kind,query] of [['confirm','type=admin&token_hash=example'],['confirm','type=recovery'],['callback',''],['callback','code=%00bad']])assert.ok((await authDestination(kind,new URLSearchParams(query),async()=>{throw new Error('must not create client');},true)).startsWith('/login?error='));
  for(const factory of [auth(true),async()=>{throw new Error('missing private configuration');}]){
    assert.equal(await authDestination('confirm',new URLSearchParams('type=recovery&token_hash=example'),factory,true),'/login?error=confirmation');
    assert.equal(await authDestination('callback',new URLSearchParams('code=example'),factory,true),'/login?error=callback');
  }
  assert.equal(await authDestination('callback',new URLSearchParams('code=example'),async()=>{throw new Error('Demo must not contact Auth');},false),'/login?error=callback');
});
test('security: success paths preserve recovery and reject arbitrary callback destinations',async()=>{
  assert.equal(await authDestination('confirm',new URLSearchParams('type=recovery&token_hash=example'),auth(),true),'/reset-password');
  assert.equal(await authDestination('confirm',new URLSearchParams('type=email&token_hash=example'),auth(),true),'/login?confirmed=1');
  for(const next of ['https://evil.example','//evil.example','/\\evil.example','/reset-password?next=https://evil.example','/admin'])assert.equal(await authDestination('callback',new URLSearchParams({code:'example',next}),auth(),true),'/my-reports');
  assert.equal(await authDestination('callback',new URLSearchParams('code=example&next=/reset-password'),auth(),true),'/reset-password');
});
test('security: canonical redirect origins and feedback do not reflect untrusted URL/query content',()=>{
  assert.equal(authRedirectUrl('/my-reports','https://poisoned.example/auth/callback','https://findback.example').href,'https://findback.example/my-reports');
  assert.equal(authRedirectUrl('https://evil.example','https://findback.example/auth/callback').href,'https://findback.example/login?error=callback');
  assert.equal(authFeedback(new URLSearchParams('error=<script>private</script>')),null);assert.equal(authFeedback(new URLSearchParams('error=callback')).error,true);assert.equal(authFeedback(new URLSearchParams('confirmed=1')).error,false);
});
