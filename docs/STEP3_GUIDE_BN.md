# FindBack 2.0 -- Step 3 (Bangla Guide)

## এই ধাপে কী যোগ হয়েছে?

1. Lost/Found report তৈরি, edit এবং delete workflow আরও পরিষ্কার করা হয়েছে।
2. একই ধরনের open report থাকলে submit করার আগে সম্ভাব্য duplicate warning দেখাবে। এটি warning মাত্র; ভুল করে নতুন report আটকে দেবে না।
3. Browse page-এ search, category/type/status/date filter, sorting এবং pagination আছে।
4. My Reports page-এ report ও claim search, status filter, summary এবং pagination আছে।
5. Report edit করে পুরোনো ছবি পরিবর্তন বা remove করলে cloud storage থেকে পুরোনো ছবিটি পরিষ্কার করার ব্যবস্থা আছে।
6. ID Card category-তে photo upload বন্ধ। কারণ item photo public হলে ID card number, QR code বা ব্যক্তিগত তথ্য প্রকাশ হয়ে যেতে পারে।

## Folder structure কেন ছোট করা হয়েছে?

মূল Application চালাতে এই অংশগুলো দরকার:

- `src/` -- Next.js application code
- `public/` -- logo ও static assets
- `supabase/` -- database migration SQL
- `tests/` -- automated tests
- `docs/` -- setup ও security guide

পুরোনো `legacy-v4/`, `reference/` এবং `design-preview.html` মূল application চালানোর জন্য দরকার নেই। এগুলো main project ZIP থেকে সরানো হয়েছে। পুরোনো V4 source আলাদা backup ZIP হিসেবে দেওয়া হয়েছে।

`node_modules/` এবং `.next/` নিজে থেকে তৈরি হওয়া folder:

- `node_modules/` npm packages রাখে। Application চালানোর সময় এটি প্রয়োজন। `npm install` আবার তৈরি করতে পারে।
- `.next/` Next.js build/cache রাখে। Server বন্ধ করে মুছে ফেললেও Next.js আবার তৈরি করবে।

এগুলো ZIP-এ রাখা হয়নি, কারণ এগুলো বড় এবং প্রত্যেক PC-তে আলাদাভাবে তৈরি হয়।

## Windows-এ চালানোর নিয়ম

1. ZIP Extract করো।
2. VS Code-এ সেই folder Open করো, যেখানে `package.json` আছে।
3. `.env.example` copy করে একই folder-এ `.env.local` নামে save করো। Demo চালাতে `NEXT_PUBLIC_DEMO_MODE=true` রাখো।
4. VS Code Terminal-এ চালাও:

```bash
npm install
npm run dev
```

5. Chrome-এ `http://localhost:3000` খোলো।
6. বন্ধ করতে Terminal-এ `Ctrl + C` চাপো।

## Supabase database migration

Cloud mode ব্যবহার করতে হলে Supabase SQL Editor-এ নিচের দুটি SQL file ক্রমানুসারে চালাতে হবে:

1. `supabase/migrations/202611050001_initial.sql`
2. `supabase/migrations/202611060001_report_management_privacy.sql`

যদি প্রথম migration আগেই চালানো হয়ে থাকে, দ্বিতীয় migration-টি একবার চালাবে। একই migration বারবার চালাবে না।

তারপর `.env.local`-এ নিজের Supabase Project URL ও Publishable Key বসিয়ে `NEXT_PUBLIC_DEMO_MODE=false` করবে এবং dev server restart করবে। `.env.local` কখনো কাউকে পাঠাবে না।

## Test

```bash
npm test
```

এই release-এ 17টি automated logic test pass করেছে। Live Supabase test এবং production build এখনও তোমার PC/Supabase project-এ চালিয়ে যাচাই করতে হবে।
