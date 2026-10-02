# team-flow 👥

แถบเหนือช่องพิมพ์ที่บอกว่างานตอนนี้อยู่ขั้นไหนของทีม agent: BA → Lead → Dev → Review → Sec

```bash
claude plugin marketplace add sonata39-star/claude-mod   # ครั้งเดียว
claude plugin install team-flow@claude-mod
```

## หน้าตา

> ตัวอย่างวาดจากผลที่ test ตรวจ

```
👥 login  📋 BA ✓ → 🧭 Lead ✓ → 🔨 Dev 2/3 ◀ → 🔍 Review → 🔒 Sec
⚡ 🔨 Dev กำลังทำงาน…
```

- `✓` = ขั้นที่เสร็จแล้ว, `◀` = ขั้นปัจจุบัน, `2/3` = task ที่ติ๊กแล้วจากแผนของ Lead
- บรรทัด `⚡` ขึ้นเมื่อมี agent ทีมกำลังทำงานอยู่
- review ได้ FAIL หรือ sec ได้ BLOCK จะย้อนกลับไปที่ Dev พร้อมบอกว่า "แก้ตาม review/sec"

## อ่านจากไหน

ใช้ไฟล์ใน `.team/` ของโปรเจกต์ที่ agent ทีม (`ba`, `lead`, `dev`, `sec`, `pm`) เขียนไว้:

| ไฟล์ | ใครเขียน | ใช้ดูอะไร |
| --- | --- | --- |
| `req-<งาน>.md` | BA | requirement เสร็จแล้ว |
| `plan-<งาน>.md` | Lead | task `[ ]` / `[x]` ใต้ "## Task Breakdown" |
| `dev-report-<งาน>.md` | Dev | ส่งงานแล้ว |
| `review-<งาน>.md` | Lead | `**Verdict**: PASS / FAIL` |
| `sec-<งาน>.md` | Sec | `**Verdict**: APPROVE / BLOCK / APPROVE_WITH_NOTES` |
| `dlc-<งาน>.md` | PM | งานจาก PM |

แสดงงานที่มีไฟล์เปลี่ยนล่าสุด ถ้าโปรเจกต์ไม่มี `.team/` จะไม่แสดงอะไรเลย

## ใช้งาน

- `/team-flow` ซ่อน / แสดงแถบ หรือกดปุ่มซ่อนบนแถบ
- อยู่ร่วมกับแถบของ mod อื่นได้ (เช่น neko)

[← กลับไปหน้ารวม](../README.md)
