const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateMatchScore, findMatches, DEFAULT_MATCH_WINDOW_DAYS } = require('../.test-build/matching.js');

const base = {
  id: 'lost-1', type: 'lost', category: 'Phone', title: 'iPhone 15 Pro', brand: 'Apple',
  color: 'Black', description: 'Black iPhone with blue sticker clear case', location: 'Central Library',
  occurredOn: '2026-11-04', status: 'open', ownerId: 'a', contactPhone: '',
  createdAt: '2026-11-04T10:00:00Z', updatedAt: '2026-11-04T10:00:00Z',
};
const found = { ...base, id: 'found-1', type: 'found', ownerId: 'b' };
const signal = (result, label) => result.signals.find((entry) => entry.label === label);

test('exact identifying details score 100 and Strong', () => {
  const result = calculateMatchScore(base, found);
  assert.equal(result.score, 100);
  assert.equal(result.confidence, 'Strong');
});

test('partial identifying overlap remains Possible', () => {
  const result = calculateMatchScore({ ...base, title: 'iPhone 15', brand: '', color: '' }, { ...found, brand: '', color: '' });
  assert.ok(result.score >= 48 && result.score < 75);
  assert.equal(result.confidence, 'Possible');
});

test('a contradictory brand lowers confidence despite otherwise exact details', () => {
  const result = calculateMatchScore(base, { ...found, brand: 'Samsung' });
  assert.equal(signal(result, 'Different brands').points, -30);
  assert.equal(signal(result, 'Different brands').kind, 'negative');
  assert.notEqual(result.confidence, 'Strong');
});

test('a contradictory color prevents a Strong result', () => {
  const result = calculateMatchScore(base, { ...found, color: 'White' });
  assert.equal(signal(result, 'Different colors').points, -18);
  assert.equal(result.confidence, 'Possible');
});

test('missing identifying fields earn no brand, color, text or location bonus', () => {
  const empty = { title: '', brand: '', color: '', description: '', location: '' };
  const result = calculateMatchScore({ ...base, ...empty }, { ...found, ...empty });
  assert.equal(result.score, 20);
  assert.deepEqual(result.reasons, ['Same category', 'Item dates within 1 day']);
});

test('unknown brand and color markers behave like empty fields', () => {
  const empty = calculateMatchScore({ ...base, brand: '', color: '' }, { ...found, brand: '', color: '' });
  for (const value of ['Unknown', 'N/A', 'Not specified', 'অজানা', 'জানা নেই']) {
    assert.deepEqual(calculateMatchScore({ ...base, brand: value, color: value }, { ...found, brand: value, color: value }), empty);
  }
});

test('case, whitespace, punctuation and compatibility Unicode normalize consistently', () => {
  const changed = {
    ...found, title: '  ＩＰＨＯＮＥ １５ — PRO! ', brand: ' APPLE, INC. ', color: ' BLACK ',
    description: ' BLACK iPhone, with BLUE sticker; CLEAR case! ', location: ' CENTRAL---LIBRARY ',
  };
  assert.equal(calculateMatchScore(base, changed).score, 100);
});

test('different Bangla vowel marks do not collapse to the same word', () => {
  const result = calculateMatchScore({ ...base, title: 'কল' }, { ...found, title: 'কাল' });
  assert.equal(signal(result, 'Similar item name'), undefined);
});

test('canonically equivalent Bangla and optional zero-width joiners match', () => {
  const a = { ...base, title: 'গা\u09dcি চাবি' };
  const b = { ...found, title: 'গা\u09a1\u09bcি চা\u200dবি' };
  assert.equal(signal(calculateMatchScore(a, b), 'Similar item name').points, 32);
});

test('grey/gray spelling and common Bangla color names are compatible', () => {
  for (const [a, b] of [['Grey', 'gray'], ['কালো', 'black'], ['নীল', 'blue']]) {
    assert.equal(signal(calculateMatchScore({ ...base, color: a }, { ...found, color: b }), 'Same color').points, 10);
  }
});

test('identifying Bangla details produce a usable candidate pair', () => {
  const details = { title: 'স্যামসাং মোবাইল', brand: '', color: 'কালো', description: 'কভারে নীল স্টিকার আছে' };
  assert.equal(findMatches([{ ...base, ...details }, { ...found, ...details }]).length, 1);
});

test('company suffixes do not create a brand contradiction', () => {
  assert.equal(signal(calculateMatchScore(base, { ...found, brand: 'Apple Inc.' }), 'Same brand').points, 18);
});

test('overlapping brand wording earns neither an exact bonus nor a contradiction penalty', () => {
  const result = calculateMatchScore(base, { ...found, brand: 'Apple Electronics' });
  assert.equal(signal(result, 'Different brands'), undefined);
  assert.equal(signal(result, 'Same brand'), undefined);
  assert.equal(signal(result, 'Brand wording overlaps; no brand bonus').points, 0);
});

test('overlapping color descriptions earn a partial bonus', () => {
  const result = calculateMatchScore({ ...base, color: 'Navy blue' }, { ...found, color: 'Blue' });
  assert.equal(signal(result, 'Different colors'), undefined);
  assert.equal(signal(result, 'Overlapping color descriptions').points, 6);
});

test('vague generic details without a brand stay Weak', () => {
  const a = { ...base, title: 'Black phone', brand: '', description: 'Phone near central library' };
  const b = { ...found, title: a.title, brand: '', description: a.description };
  const result = calculateMatchScore(a, b);
  assert.equal(result.confidence, 'Weak');
  assert.ok(signal(result, 'Limited identifying details reduce confidence').points < 0);
});

test('a matching brand cannot make vague details Strong', () => {
  const a = { ...base, title: 'Black phone', description: 'Phone near central library' };
  const b = { ...found, title: a.title, description: a.description };
  assert.equal(calculateMatchScore(a, b).confidence, 'Possible');
});

test('date proximity contributes the documented 8, 4 or 0 points', () => {
  assert.equal(signal(calculateMatchScore(base, { ...found, occurredOn: '2026-11-05' }), 'Item dates within 1 day').points, 8);
  assert.equal(signal(calculateMatchScore(base, { ...found, occurredOn: '2026-11-11' }), 'Item dates within 7 days').points, 4);
  assert.equal(signal(calculateMatchScore(base, { ...found, occurredOn: '2026-11-12' }), 'Item dates 8 days apart; no date bonus').points, 0);
});

test('invalid and impossible dates give no bonus and never produce NaN', () => {
  for (const value of ['', 'not-a-date', '2026-02-30', '2026-13-01']) {
    const result = calculateMatchScore(base, { ...found, occurredOn: value });
    assert.ok(Number.isFinite(result.score));
    assert.equal(signal(result, 'Date unavailable or invalid; no date bonus').points, 0);
    assert.equal(result.score, 92);
  }
});

test('the default 30-day window includes its boundary and excludes older pairs', () => {
  assert.equal(DEFAULT_MATCH_WINDOW_DAYS, 30);
  assert.ok(calculateMatchScore(base, { ...found, occurredOn: '2026-12-04' }).score >= 48);
  const old = { ...found, occurredOn: '2026-12-05' };
  assert.equal(calculateMatchScore(base, old).score, 0);
  assert.equal(findMatches([base, old]).length, 0);
});

test('date windows can be enlarged, disabled or restricted to the same day', () => {
  const old = { ...found, occurredOn: '2027-01-04' };
  assert.equal(findMatches([base, old]).length, 0);
  assert.equal(findMatches([base, old], undefined, { maxDaysApart: 90 }).length, 1);
  assert.equal(findMatches([base, old], undefined, { maxDaysApart: null }).length, 1);
  assert.equal(calculateMatchScore(base, { ...found, occurredOn: '2026-11-05' }, { maxDaysApart: 0 }).score, 0);
});

test('invalid window configuration fails clearly', () => {
  for (const maxDaysApart of [-1, NaN, Infinity]) {
    assert.throws(() => calculateMatchScore(base, found, { maxDaysApart }), RangeError);
    assert.throws(() => findMatches([], undefined, { maxDaysApart }), RangeError);
  }
});

test('same-owner candidates are excluded for students and administrators', () => {
  const ownFound = { ...found, ownerId: base.ownerId };
  assert.equal(findMatches([base, ownFound], base.ownerId).length, 0);
  assert.equal(findMatches([base, ownFound]).length, 0);
});

test('returned reports on either side are excluded', () => {
  assert.equal(findMatches([{ ...base, status: 'returned' }, found]).length, 0);
  assert.equal(findMatches([base, { ...found, status: 'returned' }]).length, 0);
});

test('duplicate input rows do not repeat candidate pairs', () => {
  assert.equal(findMatches([base, { ...base }, found, { ...found }]).length, 1);
});

test('equal-score ordering is deterministic across input order', () => {
  const reports = [{ ...base, id: 'lost-z' }, { ...found, id: 'found-z' }, { ...base, id: 'lost-a' }, { ...found, id: 'found-a' }];
  const pairs = (input) => findMatches(input).map((match) => [match.lost.id, match.found.id]);
  assert.deepEqual(pairs(reports), pairs([...reports].reverse()));
  assert.deepEqual(pairs(reports)[0], ['lost-a', 'found-a']);
});

test('all explanations account for the bounded score, including negative signals', () => {
  for (const color of ['Black', 'White', '']) {
    const result = calculateMatchScore(base, { ...found, color });
    assert.deepEqual(result.reasons, result.signals.map((entry) => entry.label));
    assert.equal(result.score, Math.max(0, Math.min(100, result.signals.reduce((sum, entry) => sum + entry.points, 0))));
    assert.ok(Number.isInteger(result.score));
  }
});

test('scoring is symmetric and does not mutate reports', () => {
  const a = Object.freeze({ ...base });
  const b = Object.freeze({ ...found, color: 'White' });
  assert.deepEqual(calculateMatchScore(a, b), calculateMatchScore(b, a));
  const reports = Object.freeze([a, b]);
  assert.equal(findMatches(reports).length, 1);
  assert.equal(reports[0], a);
});
