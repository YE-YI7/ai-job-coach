import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 使用 standalone 输出模式，提高部署稳定性
  output: 'standalone',

  // 禁用 Lightning CSS
  experimental: {
    optimizeCss: false, // 关闭 lightningcss
  },

  // Turbopack 配置（Next.js 16 默认启用）
  turbopack: {},

  // 全局安全头配置：CSP（与 app/layout.tsx 中的 meta tag CSP 保持一致）
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self' https:",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
              "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com",
              "img-src 'self' data: blob: https:",
              "connect-src 'self' https://*.supabase.co https://api.openai.com https://api.deepseek.com ws: wss:",
              "object-src 'none'",
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Webpack 配置：确保 hnswlib-node 作为原生模块被正确处理
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 关键：将 hnswlib-node 视为外部模块 (externals)
      // 告诉 Webpack 不要将这个原生模块打包，而是让 Node.js (Vercel) 在运行时通过 require() 加载。
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('hnswlib-node');
      } else {
        // 如果 externals 是对象，转换为数组
        config.externals = [config.externals, 'hnswlib-node'];
      }
    }

    return config;
  },
};

export default nextConfig;
