# claude-mod

ชุด mod สำหรับ Claude Code ที่ช่วยงาน develop ประจำวัน ติดตั้งทีละตัวหรือทั้งชุดก็ได้

| Mod | ทำอะไร |
| --- | --- |
| [`dev-guard`](#dev-guard) | บล็อกคำสั่งอันตราย ถามก่อนคำสั่งเสี่ยง และกันไม่ให้ secret/token หลุดลงโค้ด |
| [`auto-check`](#auto-check) | แก้ไฟล์ปุ๊บรัน linter ให้ทันที และรัน type-check ก่อน Claude จบงาน ถ้าพังส่ง error กลับให้ Claude แก้ต่อ |
| [`done-notify`](#done-notify) | เสียง + toast + notification ของ macOS เมื่องานยาวเสร็จ หรือเมื่อ Claude รอให้ตอบ |
| [`dev-status`](#dev-status) | status line แบบ progress bar: context, limit 5 ชม. / 7 วัน พร้อมเวลารีเซ็ต, ค่าใช้จ่าย + หน้ากราฟ `/usage-bars` |
| [`dev-dashboard`](#dev-dashboard) | pane สรุป session: ไฟล์ที่แก้, คำสั่งที่รัน, ผล test, สิ่งที่ถูกบล็อก |
| [`team-flow`](#team-flow) | แถบแสดง pipeline BA → Lead → Dev → Review → Sec จากไฟล์ใน `.team/` |
| [`standup`](#standup) | `/standup` สรุปงานวันนี้จาก git + session เป็นภาษาไทย แล้วคัดลอกให้ |
| [`neko`](#neko) | แมวผู้ช่วย ฅ(=•ω•=)ฅ นั่งเหนือช่องพิมพ์ คอยแนะนำระหว่างทำงาน ถามได้ด้วย `/neko` |

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

---

## ตัวอย่างหน้าตา

> ตัวอย่างด้านล่างวาดจากผลที่ test ของแต่ละ mod ตรวจ ตัวเลขเป็นข้อมูลสมมติ บนจอจริงจะมีสีด้วย

### dev-guard

**บล็อกทันที** (ไม่ถาม): `rm -rf /`, `rm -rf ~`, ลบโฟลเดอร์ที่มีโปรเจกต์อยู่ข้างใน, `git push --force` ไป main/master/production, `mkfs`, `dd of=/dev/disk…`, fork bomb

```
╭ toast ─────────────────────────────╮
│ 🛡️ บล็อกแล้ว: force-push to main     │
╰────────────────────────────────────╯
```

**ถามก่อน** ด้วยกล่องเลือกของ Claude Code (ถามคนจริงแม้อยู่ใน auto mode):

```
 dev-guard
 🛡️ git reset --hard discards uncommitted work — git reset --hard HEAD~1 ให้ทำต่อไหม?

 ❯ 1. อนุญาตครั้งนี้
   2. บล็อก
```

กรณีที่ถาม: `git reset --hard`, `git clean -f`, `git checkout .`, `branch -D`, force-push ไป feature branch, `rm -rf` นอกโปรเจกต์, `sudo`, `curl … | sh`, `DROP / TRUNCATE / DELETE` ไม่มี `WHERE`, `docker prune`, `kubectl delete`, `terraform destroy`, `npm publish`, `railway down`, อ่าน/แก้ `.env` `*.pem` `~/.ssh`, และการเขียน secret ลงโค้ด เช่น

```
 🛡️ writes a GitHub token (ghp_…) into code — use an env var instead — src/config.ts ให้ทำต่อไหม?
```

ปล่อยผ่านปกติ: `rm -rf node_modules dist`, `/tmp/...`, `npm test`, `git push` ธรรมดา, `--force-with-lease` ไป feature branch, ค่าตัวอย่างอย่าง `process.env.API_KEY`

### auto-check

หลัง Claude แก้ไฟล์ จะรัน eslint / ruff / gofmt / ตรวจ JSON ของไฟล์นั้น ถ้าพัง error จะถูกส่งกลับให้ Claude แก้ต่อทันที และขึ้น

```
╭ toast ─────────────────────────────╮
│ ❌ eslint: 1 error ใน a.ts           │
╰────────────────────────────────────╯
status:  ❌ auto-check: 2 ไฟล์ยังมีปัญหา
```

ส่วน `tsc --noEmit` / `go vet` รันรอบเดียวตอน Claude กำลังจะจบงาน ถ้ามี error ใหม่ Claude จะแก้ต่อก่อน (สูงสุด 2 รอบ)

### done-notify

งานที่ใช้เวลาเกิน 30 วินาที (ปรับได้) พอเสร็จจะมีเสียง Glass + toast + notification ของ macOS

```
╭ toast ─────────────────────────────────────────────╮
│ ✅ เสร็จแล้ว (2m 13s) — แก้ bug login เสร็จแล้วครับ    │
╰────────────────────────────────────────────────────╯
```

จบด้วย error → `⚠️ จบด้วย error` + เสียง Basso · Claude รอให้ตอบหรือกำลังถาม → เสียง Ping

### dev-status

status line ใต้ช่องพิมพ์ แท่ง ▰ คือ % ที่ใช้ไปแล้ว (เต็ม 8 ช่อง = ชน limit) มี `⚠` นำหน้าเมื่อเกิน 80%

```
⎇ main ±3 ↑1 │ ctx ▰▰▰▱▱▱▱▱ 42% 84k │ 5h ▰▰▱▱▱▱▱▱ 24% ↻14:30 │ 7d ▰▱▱▱▱▱▱▱ 9% ↻จ. 09:00 │ $1.23
```

`/usage-bars` เปิดหน้ากราฟเต็ม (สีเขียว < 60% · เหลือง 60–85% · แดง > 85%, `╎` = จุดที่จะ auto-compact)

```
Context  ใช้ไป 42% · เหลือ 58%
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱╎▱▱▱▱▱▱▱
84,000 / 200,000 tokens · auto-compact ที่ 160k ╎

5-hour limit  ใช้ไป 23.5% · เหลือ 76.5%
▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱
รีเซ็ต 14:30 · อีก 2ชม 13น

7-day limit  ใช้ไป 9% · เหลือ 91%
▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱
รีเซ็ต จ. 09:00 · อีก 2วัน 20ชม

Context แยกตามประเภท
▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱
▰ Messages 67k  ▰ System tools 12k  ▰ System prompt 3k
Cost $1.23 · อัปเดต 12:17 · รีเฟรชทุก 30 วิ
```

`/usage-detail` สรุปเป็นข้อความละเอียด · เตือนด้วย toast เมื่อ limit ไหนถึง 80% และ 95%, context ถึง 80%

### dev-dashboard

`/dashboard` เปิด pane ข้าง transcript (เปิดเองตอนเริ่ม session ถ้าจอกว้าง ≥ 144 คอลัมน์)

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

### team-flow

แถบเหนือช่องพิมพ์ อ่านความคืบหน้าจาก `.team/` (`req-*.md`, `plan-*.md`, `dev-report-*.md`, `review-*.md`, `sec-*.md`) ที่ agent ทีม ba / lead / dev / sec / pm เขียนไว้ ถ้าโปรเจกต์ไม่มี `.team/` จะไม่แสดงอะไร

```
👥 login  📋 BA ✓ → 🧭 Lead ✓ → 🔨 Dev 2/3 ◀ → 🔍 Review → 🔒 Sec
⚡ 🔨 Dev กำลังทำงาน…
```

review ได้ FAIL หรือ sec ได้ BLOCK → กลับไปที่ Dev พร้อมบอก "แก้ตาม review/sec" · `/team-flow` ซ่อน/แสดง

### standup

`/standup` (หรือ `/standup yesterday`, `/standup 3`) รวบรวม commit ของคุณ งานที่ยังไม่ commit และสิ่งที่ทำใน session แล้วให้ Haiku เขียนสรุป จากนั้นคัดลอกให้อัตโนมัติ

```
✅ ทำอะไรไปแล้ว
- แก้ bug login ค้างเมื่อ token หมดอายุ (3 commits)
- เพิ่ม test ของ refresh token

🎯 จะทำอะไรต่อ
- ทำหน้า reset password ต่อ (ยังไม่ commit 2 ไฟล์)

🚧 ติดอะไร
- ไม่มี
```

### neko

แมวผู้ช่วยนั่งเหนือช่องพิมพ์ ขยับตัว กะพริบตา กระดิกหาง และเปลี่ยนท่าตามงานที่ Claude ทำอยู่

```
  /\_/\        เหมียว · กำลังส่อง test
 (=•ω•=)  ♡    แก้ 5 ไฟล์แล้ว commit ก่อนไหมเหมียว~
  ฅ ⌕ ฅ ~      t: แนะนำหน่อย  h: ซ่อน
```

| อารมณ์ | หน้า | | ท่าตามงาน | paws |
| --- | --- | --- | --- | --- |
| ปกติ | `(=•ω•=) ♡` | | แก้โค้ด | `ฅ ✎ ฅ` |
| ทำงาน | `(=-ω-=)` | | รัน test | `ฅ ⌕ ฅ` |
| ดีใจ (มี ♡ ♪ ลอยขึ้น) | `(=^ω^=) ♪` | | commit | `ฅ[□]ฅ` |
| อุ๊ย (error / ถูกบล็อก) | `(=;ω;=) !` | | push | `ฅ ↑ ฅ` |
| ง่วง (ว่าง 10 นาที) | `(=ᴗωᴗ=) zZ` | | ติดตั้ง package | `ฅ ↓ ฅ` |
| กำลังคิด | `(=•ω•=) ?` | | อ่านไฟล์ | `ฅ[≡]ฅ` |

- เตือนเองโดยไม่เสีย token: context ≥ 80% → ชวน `/compact`, ไฟล์ค้างไม่ commit ≥ 8 → ชวน commit, ทำงานติดกัน 90 นาที → พักสายตา, เลย 23:00 → ไปนอน
- ให้คำแนะนำด้วย Haiku ไม่เกินหนึ่งข้อต่อการสั่งงาน และเฉพาะตอนมีเรื่อง (มี error, งานนาน, แก้หลายไฟล์)
- `/neko <คำถาม>` ถามแมวตรงๆ · `/neko hide` / `/neko show`
- agent `neko:advisor` ให้ Claude ส่งงานให้แมวรีวิวแบบอ่านอย่างเดียว

---

## ตั้งค่า

แต่ละ mod ปรับได้ใน `/config`

- `neko` → `animate` (ขยับตัว), `autoTips` (คำแนะนำอัตโนมัติ), `tipModel`
- `done-notify` → `minSeconds`, `sound`, `systemNotification`
- `auto-check` → `enabled`, `typecheckOnStop`

## หมายเหตุ

- `done-notify` ใช้เสียงและ notification ของ macOS
- `team-flow` ต้องมี agent ทีมที่เขียนไฟล์ลง `.team/`
- `dev-status` แสดงยอด token ที่ประหยัดได้จาก `rtk` ถ้ามีติดตั้งไว้
- ตัวอักษรอย่าง `ω` `•` `♡` บาง terminal นับเป็น 2 ช่อง ถ้ารูปแมวเบี้ยว ปิดการขยับได้ที่ `/config` → neko

## พัฒนาต่อ

แก้ mod แบบ hot reload ได้โดยชี้ Claude Code มาที่โฟลเดอร์ใน repo นี้:

```bash
claude --plugin-dir plugins/neko
```

ตรวจและรัน test:

```bash
claude plugin validate plugins/neko
claude plugin test plugins/neko
```

ถ้าแก้ใน dev-mods ของ session ให้ copy กลับมาที่ repo ด้วย `scripts/sync-from-dev.sh ~/.claude/dev-mods/<session-id>`
