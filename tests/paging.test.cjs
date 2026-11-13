const test=require('node:test');const assert=require('node:assert/strict');
const {routeQuery,exportReportPages}=require('../.test-build/data-pages.js');
const {decodeDataPage}=require('../.test-build/cloud-data.js');
const {findPossibleDuplicates}=require('../.test-build/duplicates.js');
const report=(n)=>({id:String(n),createdAt:'2026-11-13T10:00:00.123456Z',title:`Report ${n}`});
const page=(reports,extra={})=>({ids:reports.map(r=>r.id),db:{reports},snapshot:'server-snapshot',...extra});
test('paging: route context fetches old item, edit and claim IDs directly',()=>{
  assert.deepEqual(routeQuery('/item/old/edit'),{kind:'report',id:'old'});assert.deepEqual(routeQuery('/claims/old'),{kind:'claim',id:'old'});assert.deepEqual(routeQuery('/browse'),{kind:'bootstrap'});
});
test('paging: full CSV export passes filters, server watermark and advancing UUID/timestamp cursors beyond 500',async()=>{
  const calls=[];const all=Array.from({length:551},(_,i)=>report(i+1));
  const result=await exportReportPages(async(query)=>{calls.push(query);return page(all.slice((calls.length-1)*100,calls.length*100));},{kind:'admin_reports',search:'Phone',category:'Phone',visibility:'hidden'});
  assert.equal(result.length,551);assert.equal(calls.length,6);assert.equal(calls[1].snapshot,'server-snapshot');assert.equal(calls[1].cursorId,'100');assert.equal(calls[1].cursorAt,all[99].createdAt);assert.ok(calls.every(q=>q.search==='Phone'&&q.visibility==='hidden'&&q.pageSize===100&&q.forExport));
});
test('paging: an exact export page boundary terminates after an empty page',async()=>{
  let count=0;const result=await exportReportPages(async()=>page(++count===1?Array.from({length:100},(_,i)=>report(i)):[]),{kind:'admin_reports'});assert.equal(count,2);assert.equal(result.length,100);
});
test('paging: export is cancellable and does not return a partial file after query failure',async()=>{
  const controller=new AbortController();controller.abort();let calls=0;
  await assert.rejects(exportReportPages(async()=>{calls++;return page([]);},{kind:'admin_reports'},controller.signal),{name:'AbortError'});assert.equal(calls,0);
  await assert.rejects(exportReportPages(async()=>{throw new Error('offline');},{kind:'admin_reports'}),/offline/);
});
test('paging: nonadvancing export cursors fail instead of looping',async()=>{
  await assert.rejects(exportReportPages(async()=>page(Array.from({length:100},(_,i)=>report(i))),{kind:'admin_reports'}),/did not advance/);
});
test('paging: bounded row decoding retains private fields only when returned by RLS and preserves cursors',()=>{
  const result=decodeDataPage({ids:['report'],total:600,page:6,pageSize:100,snapshot:'stamp',stats:{totalReports:600},bundle:{reports:[{id:'report',owner_id:'owner',type:'found',category:'Phone',created_at:'2026-11-13T10:00:00.123456+00:00',image_path:'owner/photo.jpg'}],profiles:[{id:'owner',display_name:'Owner'}]}},path=>'https://example.com/'+path);
  assert.equal(result.db.reports[0].contactPhone,'');assert.equal(result.db.users[0].email,'');assert.equal(result.db.reports[0].createdAt,'2026-11-13T10:00:00.123456+00:00');assert.equal(result.db.reports[0].image,'https://example.com/owner/photo.jpg');assert.equal(result.imagePaths.report,'owner/photo.jpg');assert.equal(result.total,600);
  assert.throws(()=>decodeDataPage({ids:[]},()=>''),/counters/);assert.throws(()=>decodeDataPage(null,()=>''),/response/);
});
test('paging: hidden reports do not reappear as duplicate warnings in Demo mode',()=>{
  const draft={type:'found',title:'Samsung blue phone',category:'Phone',brand:'Samsung',color:'blue',location:'Library',occurredOn:'2026-11-13'};
  assert.equal(findPossibleDuplicates(draft,[{...draft,id:'hidden',hidden:true,status:'open'}]).length,0);
});
test('paging: cancellation during an export response prevents a partial file',async()=>{
  const controller=new AbortController();
  await assert.rejects(exportReportPages(async()=>{controller.abort();return page([report(1)]);},{kind:'admin_reports'},controller.signal),{name:'AbortError'});
});
