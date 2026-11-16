# FindBack অনলাইনে চালানোর নিয়ম

বর্তমান FindBack real Supabase Cloud Mode-এ Vercel-এ live: **https://findback-pi.vercel.app**। নয়টি migration apply হয়েছে এবং ব্যবহারকারী live website-এ campus Google login সফল বলে নিশ্চিত করেছেন। Vercel project হলো `nasifparvezst/findback`; deployment source branch `codex/baseline-audit`।

## GitHub push, localhost এবং live website

`git push` code GitHub-এ রাখে। `npm run dev` তোমার কম্পিউটারে app চালায়। বর্তমান production deployment Vercel CLI দিয়ে করা হয়েছে; automatic Git deployment এখনো connect করা নেই। নতুন code website-এ দিতে একই Vercel project-এ আবার deploy করতে হবে। `main`-এ merge করা হয়নি।

বর্তমান app-এ dynamic item/claim routes, Auth callbacks, cookies ও session proxy আছে। এই সংস্করণের জন্য Next.js সমর্থিত Node hosting ব্যবহার করবে। শুধু source file GitHub Pages-এ দিলেই app চলবে না; static export-এ প্রয়োজনীয় server features সমর্থিত নয়। [Next.js deployment guide](https://nextjs.org/docs/app/getting-started/deploying), [static export limitations](https://nextjs.org/docs/app/guides/static-exports#unsupported-features)।

## Demo website চালানোর বিকল্প

Vercel একটি সমর্থিত বিকল্প। [Vercel-এর Next.js নির্দেশনা](https://vercel.com/docs/frameworks/full-stack/nextjs)।

1. Vercel-এ GitHub account connect করে `nasifparvezst/FindBack` repository import করো।
2. Framework **Next.js**, root directory project root, install command `npm ci`, build command `npm run build` রাখো। Output directory-র Next.js default রাখো; `out` বা source folder নির্বাচন করবে না। Node **22 বা পরবর্তী সমর্থিত version** নির্বাচন করো।
3. Environment variables-এ `NEXT_PUBLIC_DEMO_MODE=true` রাখো। প্রথম build-এর জন্য Production এবং পরের branch previews-এর জন্য Preview—দুই environment-এ মানটি রাখবে। Demo চালাতে Supabase key লাগবে না। একই mode স্থানীয় `.env.local`-এ দিয়ে `npm run release:check -- --mode demo` চালালে configuration যাচাই হবে; এটি production build বা FINAL AUDIT চালায় না।
4. যে deployment দেখছ, তার branch ও commit মিলিয়ে নেবে। বর্তমান Next.js updates আছে `codex/baseline-audit`-এ; `main`-এ এখনো পুরোনো code থাকতে পারে।
5. Import যদি `main` নেয়, project-এর **Deployments → Create Deployment** থেকে Git reference হিসেবে `codex/baseline-audit` দিয়ে build করো। এটি নতুন branch merge না করেই review করার পথ। পরবর্তী non-production branch pushes সাধারণত Preview URL তৈরি করে; সন্তুষ্ট হলে তুমি নিজে `main`-এ merge করবে। [Git deployment workflow](https://vercel.com/docs/git#creating-a-deployment-from-a-git-reference)।
6. Vercel-এর প্রথম deployment Production হিসেবে গণ্য হয়, অন্য branch থেকেও হতে পারে; তারপর usual Preview নিয়ম চলে। তাই প্রথমে Demo configuration-ই ব্যবহার করো। [Vercel environments](https://vercel.com/docs/deployments/environments#first-deployment)।

Deployment সফল হলে generated URL খুলে Home, Browse, Smart Matches, report form ও item details দেখো। নতুন push-এর পরে latest deployment **Ready** হয়েছে এবং সঠিক branch/commit নিয়েছে কি না যাচাই করো।

Demo website-এ data প্রত্যেক browser-এর local storage-এ থাকে। দুই ব্যক্তি আলাদা device থেকে একই shared database দেখবে না। Public URL পাওয়া আর real multi-user Cloud Mode প্রস্তুত হওয়া আলাদা ধাপ।

## Real Supabase Cloud Mode

1. `STEP2_SETUP.md` অনুসারে Supabase project, migrations, email confirmation এবং Auth templates প্রস্তুত করো। Migration-এর প্রভাব পর্যালোচনা করে তারপর প্রয়োগ করবে।
2. সংশ্লিষ্ট hosting environment-এ এগুলো দেবে:

```env
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR-PUBLISHABLE-KEY
SUPABASE_SECRET_KEY=YOUR-SERVER-ONLY-SECRET-KEY
APP_ORIGIN=https://YOUR-DEPLOYED-DOMAIN
```

`APP_ORIGIN` server-only; `NEXT_PUBLIC_` prefix দেবে না। শুধু HTTPS origin দেবে, কোনো path/query/trailing credential নয়। Production Cloud build-এ এটি বাধ্যতামূলক। Supabase URL ও publishable key-ও যাচাই হয়; secret/service-role key দিলে build বন্ধ হবে। Development-এ HTTP localhost চলবে।

`SUPABASE_SECRET_KEY`-ও server-only এবং Vercel-এ Secret হিসেবে রাখা হয়েছে; Admin account তৈরি করতে এটি লাগে। বর্তমান production `APP_ORIGIN` হলো `https://findback-pi.vercel.app`। Local `.env.local` ও `.vercel` project-link data Git-এ যাবে না; `.vercelignore` local environment এবং generated/test files-ও upload থেকে বাদ দেয়।

3. Supabase Auth-এর Site URL ও allowed redirect URLs-এ ওই deployed origin ব্যবহার করো। `/auth/confirm`, `/auth/callback` এবং `/reset-password` প্রয়োজন অনুযায়ী allow করো; hosted app-এর জন্য শুধু `localhost` configuration যথেষ্ট নয়। Preview-তে Cloud Auth পরীক্ষা করলে সেই preview-এর সঠিক `APP_ORIGIN` ও Supabase allowlist লাগবে; অজানা origin wildcard দিয়ে খুলে দেবে না।
4. Environment বদলানোর পরে নতুন build/deployment করো। `.env.local` GitHub-এ push করবে না; hosting dashboard-এ environment values বসাবে। Service-role key frontend variables-এ দেবে না।
5. Environment values বসিয়ে `npm run release:check -- --mode cloud` চালাও। এটি mode, URL, public key ও canonical origin যাচাই করে; Supabase connection, migrations বা email delivery পরীক্ষা করে না।
6. আগের local **FINAL AUDIT/FIX**-এর ফলাফল `FINAL_AUDIT.md`-তে আছে। বর্তমান Cloud setup-এর নয়টি migration apply হয়েছে; remote version mapping `CLOUD_SETUP_STATUS.md`-তে আছে। একই migration আবার চালাবে না। Campus signup/sign-in এবং real Admin API যাচাই হয়েছে। Pilot deployment-এর সময় Google login, ছবি upload, chat ও notification-এর প্রয়োজনীয় live checks করবে; নতুন full audit শুধু `FINAL AUDIT` নির্দেশ পেলে হবে। Handover-এ দুই পক্ষের আলাদা confirmation লাগে; Admin তাদের হয়ে confirm করতে পারে না।

## এই phase-এ কী যাচাই হয়েছে

Local targeted security tests এবং Chrome Demo flow পাস হয়েছে। Flow-তে report/photo, matching, claim/chat, guest access ও দুই পক্ষের handover আছে। আবার চালাতে একটি terminal-এ `npm run dev -- --hostname 127.0.0.1 --port 3100`, অন্য terminal-এ `npm run e2e:demo` দেবে। Chrome/Chromium installed থাকতে হবে; ফলাফল `.test-build/e2e/`-তে থাকে। `.github/workflows/release-checks.yml` একই targeted checks হাতে চালানোর workflow দেয়; GitHub-এ এটি এখনো চালানো হয়নি।

আগের FINAL AUDIT-এ full existing suite, lint/type checks এবং Demo ও isolated Cloud production build পাস হয়েছে; পরের fixes-এর affected tests-ও পাস করেছে। সর্বশেষ real Cloud setup ও Vercel production build/API/browser checks-এর ফল `CLOUD_SETUP_STATUS.md`-তে আছে।

## অন্য Node hosting হলে

এই project-এর `package.json` থাকা branch checkout করে Node 22+ দিয়ে:

```sh
npm ci
npm run build
npm start
```

Hosting-এর দেওয়া `PORT` অনুযায়ী process চালাও এবং public domain ওই service-এ যুক্ত করো। `npm run dev` development-এর জন্য।
