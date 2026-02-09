/**
 * @Author wei
 * @Date 2026-02-07
 * @Description 从图片生成 Chrome 扩展所需的各尺寸图标
 * 使用方法: node scripts/generate-icons-from-image.cjs [图片路径]
 **/

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// 获取输入图片路径，默认使用 smy.png
const inputImage = process.argv[2] || path.join(__dirname, '..', 'smy.png');
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

// 确保图标目录存在
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 需要生成的图标尺寸
const sizes = [16, 48, 128];

async function generateIcons() {
  try {
    // 读取原始图片并获取元数据
    const image = sharp(inputImage);
    const metadata = await image.metadata();

    console.log(`原始图片: ${inputImage}`);
    console.log(`尺寸: ${metadata.width}x${metadata.height}`);

    // 计算裁剪区域（居中正方形裁剪）
    const size = Math.min(metadata.width, metadata.height);
    const left = Math.floor((metadata.width - size) / 2);
    const top = Math.floor((metadata.height - size) / 2);

    // 生成各尺寸图标
    for (const targetSize of sizes) {
      const outputPath = path.join(iconsDir, `icon${targetSize}.png`);

      await sharp(inputImage)
        .extract({ left, top, width: size, height: size }) // 居中裁剪为正方形
        .resize(targetSize, targetSize, {
          fit: 'cover',
          kernel: sharp.kernel.lanczos3 // 高质量缩放
        })
        .png()
        .toFile(outputPath);

      console.log(`✓ 已生成 icon${targetSize}.png`);
    }

    // 生成用于浮窗按钮的小图标 (24x24)
    const floatIconPath = path.join(iconsDir, 'float-icon.png');
    await sharp(inputImage)
      .extract({ left, top, width: size, height: size })
      .resize(24, 24, {
        fit: 'cover',
        kernel: sharp.kernel.lanczos3
      })
      .png()
      .toFile(floatIconPath);

    console.log(`✓ 已生成 float-icon.png (浮窗按钮图标)`);

    // 将 24x24 图标转换为 base64 用于内联
    const floatIconBuffer = await sharp(inputImage)
      .extract({ left, top, width: size, height: size })
      .resize(24, 24, {
        fit: 'cover',
        kernel: sharp.kernel.lanczos3
      })
      .png()
      .toBuffer();

    const base64 = floatIconBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64}`;

    // 保存 base64 到文件，方便复制
    fs.writeFileSync(
      path.join(iconsDir, 'float-icon-base64.txt'),
      dataUri
    );

    console.log(`✓ 已生成 float-icon-base64.txt (Base64 数据)`);
    console.log('\n图标生成完成！');

  } catch (error) {
    console.error('生成图标时出错:', error.message);
    process.exit(1);
  }
}

generateIcons();
