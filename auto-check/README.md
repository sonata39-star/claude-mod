# auto-check ✅

แก้ไฟล์ปุ๊บตรวจปั๊บ Claude แก้ไฟล์เสร็จจะรัน linter ของไฟล์นั้นทันที และรัน type-check ทั้งโปรเจกต์รอบเดียวก่อน Claude จบงาน ถ้าพังจะส่ง error กลับให้ Claude แก้ต่อเลย ไม่ต้องรอคุณมาเจอเอง

```bash
claude plugin marketplace add sonata39-star/claude-mod   # ครั้งเดียว
claude plugin install auto-check@claude-mod
```

## หน้าตา

> ตัวอย่างวาดจากผลที่ test ตรวจ

```
╭ toast ─────────────────────────────╮
│ ❌ eslint: 1 error ใน a.ts           │
╰────────────────────────────────────╯
status:  ❌ auto-check: 2 ไฟล์ยังมีปัญหา
```

ไฟล์ที่ผ่านจะเงียบ ไม่มีอะไรขึ้น

## ตรวจอะไรบ้าง

| ไฟล์ | ตอนแก้เสร็จ | ก่อน Claude จบงาน |
| --- | --- | --- |
| `.ts` `.tsx` `.js` `.jsx` | `eslint --quiet` (ถ้าโปรเจกต์มี config) | `tsc --noEmit` ของ tsconfig ที่ไฟล์อยู่ |
| `.py` | `ruff check` หรือตรวจ syntax ถ้าไม่มี ruff | – |
| `.go` | `gofmt -e -l` | `go vet` |
| `.json` | parse ตรวจ syntax | – |

- ใช้เฉพาะ eslint / tsc ที่อยู่ใน `node_modules/.bin` ของโปรเจกต์ ไม่ดาวน์โหลดอะไรเพิ่ม
- type-check รายงานเฉพาะ error ใหม่ ถ้าเจอจะให้ Claude แก้ต่อก่อนจบ ไม่เกิน 2 รอบต่อการสั่งงาน
- ข้าม `node_modules`, `dist` และไฟล์ JSON แบบมีคอมเมนต์ (tsconfig)

## ตั้งค่า (`/config`)

| ค่า | ค่าเริ่มต้น | ความหมาย |
| --- | --- | --- |
| `enabled` | `true` | ตรวจหลัง Claude แก้ไฟล์ |
| `typecheckOnStop` | `true` | รัน tsc / go vet ก่อน Claude จบงาน |

[← กลับไปหน้ารวม](../README.md)
