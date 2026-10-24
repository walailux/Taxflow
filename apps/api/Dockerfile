# TaxFlow API — Express 5 บน Node.js 22 (node:sqlite ต้องใช้ 22.5 ขึ้นไป)
# ใช้ฐาน -slim (Debian) ไม่ใช่ -alpine เพราะ Docker Desktop บนเครื่องนี้รันไบนารี musl ของ Alpine
# ไม่ได้ (exec format error) ทั้งที่เป็น amd64 ตรงกัน ส่วน glibc ของ Debian ทำงานปกติ
# build จากรากของ repo เพราะเป็น npm workspaces ต้องเห็น package-lock.json และ packages/shared
#   docker compose build api        (หรือ)  docker build -f apps/api/Dockerfile .

# ---------- ชั้นติดตั้ง dependencies ----------
FROM node:22-slim AS deps
WORKDIR /app
# คัดลอกเฉพาะไฟล์ manifest ก่อน ชั้นนี้จะถูก cache ไว้ ตราบใดที่ dependency ไม่เปลี่ยน
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# --omit=dev ตัดเครื่องมือตอนพัฒนาออก แต่ "ห้าม" ใส่ --omit=optional
# เพราะ pdfkit / @cantoo/pdf-lib (ตัวสร้าง PDF) อยู่ใน optionalDependencies
RUN npm ci --omit=dev --include-workspace-root -w @taxflow/api

# ---------- ชั้นรันจริง ----------
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# data/ เก็บฐานข้อมูล คีย์ และไฟล์อัปโหลด ผูกเป็น volume ไว้ใน docker-compose.yml
# สร้างล่วงหน้าและให้สิทธิ์ผู้ใช้ node เพราะคอนเทนเนอร์ไม่ได้รันด้วย root
RUN mkdir -p /app/apps/api/data/uploads && chown -R node:node /app/apps/api/data
USER node

WORKDIR /app/apps/api
EXPOSE 4000

# เช็คสุขภาพจากเส้นทางจริงของแอป ไม่ใช่แค่พอร์ตเปิด
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# สัญญาณ docker stop ถึง node โดยตรง (compose ตั้ง init: true ให้มี PID 1 เก็บ zombie process อีกชั้น)
CMD ["node", "server.js"]
