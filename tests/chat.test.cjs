const { test } = require('node:test');
const assert = require('node:assert/strict');
const { messagePage, mergeMessages, compareMessages, notificationSummary, createRefreshQueue } = require('../.test-build/chat.js');
const { watchPrivateUpdates, loadMessagePage } = require('../.test-build/realtime.js');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const message = (n, extra = {}) => ({ id: String(n).padStart(4,'0'), claimId: 'claim', senderId: 'owner', body: `message ${n}`, createdAt: '2026-11-13T10:00:00.123456Z', ...extra });

test('chat: history pages include every tied message once; arrivals do not shift older cursor pages', () => {
  const all = Array.from({length:120}, (_,i) => message(i+1));
  const latest = messagePage(all); assert.equal(latest.messages[0].id,'0071'); assert.equal(latest.hasMore,true);
  const older = messagePage([...all,message(121)],latest.messages[0]);
  const oldest = messagePage(all,older.messages[0]); assert.equal(oldest.hasMore,false);
  assert.deepEqual(mergeMessages([...latest.messages,...older.messages],oldest.messages), all);
});
test('chat: catch-up covers more than 50 missed messages and deduplicates repeated delivery', () => {
  const all = Array.from({length:121}, (_,i) => message(i+1));
  const first = messagePage(all,undefined,message(1)); const second = messagePage(all,undefined,first.messages.at(-1));
  const third = messagePage(all,undefined,second.messages.at(-1));
  assert.equal(first.hasMore,true); assert.equal(third.hasMore,false);
  assert.equal(mergeMessages(all.slice(0,1),[...first.messages,...first.messages,...second.messages,...third.messages]).length,121);
  assert.equal(compareMessages(message(1,{createdAt:'2026-11-13T10:00:00.123Z'}),message(1,{createdAt:'2026-11-13T10:00:00.123000+00:00'})),0);
});
test('chat: unread summaries exclude other users and read notices, and distinguish claim alerts', () => {
  const notice = {userId:'one',read:false,title:'New message',href:'/claims/a'};
  assert.deepEqual(notificationSummary([notice,notice,{...notice,title:'Claim approved'},{...notice,read:true},{...notice,userId:'two'}],'one'), {unreadNotifications:3,unreadClaims:{a:2}});
});
test('chat: refresh queue coalesces concurrent events and performs a trailing refresh without overlaps', async () => {
  let calls=0,active=0,max=0,release;
  const gate=new Promise((resolve)=>{release=resolve;});
  const refresh=createRefreshQueue(async()=>{calls++;active++;max=Math.max(max,active);if(calls===1)await gate;active--;});
  const pending=refresh(); refresh(); refresh(); release(); await pending;
  assert.equal(calls,2);assert.equal(max,1);
  await refresh(); assert.equal(calls,3);
});
test('chat: refresh queue can recover after a failed request', async () => {
  let calls=0;const refresh=createRefreshQueue(async()=>{if(++calls===1)throw new Error('offline');});
  await assert.rejects(refresh(),/offline/);await refresh();assert.equal(calls,2);
});

function realtimeFixture() {
  const bindings=[];let subscribed;let removed=0;
  const channel={on(_type,filter,fn){bindings.push({filter,fn});return this;},subscribe(fn){subscribed=fn;return this;}};
  return {bindings,client:{channel:()=>channel,removeChannel:async(value)=>{assert.equal(value,channel);removed++;}},status:(value)=>subscribed(value),removed:()=>removed};
}
test('chat: realtime scopes message events, coalesces bursts, reconciles reconnect and cleans up queued work', async () => {
  const fixture=realtimeFixture();let updates=0;const statuses=[];
  const stop=watchPrivateUpdates(fixture.client,{userId:'one',claimId:'a',onChange:()=>updates++,onStatus:(value)=>statuses.push(value)});
  assert.deepEqual(fixture.bindings.map((b)=>b.filter),[{event:'INSERT',schema:'public',table:'messages',filter:'claim_id=eq.a'}]);
  fixture.status('SUBSCRIBED');fixture.bindings[0].fn();fixture.bindings[0].fn();await delay(110);assert.equal(updates,1);
  fixture.status('CHANNEL_ERROR');fixture.status('SUBSCRIBED');await delay(110);assert.equal(updates,2);
  fixture.bindings[0].fn();stop();fixture.status('CLOSED');await delay(110);
  assert.equal(updates,2);assert.equal(fixture.removed(),1);assert.deepEqual(statuses,['live','retrying','live']);
});
test('chat: inbox notifications are recipient-filtered and private tables never subscribe to DELETE', () => {
  const fixture=realtimeFixture();const stop=watchPrivateUpdates(fixture.client,{userId:'one',onChange:()=>{}});
  assert.ok(fixture.bindings.filter((b)=>b.filter.table==='notifications').every((b)=>b.filter.filter==='user_id=eq.one'));
  assert.ok(fixture.bindings.every((b)=>['INSERT','UPDATE'].includes(b.filter.event)));stop();
});
test('chat: cloud page maps server cursors without losing microseconds or exposing the lookahead row', async () => {
  const rows=Array.from({length:51},(_,i)=>({id:String(100-i),claim_id:'a',sender_id:'one',body:'hello',created_at:'2026-11-13T10:00:00.123456+00:00'}));
  const client={rpc:async(name,args)=>{assert.equal(name,'get_claim_messages');assert.equal(args.p_claim_id,'a');return {data:rows,error:null};}};
  const page=await loadMessagePage(client,'a');assert.equal(page.hasMore,true);assert.equal(page.messages.length,50);assert.equal(page.messages[0].id,'51');assert.equal(page.messages.at(-1).createdAt,rows[0].created_at);
  const after=await loadMessagePage(client,'a',undefined,message(1));assert.equal(after.messages[0].id,'100');
  await assert.rejects(loadMessagePage({rpc:async()=>({error:{code:'PGRST202',message:'missing'}})},'a'),/Phase 3/);
});
