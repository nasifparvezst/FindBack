const test = require('node:test');
const assert = require('node:assert/strict');
const { applyClaimAction, canMessageClaim } = require('../.test-build/claim-workflow.js');
const time = '2026-11-13T10:00:00Z';
const fixture = () => ({
  users: ['owner', 'claimant', 'stranger', 'admin'].map((id) => ({ id, name: id, role: id === 'admin' ? 'admin' : 'student' })),
  reports: [
    { id: 'found', ownerId: 'owner', type: 'found', category: 'Phone', status: 'open', title: 'Phone' },
    { id: 'lost', ownerId: 'claimant', type: 'lost', category: 'Phone', status: 'open', title: 'Phone' },
  ],
  claims: [{ id: 'claim', reportId: 'found', relatedReportId: 'lost', claimantId: 'claimant', status: 'pending' }],
  messages: [], notifications: [], activity: [],
});
const act = (db, actor, type, reason) => applyClaimAction(db, actor, 'claim', { type, reason }, time);
const approved = () => act(fixture(), 'owner', 'approved');

test('an approved claim is required and unrelated users cannot confirm', () => {
  assert.throws(() => act(fixture(), 'owner', 'confirm'), /approved/i);
  assert.throws(() => act(approved(), 'stranger', 'confirm'), /part/i);
  assert.throws(() => act(approved(), 'admin', 'confirm'), /participants/i);
});
test('one confirmation keeps reports open and records only the caller', () => {
  const db = act(approved(), 'owner', 'confirm');
  assert.equal(db.claims[0].ownerConfirmedAt, time);
  assert.equal(db.claims[0].claimantConfirmedAt, undefined);
  assert.equal(db.claims[0].status, 'approved');
  assert.ok(db.reports.every((report) => report.status === 'open'));
});
test('either confirmation order completes both linked reports exactly once', () => {
  for (const order of [['owner', 'claimant'], ['claimant', 'owner']]) {
    const first = act(approved(), order[0], 'confirm');
    assert.equal(act(first, order[0], 'confirm'), first);
    const complete = act(first, order[1], 'confirm');
    assert.equal(complete.claims[0].status, 'completed');
    assert.equal(complete.claims[0].completedAt, time);
    assert.ok(complete.reports.every((report) => report.status === 'returned'));
    assert.equal(complete.reports[0].linkedReportId, 'lost');
    assert.equal(complete.reports[1].linkedReportId, 'found');
    assert.equal(act(complete, order[1], 'confirm'), complete);
  }
});
test('single-report claims also require both confirmations', () => {
  let db = fixture(); delete db.claims[0].relatedReportId;
  db = act(act(act(db, 'owner', 'approved'), 'claimant', 'confirm'), 'owner', 'confirm');
  assert.equal(db.reports[0].status, 'returned');
  assert.equal(db.reports[1].status, 'open');
});
test('claimant cannot review, while Admin review produces an activity record', () => {
  assert.throws(() => act(fixture(), 'claimant', 'approved'), /owner/i);
  const db = act(fixture(), 'admin', 'approved');
  assert.equal(db.activity[0].actorId, 'admin');
});
test('every state update notifies both claim participants', () => {
  const db = approved();
  assert.deepEqual(db.notifications.map((notice) => notice.userId).sort(), ['claimant', 'owner']);
  assert.ok(db.notifications.every((notice) => notice.href === '/claims/claim'));
});
test('pending claimant can cancel, but pending owner must reject', () => {
  assert.throws(() => act(fixture(), 'owner', 'cancel', 'We cannot arrange a meeting'), /cancelled/i);
  assert.equal(act(fixture(), 'claimant', 'cancel', 'I found the correct item elsewhere').claims[0].status, 'cancelled');
});
test('approved claims cancel only before either handover confirmation', () => {
  assert.equal(act(approved(), 'owner', 'cancel', 'The identifying details do not match').claims[0].status, 'cancelled');
  const db = act(approved(), 'owner', 'confirm');
  assert.throws(() => act(db, 'claimant', 'cancel', 'We need to arrange another meeting'), /dispute/i);
});
test('dispute pauses completion and stays open for private messages', () => {
  let db = act(approved(), 'owner', 'confirm');
  db = act(db, 'claimant', 'dispute', 'I have not physically received this item');
  assert.equal(db.claims[0].status, 'disputed');
  assert.equal(canMessageClaim(db.claims[0]), true);
  assert.throws(() => act(db, 'claimant', 'confirm'), /undisputed/i);
  assert.ok(db.reports.every((report) => report.status === 'open'));
});
test('only Admin can resolve a dispute and a reason is mandatory', () => {
  const db = act(approved(), 'owner', 'dispute', 'The parties disagree about the handover');
  assert.throws(() => act(db, 'claimant', 'resume', 'We spoke about the matter privately'), /admin/i);
  assert.throws(() => act(db, 'admin', 'resume', 'short'), /reason/i);
  const next = act(db, 'admin', 'resolve_cancel', 'Verified that no item was exchanged');
  assert.equal(next.claims[0].status, 'cancelled');
  assert.equal(next.activity[0].reason, 'Verified that no item was exchanged');
});
test('resuming after a dispute requires fresh confirmations from both parties', () => {
  let db = act(act(approved(), 'owner', 'confirm'), 'claimant', 'dispute', 'We need an Admin to check the item');
  db = act(db, 'admin', 'resume', 'Reviewed evidence and arranged another handover');
  assert.equal(db.claims[0].ownerConfirmedAt, undefined);
  assert.equal(db.claims[0].claimantConfirmedAt, undefined);
  db = act(db, 'claimant', 'confirm');
  assert.equal(db.claims[0].status, 'approved');
});
test('shared or mirrored approved reservations block another approval', () => {
  const db = approved();
  db.claims.push({ id: 'other', reportId: 'lost', relatedReportId: 'found', claimantId: 'owner', status: 'pending' });
  assert.throws(() => applyClaimAction(db, 'claimant', 'other', { type: 'approved' }, time), /reserved/i);
});
test('incompatible or unavailable linked reports block approval', () => {
  for (const change of [{ category: 'Wallet' }, { type: 'found' }, { status: 'returned' }, { ownerId: 'stranger' }]) {
    const db = fixture(); Object.assign(db.reports[1], change);
    assert.throws(() => act(db, 'owner', 'approved'), /linked/i);
  }
});
test('completion closes competing pending claims and terminal claims cannot message', () => {
  let db = approved();
  db.claims.push({ id: 'other', reportId: 'found', claimantId: 'stranger', status: 'pending' });
  db = act(act(db, 'owner', 'confirm'), 'claimant', 'confirm');
  assert.equal(db.claims[1].status, 'cancelled');
  assert.equal(canMessageClaim(db.claims[1]), false);
  assert.equal(canMessageClaim(db.claims[0]), false);
});
test('suspended users cannot transition claims and inputs remain unchanged', () => {
  const db = approved(); const snapshot = JSON.stringify(db);
  act(db, 'owner', 'confirm'); assert.equal(JSON.stringify(db), snapshot);
  db.users[0].suspended = true;
  assert.throws(() => act(db, 'owner', 'confirm'), /active/i);
});
