/**
 * scripts/coverage.mjs วัด test coverage ของ API และหน้าเว็บ แล้วรวมเป็น coverage/lcov.info ไฟล์เดียวให้ SonarQube
 * --------------------------------------------------------------------------------------------
 * รัน: npm run coverage (ที่รากโปรเจกต์) ก่อนสั่ง sonar-scanner ทุกครั้ง
 * path ในไฟล์ถูกแปลงเป็นแบบสัมพัทธ์จากรากโปรเจกต์ (เช่น apps/api/lib/auth.js) เพราะ scanner รันใน Docker
 * ที่ /usr/src ซึ่ง path แบบ C:\... ของเครื่องนี้หาไม่เจอ
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'coverage');
const API = path.join(ROOT, 'apps', 'api');
const WEB = path.join(ROOT, 'apps', 'web');
fs.mkdirSync(OUT, { recursive: true });

function run(cwd, args) {
  const r = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`คำสั่งล้มเหลว (${r.status}): node ${args.join(' ')}`);
}

// API: node:test ในตัว (ไม่ต้องติดตั้งเพิ่ม) · ไม่นับไฟล์ทดสอบเอง
const apiLcov = path.join(OUT, 'api.lcov');
run(API, ['--test', '--experimental-test-coverage', '--test-coverage-exclude=test/**',
  '--test-reporter=dot', '--test-reporter-destination=stdout', '--test-reporter=lcov', `--test-reporter-destination=${apiLcov}`]);

// หน้าเว็บ: vitest + @vitest/coverage-v8
const webDir = path.join(OUT, 'web');
run(WEB, [path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '--coverage.enabled', '--coverage.provider=v8',
  '--coverage.reporter=lcov', `--coverage.reportsDirectory=${webDir}`, '--coverage.include=src/**/*.js', '--coverage.exclude=src/**/*.test.js']);

/** แปลง SF: ของไฟล์ lcov ให้เป็น path สัมพัทธ์จากรากโปรเจกต์ (ตัดไฟล์นอกโปรเจกต์ทิ้ง) */
function relocate(file, baseDir) {
  const out = [];
  let keep = true;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      const abs = path.resolve(baseDir, line.slice(3));
      const rel = path.relative(ROOT, abs).split(path.sep).join('/');
      keep = !rel.startsWith('..') && !rel.includes('node_modules/');
      if (keep) out.push(`SF:${rel}`);
      continue;
    }
    if (keep && line) out.push(line);
  }
  return out.join('\n');
}

const merged = [relocate(apiLcov, API), relocate(path.join(webDir, 'lcov.info'), WEB)].join('\n') + '\n';
fs.writeFileSync(path.join(OUT, 'lcov.info'), merged);
console.log(`\nรวม coverage แล้ว: ${path.relative(ROOT, path.join(OUT, 'lcov.info'))}`);
