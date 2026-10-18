# 使用官方Bun镜像作为基础镜像
FROM oven/bun:latest AS base

# 设置工作目录
WORKDIR /app

# 复制package.json和bun.lockb文件
COPY package.json bun.lockb* ./

# 安装依赖
RUN bun install --frozen-lockfile

# 复制源代码
COPY . .

# 运行类型检查
RUN bun run lint

# 暴露端口
EXPOSE 8887

# 设置环境变量
ENV NODE_ENV=production

# 启动命令
CMD bun run src/db/migrate.ts && bun run src/index.ts