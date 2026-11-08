const test = require('node:test');
const assert = require('node:assert/strict');
const { findPossibleDuplicates } = require('../.test-build/duplicates.js');

const draft = {
  type: 'lost', category: 'Phone', title: 'iPhone 15 Pro', brand: 'Apple',
  color: 'Black', location: 'Central Library', occurredOn: '2026-11-05',
};
const report = {
  id: 'existing-1', ...draft, title: 'Apple iPhone 15 Pro', description: 'Black phone with a case',
  contactPhone: '01712345678', ownerId: 'user-2', status: 'open', createdAt: '2026-11-05T09:00:00Z', updatedAt: '2026-11-05T09:00:00Z',
};

test('similar open report is shown as a possible duplicate', () => {
  const matches = findPossibleDuplicates(draft, [report]);
  assert.equal(matches.length, 1);
  assert.ok(matches[0].score >= 55);
});

test('different report type is not treated as a duplicate', () => {
  assert.equal(findPossibleDuplicates(draft, [{ ...report, type: 'found' }]).length, 0);
});

test('different category is not treated as a duplicate', () => {
  assert.equal(findPossibleDuplicates(draft, [{ ...report, category: 'Wallet' }]).length, 0);
});

test('returned reports are excluded', () => {
  assert.equal(findPossibleDuplicates(draft, [{ ...report, status: 'returned' }]).length, 0);
});

test('editing a report excludes itself', () => {
  assert.equal(findPossibleDuplicates(draft, [report], report.id).length, 0);
});

test('unrelated generic items do not trigger a duplicate warning', () => {
  const unrelated = { ...report, title: 'Samsung Galaxy S22', brand: 'Samsung', color: 'White', location: 'Sports Ground' };
  assert.equal(findPossibleDuplicates(draft, [unrelated]).length, 0);
});
