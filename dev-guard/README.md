# dev-guard 🛡️

กันพลาดระหว่างให้ Claude ทำงาน คำสั่งที่พังแบบกู้คืนไม่ได้จะถูกบล็อกทันที คำสั่งเสี่ยงจะถามคุณก่อน และไม่ปล่อยให้ secret/token ถูกเขียนลงโค้ด

```bash
claude plugin marketplace add sonata39-star/claude-mod   # ครั้งเดียว
claude plugin install dev-guard@claude-mod
```

## หน้าตา

> ตัวอย่างวาดจากผลที่ test ตรวจ บนจอจริงมีสี

**บล็อกทันที** ไม่ถาม แล้วบอก Claude ว่าห้ามหาทางอ้อม:

```
╭ toast ─────────────────────────────╮
│ 🛡️ บล็อกแล้ว: force-push to main     │
╰────────────────────────────────────╯
```

**ถามก่อน** ผ่านกล่องเลือกของ Claude Code ซึ่งถามคุณจริงแม้อยู่ใน auto mode:

```
 dev-guard
 🛡️ git reset --hard discards uncommitted work — git reset --hard HEAD~1 ให้ทำต่อไหม?

 ❯ 1. อนุญาตครั้งนี้
   2. บล็อก
```

เจอ secret ในโค้ดที่กำลังจะเขียน (โชว์แค่ 4 ตัวแรก):

```
 🛡️ writes a GitHub token (ghp_…) into code — use an env var instead — src/config.ts ให้ทำต่อไหม?
```

## กฎ

| ระดับ | กรณี |
| --- | --- |
| ⛔ บล็อก | `rm -rf /`, `rm -rf ~`, `rm -rf ~/Desktop` (และโฟลเดอร์ระบบ), ลบโฟลเดอร์ที่มีโปรเจกต์อยู่ข้างใน, `git push --force` ไป main / master / production, ลบ branch main บน remote, `mkfs`, `dd of=/dev/disk…`, `diskutil eraseDisk`, fork bomb, `chmod -R 777 /` |
| ❓ ถามก่อน | `git reset --hard`, `git clean -f`, `git checkout .` / `git restore .`, `git branch -D`, `git stash drop/clear`, force-push ไป feature branch, `rm -rf` นอกโปรเจกต์หรือทั้งโปรเจกต์, `rm -rf $VAR`, `sudo`, `curl … \| sh`, `DROP` / `TRUNCATE` / `DELETE` ที่ไม่มี `WHERE`, `FLUSHALL`, `prisma migrate reset`, `docker … prune`, `kubectl delete`, `terraform destroy`, `npm publish`, `railway down`, `gh repo delete` |
| ❓ ไฟล์ลับ | อ่าน / แก้ / `cat` / `git add` ไฟล์ `.env*` (ยกเว้น `.env.example`), `*.pem`, `*.key`, `id_rsa`, `~/.ssh`, `~/.aws/credentials`, `.npmrc` |
| ❓ secret ในโค้ด | AWS key, GitHub / GitLab token, Anthropic / OpenAI key, Slack, Google API key, Stripe live key, Atlassian token, npm token, private key, JWT, DB URL ที่มีรหัสผ่าน, `password = "…"` |
| ✅ ปล่อยผ่าน | `rm -rf node_modules dist`, `/tmp/...`, `npm test`, `git push` ธรรมดา, `--force-with-lease` ไป feature branch, ค่าตัวอย่าง (`process.env.X`, `your-password-here`, `postgres:postgres@localhost`) |

SQL จะถูกตรวจแบบไม่สนตัวพิมพ์เล็กใหญ่เฉพาะเมื่ออยู่ในคำสั่ง client (`psql`, `mysql`, `sqlite3`, …) ข้อความ commit อย่าง "delete from cache" จึงไม่โดนถาม

ถ้ากดอนุญาต จะมีบรรทัดบันทึกใน transcript ว่าคุณอนุญาตอะไรไป

[← กลับไปหน้ารวม](../README.md)
