# ขึ้นระบบจริง TaxFlow — Docker + CI/CD (GHCR) ที่ https://taxflowofficial.online

ขั้นตอนเดียวกับ Lab Docker + CI/CD (equipment-demo) ปรับให้เข้ากับ TaxFlow

| ต่างจาก Lab | TaxFlow |
|---|---|
| image | 2 ตัว `taxflow-api` และ `taxflow-web` (ไม่มี migrator) |
| ฐานข้อมูล | ใช้ Supabase เดิมตาม `DATABASE_URL` ไม่มีคอนเทนเนอร์ db |
| `.env` บน VPS | คัดลอกจาก `apps/api/.env` ไม่ได้สร้างด้วย make-env.sh |
| ไฟล์ที่ต้องคัดลอกเอง | `data/` (กุญแจ, ค่าอีเมล, ใบรับรองลายมือชื่อ) และ `fonts/` (ฟอนต์ PDF) |
| port ในเครื่อง VPS | `127.0.0.1:8081` (Lab ใช้ 3300) |

VPS `179.197.241.53` (srv2052364) · GitHub `Walailux` (ชื่อ image บน GHCR ต้องเป็นตัวพิมพ์เล็ก `walailux`) บัญชีเดียวกับแอปครุภัณฑ์

TaxFlow อยู่ที่ `/home/deploy/taxflow` แยกจากแอปครุภัณฑ์ใน `/home/deploy/app` (คนละ compose project คนละ port)

> **ห้าม reset VPS ตาม "ก่อนคาบ" ของ Lab** ถ้าเครื่องนี้มีเว็บอื่นอยู่แล้ว (เช่น influenzaofficial.tech)
> การติดตั้งระบบปฏิบัติการใหม่จะลบเว็บเดิมทิ้งทั้งหมด ข้ามข้อที่ทำไปแล้ว (Docker, swap, user deploy, ufw, nginx)

---

## 1. GitHub + CI  🟦 PowerShell บนเครื่องตัวเอง

สร้าง repo ใหม่ที่ <https://github.com/new> ชื่อ `taxflow` (แนะนำ **Private**) ไม่ติ๊ก README/.gitignore/license

```powershell
cd $HOME\OneDrive\Desktop\taxflow\taxflow_ver18
git init -b main
git add .
git status
```

**ตรวจก่อน commit:** ในรายการต้อง **ไม่มี** `apps/api/.env`, `apps/api/data/`, `hook.text`, ไฟล์ `.ttf` (อยู่ใน .gitignore แล้ว)

```powershell
git commit -m "TaxFlow ver18 + CI/CD"
git remote add origin https://github.com/walailux/taxflow.git
git push -u origin main
```

ดูที่ `https://github.com/walailux/taxflow/actions`
- **CI** ✓ ทั้ง `test` และ `docker-build`
- **Deploy** เริ่มเองหลัง CI: `build-push` ✓ และ `deploy` เป็น **skipped** (ถูกต้อง ยังไม่ได้ตั้ง APP_URL)
- `https://github.com/walailux?tab=packages` ต้องมี `taxflow-api` และ `taxflow-web`

## 2. เตรียม VPS  🟥 root

```powershell
ssh root@179.197.241.53
```

ข้ามข้อที่เครื่องมีอยู่แล้ว (ตรวจด้วย `docker --version`, `free -h`, `id deploy`, `ufw status`)

```bash
apt update && apt upgrade -y          # หน้าจอ openssh-server: keep the local version
curl -fsSL https://get.docker.com | sh
ls /var/run/reboot-required && reboot

fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo "/swapfile none swap sw 0 0" >> /etc/fstab

adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys   # วาง public key (ssh-ed25519 AAAA...) ไม่ใช่ fingerprint
chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable
```

## 3. คัดลอกไฟล์ขึ้น VPS  🟦 PowerShell

```powershell
cd $HOME\OneDrive\Desktop\taxflow\taxflow_ver18
ssh deploy@179.197.241.53 "mkdir -p ~/taxflow/data/uploads ~/taxflow/fonts"
scp deploy/docker-compose.yml deploy@179.197.241.53:taxflow/
scp apps/api/.env deploy@179.197.241.53:taxflow/.env
scp apps/api/data/session.key apps/api/data/file.key apps/api/data/mail.config.json deploy@179.197.241.53:taxflow/data/
scp -r apps/api/data/sign deploy@179.197.241.53:taxflow/data/
scp apps/api/assets/fonts/*.ttf deploy@179.197.241.53:taxflow/fonts/
```

`file.key` ต้องเป็นตัวเดียวกับเครื่องพัฒนา ไม่อย่างนั้นเปิดไฟล์ที่เข้ารหัสไว้ใน Supabase Storage ไม่ได้

## 4. รันบน VPS  🟩 deploy

```bash
cd ~/taxflow
echo "IMAGE_PREFIX=ghcr.io/walailux/taxflow" >> .env
docker compose config --quiet && echo OK
```

🟥 root: ให้ผู้ใช้ node ในคอนเทนเนอร์ (uid 1000) เขียน data ได้

```bash
chown -R 1000:1000 /home/deploy/taxflow/data
```

สร้าง token ที่ <https://github.com/settings/tokens/new> ติ๊ก `read:packages` ช่องเดียว (ถ้า repo เป็น Private)

```bash
# บัญชีเดียวกับแอปครุภัณฑ์ ถ้า login ghcr.io ไว้แล้วและ token ยังไม่หมดอายุ ข้ามบรรทัดนี้ได้
docker login ghcr.io -u walailux    # Password: วาง token
docker compose pull
docker compose up -d
docker compose ps -a                   # api healthy, web Up
curl http://127.0.0.1:8081/api/health  # {"status":"ok",...}
```

## 5. โดเมน + Nginx + HTTPS

hPanel → โดเมน → taxflowofficial.online → DNS / Nameservers
- แก้ **A @** จาก `2.57.91.91` (parking) เป็น `179.197.241.53` · ลบ AAAA @ ถ้ามี · **CNAME www** ไม่ต้องแก้

```powershell
nslookup taxflowofficial.online 8.8.8.8   # ต้องได้ 179.197.241.53
```

🟦 PowerShell: `scp deploy/nginx-taxflowofficial.online.conf deploy@179.197.241.53:taxflow/`

🟥 root:

```bash
apt install -y nginx certbot python3-certbot-nginx     # ข้ามถ้ามีแล้ว
cp /home/deploy/taxflow/nginx-taxflowofficial.online.conf /etc/nginx/sites-available/taxflow
ln -s /etc/nginx/sites-available/taxflow /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d taxflowofficial.online -d www.taxflowofficial.online --redirect
```

ไม่ต้องลบ `sites-enabled/default` หรือ config ของเว็บอื่น (Lab ลบเพราะเครื่องว่าง)
เปิด <https://taxflowofficial.online> ต้องเห็นหน้า TaxFlow และแม่กุญแจ Let's Encrypt

## 6. Deploy อัตโนมัติ

🟦 PowerShell

```powershell
ssh-keygen -t ed25519 -f $HOME\.ssh\gha_deploy -C "github-actions-deploy"
type $HOME\.ssh\gha_deploy.pub | ssh deploy@179.197.241.53 "tr -d '\r' >> ~/.ssh/authorized_keys"
ssh -i $HOME\.ssh\gha_deploy deploy@179.197.241.53 "docker ps --format {{.Names}}"
Get-Content $HOME\.ssh\gha_deploy -Raw | Set-Clipboard
```

`https://github.com/walailux/taxflow/settings/secrets/actions`

| แท็บ | Name | ค่า |
|---|---|---|
| Secrets | `VPS_SSH_KEY` | Ctrl+V (private key) |
| Secrets | `VPS_HOST` | `179.197.241.53` |
| Secrets | `VPS_USER` | `deploy` |
| **Variables** | `APP_URL` | `https://taxflowofficial.online` |

Actions → Deploy → Run workflow → main: ต้องเห็น `build-push` ✓ และ `deploy` ✓ (ไม่ใช่ skipped)
จากนี้ทุก `git push` ขึ้น main → CI → Deploy → เว็บจริงเปลี่ยนเอง (~5 นาที)

## 7. Google Sign-In

Google Cloud Console → APIs & Services → Credentials → OAuth client เดียวกับ `GOOGLE_CLIENT_ID`
- Authorized JavaScript origins: `https://taxflowofficial.online`
- Authorized redirect URIs: `https://taxflowofficial.online/auth/google/callback`

## หลังจบ

- ลบ token `read:packages` ที่ใช้ docker login ถ้าเคยขึ้นจอ
- เว็บจริงกับเครื่องพัฒนาใช้ Supabase ชุดเดียวกัน ถ้าต้องการแยก ให้สร้างโปรเจกต์ Supabase ใหม่แล้วแก้ `~/taxflow/.env`
