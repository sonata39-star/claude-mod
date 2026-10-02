# claude-mod

ชุด mod สำหรับ Claude Code ที่ช่วยงาน develop ประจำวัน ติดตั้งทีละตัวหรือทั้งชุดก็ได้ กดชื่อ mod เพื่อดูหน้าตาและวิธีใช้

| Mod | ทำอะไร |
| --- | --- |
| [🛡️ dev-guard](./dev-guard/) | บล็อกคำสั่งอันตราย ถามก่อนคำสั่งเสี่ยง และกันไม่ให้ secret/token หลุดลงโค้ด |
| [✅ auto-check](./auto-check/) | แก้ไฟล์ปุ๊บรัน linter ทันที และ type-check ก่อน Claude จบงาน ถ้าพังส่ง error กลับให้ Claude แก้ต่อ |
| [🔔 done-notify](./done-notify/) | เสียง + notification เมื่องานยาวเสร็จ หรือเมื่อ Claude รอให้ตอบ |
| [📊 dev-status](./dev-status/) | แถบ progress มีสีใต้ช่องพิมพ์: git branch, token ที่ใช้, limit 5 ชม. / 7 วัน พร้อมเวลารีเซ็ต, ค่าใช้จ่าย |
| [🗂️ dev-dashboard](./dev-dashboard/) | pane สรุป session: ไฟล์ที่แก้, คำสั่งที่รัน, ผล test, สิ่งที่ถูกบล็อก |
| [👥 team-flow](./team-flow/) | แถบแสดง pipeline BA → Lead → Dev → Review → Sec ของทีม agent |
| [📝 standup](./standup/) | `/standup` สรุปงานวันนี้เป็นภาษาไทย แล้วคัดลอกให้ |
| [ฅ(=•ω•=)ฅ neko](./neko/) | แมวผู้ช่วยนั่งเหนือช่องพิมพ์ ขยับตัวตามงาน คอยแนะนำ และตอบคำถามผ่าน `/neko` |

## ติดตั้ง

ต้องใช้ Claude Code เวอร์ชันที่รองรับ mod แบบ function hooks (ทดสอบบน 2.1.287)

```bash
# เพิ่ม marketplace (ครั้งเดียว)
claude plugin marketplace add sonata39-star/claude-mod

# ติดตั้งตัวที่ต้องการ
claude plugin install dev-guard@claude-mod
claude plugin install neko@claude-mod
# ...
```

หรือในหน้า Claude Code พิมพ์ `/plugin marketplace add sonata39-star/claude-mod` แล้วเลือกติดตั้งจาก `/plugin`
ติดตั้งแล้วเปิด Claude Code ใหม่หนึ่งครั้ง

อัปเดตเป็นเวอร์ชันล่าสุด:

```bash
claude plugin marketplace update claude-mod
claude plugin update neko@claude-mod
```

ค่าตั้งของแต่ละ mod ปรับได้ใน `/config` (ดูใน README ของแต่ละตัว)

## พัฒนาต่อ

แต่ละโฟลเดอร์คือ plugin หนึ่งตัว:

```
<mod>/
├── .claude-plugin/plugin.json   ← ชื่อ เวอร์ชัน ค่าตั้ง
├── hooks/                       ← โค้ด (register.ts / .tsx)
├── tests/                       ← test
└── README.md                    ← หน้าตาและวิธีใช้
```

แก้แบบ hot reload ได้โดยชี้ Claude Code มาที่โฟลเดอร์นั้น:

```bash
claude --plugin-dir neko
```

ตรวจและรัน test:

```bash
claude plugin validate neko
claude plugin test neko
```

ถ้าแก้ใน dev-mods ของ session ให้ copy กลับมาที่ repo ด้วย `scripts/sync-from-dev.sh ~/.claude/dev-mods/<session-id>` (README ของแต่ละ mod จะไม่ถูกทับ)
