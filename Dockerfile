# 使用 Node.js 20 slim 镜像
FROM node:20-slim

# 安装必要的系统依赖（faiss-node 需要）
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 创建工作目录
WORKDIR /app

# 复制 package 文件
COPY package.json package-lock.json* ./

# 安装生产依赖（不安装 devDependencies）
RUN npm ci --omit=dev

# 复制项目所有文件
COPY . .

# 构建 Next.js 应用
RUN npm run build

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 启动命令
CMD ["npm", "start"]


