/**
 * @Author wei
 * @Date 2026-07-16
 * @Description 基于 Git 最新标签同步更新 package.json 和 manifest.json 的版本号
 **/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.resolve(__dirname, '../package.json');
const manifestJsonPath = path.resolve(__dirname, '../public/manifest.json');

try {
  // 1. 执行 git 命令获取最新标签并排序
  console.log('🔍 正在从 Git 获取最新版本标签...');
  const gitOutput = execSync('git tag --sort=-version:refname', { encoding: 'utf8' }).trim();
  const latestTag = gitOutput.split('\n')[0]?.trim();

  if (!latestTag) {
    console.error('❌ 错误: 未能在本地库中检测到任何 Git 标签 (Tags)，请先执行 git tag <version> 打上标签！');
    process.exit(1);
  }

  // 2. 清洗版本号前缀 (例如将 'v1.2.5' 转换为 '1.2.5')
  const nextVersion = latestTag.startsWith('v') ? latestTag.slice(1) : latestTag;

  console.log(`🏷️ 检测到 Git 最新标签: ${latestTag} -> 转换为规范版本号: ${nextVersion}`);

  // 3. 回写 package.json
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const oldPackVersion = packageJson.version;
  packageJson.version = nextVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
  console.log(`✓ 已同步 package.json 版本号: ${oldPackVersion} -> ${nextVersion}`);

  // 4. 同步回写 public/manifest.json
  if (fs.existsSync(manifestJsonPath)) {
    const manifestJson = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf8'));
    const oldManVersion = manifestJson.version;
    manifestJson.version = nextVersion;
    fs.writeFileSync(manifestJsonPath, JSON.stringify(manifestJson, null, 2) + '\n', 'utf8');
    console.log(`✓ 已同步 public/manifest.json 版本号: ${oldManVersion} -> ${nextVersion}`);
  } else {
    console.warn('⚠️ 未找到 public/manifest.json，跳过同步');
  }
} catch (error) {
  console.error('❌ 同步 Git 标签版本失败:', error);
  process.exit(1);
}
