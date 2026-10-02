# dev-dashboard 🗂️

pane สรุปว่า session นี้ทำอะไรไปแล้วบ้าง: ไฟล์ที่แก้ คำสั่งที่รัน ผล test สิ่งที่ถูกบล็อก และ token ที่ใช้

```bash
claude plugin marketplace add sonata39-star/claude-mod   # ครั้งเดียว
claude plugin install dev-dashboard@claude-mod
```

## หน้าตา

> ตัวอย่างวาดจากผลที่ test ตรวจ ข้อมูลสมมติ บนจอจริงมีสี

```
12 turns · รวม 18m 40s · ล่าสุด 1m 05s · $1.23

Context  ใช้ไป 42% · เหลือ 58%
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱
5-hour limit  ใช้ไป 24% · เหลือ 76% · รีเซ็ต 14:30 · อีก 2ชม 13น
▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱

ไฟล์ที่แก้ (3)
 ×4 src/auth/login.ts 12:10
 ×2 src/auth/login.test.ts 12:08
 ×1 README.md 11:52

คำสั่งล่าสุด
 ✓ npm test -- login
 ✗ npx tsc --noEmit
 … npm run build

ผล test / check
 ✓ ผ่าน npm test -- login 12:11
 ✗ พัง npx tsc --noEmit 12:09

ถูกบล็อก (1)
 ⛔ Bash: dev-guard blocked this Bash call: force-push to main

[ ล้างรายการ ]
```

## ใช้งาน

| คำสั่ง / ปุ่ม | ทำอะไร |
| --- | --- |
| `/dashboard` | เปิด pane (จอแคบก็เปิดได้) |
| `/dashboard close` | ปิด pane |
| `c` หรือปุ่ม "ล้างรายการ" | ล้างรายการทั้งหมด |

- เปิดเองตอนเริ่ม session ถ้าจอกว้างตั้งแต่ 144 คอลัมน์ขึ้นไป
- แถบ usage สีเขียว < 60% · เหลือง 60–85% · แดง > 85%
- `/clear` เริ่มนับใหม่

[← กลับไปหน้ารวม](../README.md)
