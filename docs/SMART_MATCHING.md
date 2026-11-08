# Phase 1: explainable Smart Matching

The existing Step 3 matching engine is extended in `src/lib/matching.ts`; it remains a deterministic text heuristic. The same scoring function is used by the match page and Demo potential-match notices. Matching never approves a claim or changes a report's status.

## Eligible candidates

- Both reports must be open, in the same category, and have opposite Lost/Found types and different owners.
- A signed-in student's suggestions must involve one of that student's reports. Admin/public views can compare all eligible public reports.
- Repeated input rows are deduplicated by report ID. Tied scores use report IDs for stable ordering.
- Known item dates must be within 30 days of each other by default. `maxDaysApart` can change this window; `null` disables the limit. This refers to the interval between item dates, not the age of a report today.
- Missing or invalid dates give no date bonus and are explicitly explained. They do not crash scoring. Impossible calendar dates are not silently rolled into another month.

The default window reduces unrelated campus candidates, at the cost of missing some recoveries found much later. Those reports remain available through Browse; the window can be enlarged or disabled as the campus collects real feedback.

## Normalization and scoring

Text uses Unicode NFKC, deterministic lowercase and word extraction that preserves combining marks, including Bangla vowel marks. Whitespace/punctuation is normalized and optional zero-width joiners are removed. Empty and recognized unknown brand/color values are not positive evidence. Company suffixes and common color spelling variants are handled conservatively; overlapping wording is not automatically a contradiction.

| Signal | Points |
| --- | --- |
| Same category | 12 |
| Item-name word overlap | Up to 32 |
| Exact normalized brand | 18 |
| Conflicting brands | -30 |
| Exact normalized color | 10 |
| Overlapping color wording | 6 |
| Conflicting colors | -18 |
| Location word overlap | Up to 12 |
| Description word overlap | Up to 8 |
| Item dates within 1 day / within 7 days | 8 / 4 |

The positive weights total 100. Generic category/color/location language repeated in free text is insufficient identifying evidence. Without distinctive shared text, confidence is capped below Strong; without a matching known brand, it is capped below the suggestion threshold. Any cap is an explicit negative adjustment in the explanation.

The final score is the sum of signal points, bounded to 0–100. Strong starts at 75; Possible at 48; lower scores are Weak and are not suggested. These labels are calibrated against controlled fixtures, not real-world ownership outcomes or measured probabilities. Brand/color contradictions cannot reach Strong under these weights.

Each result retains `reasons` for compatibility and adds structured `signals` with label, signed points and positive/negative/neutral kind. The UI shows every signal, including contradictions and confidence adjustments, and displays `score/100`. It keeps the ownership disclaimer and the existing 25-card limit, with a count when more candidates exist.

## Validation and limits

The 44-test suite includes the original matching, duplicate and validation/statistics tests plus 27 new cases: exact/partial matches, missing and unknown fields, Unicode/case/punctuation, Bangla combining marks and equivalent spellings, color variants, brand wording, vague details, invalid dates, window boundaries/configuration, returned/same-owner reports, repeated pairs, stable ordering, symmetry, immutability and explanation arithmetic.

Verified locally on 9 November 2026: all 44 tests, typecheck, lint with zero warnings, and the production build passed. An isolated headless Chrome production smoke check confirmed `/100` scores, visible brand/color penalties, excluded same-owner/returned/out-of-window reports, mobile layout at 390px, and navigation from a candidate into the existing private claim form. The existing Browse/My Reports pagination and route smoke checks also passed without browser runtime exceptions.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. For UI verification, open Smart Matches in Demo Mode, compare a normal pair with one whose color differs, and confirm the negative reason and lower score remain visible. Confirm same-owner and returned reports do not appear. Test a mobile viewport as well.

No SQL migration or live cloud change is part of this phase. Candidate quality still depends on report details and the loaded data. Cloud reads remain capped at 500 rows, so the page cannot discover candidates absent from that snapshot. Large-scale database matching, translation of arbitrary text and AI image matching are not implemented. Live multi-user tests remain required before production use.
