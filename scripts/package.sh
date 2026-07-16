#!/bin/bash
# /**
#  * @Author wei
#  * @Date 2026-07-16
#  * @Description 自动化编译与打包 Chrome 扩展 zip 产物的脚本
#  **/

# 确保脚本任何命令出错时立即退出终止
set -e

# 控制台彩色输出定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # 无颜色

echo "================================================="
echo "📦 开始打包 Chrome 扩展程序..."
echo "================================================="

# 1. 清除上一次打包生成的 ZIP 包
if [ -f "samo-assistant.zip" ]; then
  echo "🧹 正在清理旧的 ZIP 包..."
  rm samo-assistant.zip
fi

# 2. 运行生产编译
echo "🏗️ 正在运行 TypeScript 检查与生产构建..."
GOPATH=/Users/yidejia/Project npm run build

# 3. 校验打包产物
if [ ! -d "dist" ] || [ ! -f "dist/manifest.json" ]; then
  echo -e "${RED}❌ 错误: dist 目录不存在或 manifest.json 丢失，编译未成功完成。${NC}"
  exit 1
fi

# 4. 执行 ZIP 压缩
echo "🤐 正在生成扩展程序 ZIP 包..."
cd dist
# -q 为静默模式，-r 为递归压缩，将当前目录下的所有子项压缩到上一层目录中
zip -q -r ../samo-assistant.zip *
cd ..

echo "================================================="
echo -e "${GREEN}✨ 扩展程序打包成功！${NC}"
echo -e "产物路径: ${GREEN}samo-assistant.zip${NC}"
echo "提示: 您现在可以直接将此 ZIP 包上传到 Chrome Web Store 开发者控制台进行审核更新。"
echo "================================================="
