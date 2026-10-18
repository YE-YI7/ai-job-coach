# 手机号登录与绑定

- Mode: Operate
- Primary target: components/auth/PhoneAuthForm.tsx
- Related: components/auth/PhoneAuthForm.module.css; app/login/LoginClient.tsx
- Preserve the incumbent login gradient atmosphere, fonts, logo and alternate login methods. Do not redesign cockpit or resume paper.
- One primary action per step: request code, then verify. Keep explicit SMS consent and account-creation notice. Put detailed processing disclosures in the existing privacy page and uncommon association rules behind disclosure.
- A denied send must name its actual waiting period; 429 disables only the affected action. Refresh can restore non-sensitive wait UX, never create auth proof or bypass server budgets. Never persist phone or OTP in this UX cache.
- Keyboard focus, input white surface, reduced motion and 390px operation remain required. Completed UI/DB tests are not evidence of a real SMS login or acceptance of the aesthetic.
