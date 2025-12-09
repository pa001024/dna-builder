from PIL import Image
import os
import glob

# 输入目录
input_dir = "C:\\Users\Administrator\\Pictures"
output_dir = "C:\\Users\Administrator\\Pictures\\out"
# 输出目录 - 与输入目录相同，覆盖原图片
# 目标尺寸
target_size = (256, 256)

# 获取所有图片文件
image_files = glob.glob(os.path.join(input_dir, "*.png"))

# 跳过getimg.sh文件
image_files = [f for f in image_files if not f.endswith("getimg.sh")]

print(f"Found {len(image_files)} images to process")

for image_path in image_files:
    try:
        # 打开图片
        img = Image.open(image_path)

        # 获取原始尺寸
        width, height = img.size

        # 计算裁切区域（中心裁切）
        min_dim = min(width, height) - 120
        left = (width - min_dim) // 2
        top = (height - min_dim) // 2
        right = left + min_dim
        bottom = top + min_dim

        # 裁切图片
        img_cropped = img.crop((left, top, right, bottom))

        # 缩放图片
        img_resized = img_cropped.resize(target_size, Image.LANCZOS)

        # 保存图片（覆盖原文件）
        img_resized.save(os.path.join(output_dir, os.path.basename(image_path)))

        print(f"Processed: {os.path.basename(image_path)}")
    except Exception as e:
        print(f"Error processing {os.path.basename(image_path)}: {e}")

print("All images processed successfully!")
