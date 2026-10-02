# standup 📝

`/standup` สรุปงานเป็นภาษาไทย พร้อมแปะใน daily standup ได้ทันที คัดลอกให้อัตโนมัติ

```bash
claude plugin marketplace add sonata39-star/claude-mod   # ครั้งเดียว
claude plugin install standup@claude-mod
```

## หน้าตา

> ตัวอย่างผลลัพธ์ ข้อมูลสมมติ

```
✅ ทำอะไรไปแล้ว
- แก้ bug login ค้างเมื่อ token หมดอายุ (3 commits)
- เพิ่ม test ของ refresh token

🎯 จะทำอะไรต่อ
- ทำหน้า reset password ต่อ (ยังไม่ commit 2 ไฟล์)

🚧 ติดอะไร
- ไม่มี
```

แล้วขึ้น toast `คัดลอกแล้ว`

## ใช้งาน

| คำสั่ง | ช่วงเวลา |
| --- | --- |
| `/standup` หรือ `/standup today` | ตั้งแต่เที่ยงคืนวันนี้ |
| `/standup yesterday` | ตั้งแต่เที่ยงคืนเมื่อวาน |
| `/standup 3` | 3 วันย้อนหลัง |

## เก็บข้อมูลจากไหน

- commit ของคุณจาก `git log` (ใช้ `user.email` ของ git) และไฟล์ที่ commit เหล่านั้นแก้
- งานที่ยังไม่ commit จาก `git status`
- สิ่งที่ Claude ทำใน session นี้: สิ่งที่สั่ง, ไฟล์ที่แก้, คำสั่งที่รัน

ให้ Haiku เขียนสรุป (ราคาถูก) ถ้าเรียก AI ไม่ได้จะแสดงข้อมูลดิบให้แทน · นอก git repo จะสรุปจาก session อย่างเดียว

[← กลับไปหน้ารวม](../README.md)
