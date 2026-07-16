/**
 * @Author wei
 * @Date 2026-07-16
 * @Description 自动递增 package.json 和 manifest.json 的版本号（自动 Patch +1）
 **/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.resolve(__dirname, '../package.json');
const manifestJsonPath = path.resolve(__dirname, '../public/manifest.json');

try {
  // 1. 读取并解析 package.json
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version || '1.0.0';

  // 2. 解析版本号并递增最后一位 (Patch)
  const parts = currentVersion.split('.').map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    parts[2] += 1;
  } else {
    // 降级兜底
    parts[0] = parts[0] || 1;
    parts[1] = parts[1] || 0;
    parts[2] = (parts[2] || 0) + 1;
  }
  const nextVersion = parts.join('.');

  console.log(`🏷️ 版本号自增触发: ${currentVersion} -> ${nextVersion}`);

  // 3. 回写 package.json
  packageJson.version = nextVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');

  // 4. 同步回写 public/manifest.json
  if (fs.existsSync(manifestJsonPath)) {
    const manifestJson = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf8'));
    manifestJson.version = nextVersion;
    fs.writeFileSync(manifestJsonPath, JSON.stringify(manifestJson, null, 2) + '\n', 'utf8');
    console.log(`✓ 已同步更新 public/manifest.json 的版本号至 ${nextVersion}`);
  } else {
    console.warn('⚠️ 未找到 public/manifest.json，跳过同步更新');
  }
} catch (error) {
  console.error('❌ 版本号自动递增失败:', error);
  process.exit(1);
}
