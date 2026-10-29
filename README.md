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
