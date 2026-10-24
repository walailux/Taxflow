# TaxFlow Web — build หน้าเว็บด้วย Vite แล้วเสิร์ฟไฟล์นิ่งด้วย nginx
# ใช้ฐาน Debian ไม่ใช่ Alpine ด้วยเหตุผลเดียวกับ apps/api/Dockerfile (ดูหมายเหตุในไฟล์นั้น)
# build จากรากของ repo เพราะเป็น npm workspaces (ต้องเห็น packages/shared)
#   docker compose build web

# ---------- ชั้น build ----------
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
# ชั้นนี้ต้องมี devDependencies ด้วย (vite, tailwind) จึงไม่ใส่ --omit=dev
RUN npm ci --include-workspace-root -w @taxflow/web

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
# VITE_API_URL ว่างไว้ = หน้าเว็บเรียก /api โดเมนเดียวกัน ซึ่ง nginx จะ proxy ไปที่คอนเทนเนอร์ api
ENV VITE_API_URL=""
RUN npm run build -w @taxflow/web

# ---------- ชั้นเสิร์ฟ ----------
# nginx-unprivileged ทำงานด้วยผู้ใช้ nginx (uid 101) ไม่ใช่ root และฟังพอร์ต 8080 ตาม nginx.conf อยู่แล้ว
FROM nginxinc/nginx-unprivileged:1.27
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
USER 101
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/ >/dev/null || exit 1
