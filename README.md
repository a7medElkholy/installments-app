# نظام إدارة الأقساط (React + Supabase)

## 1) إعداد Supabase
1. أنشئ مشروع على supabase.com.
2. من SQL Editor شغّل محتوى `supabase/schema.sql` كاملًا.
3. من Authentication > Users اضغط Add user وأنشئ حساب المالك (إيميل وباسورد، فعّل Auto Confirm).
4. من Authentication > Sign In / Providers عطّل "Allow new users to sign up" عشان محدش غيرك يسجل.
5. من Project Settings > API انسخ Project URL و anon public key.

## 2) تشغيل المشروع
```
cp .env.example .env     # ثم ضع القيمين
npm install
npm run dev
```

## 3) النشر
`npm run build` ثم ارفع مجلد `dist` على Vercel أو Netlify (ضع نفس متغيرات .env في إعدادات الموقع).

## ملاحظات
- كل الجداول محمية بـ Row Level Security: كل مالك يرى بياناته فقط.
- إنشاء العميل وتسجيل الدفع يتمان عبر دوال SQL (عمليات ذرية).

## تحديث (النسبة والتقارير)
لو كنت شغّلت `schema.sql` القديم قبل كده: شغّل `supabase/migration_interest.sql` مرة واحدة من SQL Editor (بيحافظ على بياناتك).
لو بتبدأ من الصفر: `schema.sql` الجديد كفاية.

## تحديث (تعديل العميل)
شغّل `supabase/migration_edit.sql` مرة واحدة من SQL Editor (مضاف أيضًا في schema.sql للبدء من الصفر).

## تحديث (المستخدمون والصلاحيات + المنتج + صورة البطاقة)
1. شغّل `supabase/migration_users.sql` مرة واحدة من SQL Editor (المستخدم الحالي يصير مديرًا تلقائيًا).
2. انشر دالة إنشاء المستخدمين: من Dashboard اختر Edge Functions ثم Deploy a new function، سمّها `manage-users` والصق محتوى `supabase/functions/manage-users/index.ts`. (أو بالـ CLI: `supabase functions deploy manage-users`).
3. سجّل دخول بحساب المالك وستجد تبويب "المستخدمون".
