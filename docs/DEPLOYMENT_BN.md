# FindBack অনলাইনে চালানোর নিয়ম

## GitHub push, localhost এবং live website

`git push` code GitHub-এ রাখে। `npm run dev` তোমার কম্পিউটারে app চালায়। Public URL-এ app চালাতে hosting-এ আলাদা deployment দরকার। এই project এখনো deploy করা হয়নি, তাই live update না দেখা deployment না হওয়ার ফল।

বর্তমান app-এ dynamic item/claim routes, Auth callbacks, cookies ও session proxy আছে। এই সংস্করণের জন্য Next.js সমর্থিত Node hosting ব্যবহার করবে। শুধু source file GitHub Pages-এ দিলেই app চলবে না; static export-এ প্রয়োজনীয় server features সমর্থিত নয়। [Next.js deployment guide](https://nextjs.org/docs/app/getting-started/deploying), [static export limitations](https://nextjs.org/docs/app/guides/static-exports#unsupported-features)।

## প্রথমে Demo website

Vercel একটি সমর্থিত বিকল্প। [Vercel-এর Next.js নির্দেশনা](https://vercel.com/docs/frameworks/full-stack/nextjs)।

1. Vercel-এ GitHub account connect করে `nasifparvezst/FindBack` repository import করো।
2. Framework **Next.js**, root directory project root, install command `npm ci`, build command `npm run build` রাখো। Output directory-র Next.js default রাখো; `out` বা source folder নির্বাচন করবে না। Node **22 বা পরবর্তী সমর্থিত version** নির্বাচন করো।
3. Environment variables-এ `NEXT_PUBLIC_DEMO_MODE=true` রাখো। প্রথম build-এর জন্য Production এবং পরের branch previews-এর জন্য Preview—দুই environment-এ মানটি রাখবে। Demo চালাতে Supabase key লাগবে না।
4. যে deployment দেখছ, তার branch ও commit মিলিয়ে নেবে। বর্তমান Next.js updates আছে `codex/baseline-audit`-এ; `main`-এ এখনো পুরোনো code থাকতে পারে।
5. Import যদি `main` নেয়, project-এর **Deployments → Create Deployment** থেকে Git reference হিসেবে `codex/baseline-audit` দিয়ে build করো। এটি নতুন branch merge না করেই review করার পথ। পরবর্তী non-production branch pushes সাধারণত Preview URL তৈরি করে; সন্তুষ্ট হলে তুমি নিজে `main`-এ merge করবে। [Git deployment workflow](https://vercel.com/docs/git#creating-a-deployment-from-a-git-reference)।
6. Vercel-এর প্রথম deployment Production হিসেবে গণ্য হয়, অন্য branch থেকেও হতে পারে; তারপর usual Preview নিয়ম চলে। তাই প্রথমে Demo configuration-ই ব্যবহার করো। [Vercel environments](https://vercel.com/docs/deployments/environments#first-deployment)।

Deployment সফল হলে generated URL খুলে Home, Browse, Smart Matches, report form ও item details দেখো। নতুন push-এর পরে latest deployment **Ready** হয়েছে এবং সঠিক branch/commit নিয়েছে কি না যাচাই করো।

Demo website-এ data প্রত্যেক browser-এর local storage-এ থাকে। দুই ব্যক্তি আলাদা device থেকে একই shared database দেখবে না। Public URL পাওয়া আর real multi-user Cloud Mode প্রস্তুত হওয়া আলাদা ধাপ।

## পরে real Supabase Cloud Mode

1. `STEP2_SETUP.md` অনুসারে Supabase project, migrations, email confirmation এবং Auth templates প্রস্তুত করো। Migration-এর প্রভাব পর্যালোচনা করে তারপর প্রয়োগ করবে।
2. সংশ্লিষ্ট hosting environment-এ এগুলো দেবে:

```env
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
```

3. Supabase Auth-এর Site URL ও allowed redirect URLs-এ আসল deployed origin ব্যবহার করো। `/auth/confirm`, `/auth/callback` এবং `/reset-password` প্রয়োজন অনুযায়ী allow করো; hosted app-এর জন্য শুধু `localhost` configuration যথেষ্ট নয়।
4. Environment বদলানোর পরে নতুন build/deployment করো। `.env.local` GitHub-এ push করবে না; hosting dashboard-এ environment values বসাবে। Service-role key frontend variables-এ দেবে না।
5. আলাদা verified students এবং trusted Admin দিয়ে `SECURITY_TEST_CHECKLIST.md` সম্পন্ন করো। বর্তমান handover এখনো দুই পক্ষের আলাদা confirmation চায় না; সেটি Phase 2-তে যোগ হবে।

## অন্য Node hosting হলে

এই project-এর `package.json` থাকা branch checkout করে Node 22+ দিয়ে:

```sh
npm ci
npm run build
npm start
```

Hosting-এর দেওয়া `PORT` অনুযায়ী process চালাও এবং public domain ওই service-এ যুক্ত করো। `npm run dev` development-এর জন্য। কোনো hosting account বা live deployment এই guide তৈরির সময় পরিবর্তন করা হয়নি।
