import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the PDF parser and its worker available in Vercel's Node.js functions.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],

  // 使用 standalone 输出模式，提高部署稳定性
  output: 'standalone',

  // 禁用 Lightning CSS
  experimental: {
    optimizeCss: false, // 关闭 lightningcss
  },

  // Turbopack 配置（Next.js 16 默认启用）
  turbopack: {},

  // Next 16 默认会在开发时写入 AGENTS.md / CLAUDE.md；仓库已有自己的规则，不生成噪音文件。
  agentRules: false,

  // 全局安全头配置。CSP 只在响应头维护，避免 meta/header 策略漂移。
  async headers() {
    const scriptSources = process.env.NODE_ENV === "development"
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSources,
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              "img-src 'self' data: blob: https:",
              "worker-src 'self' blob:",
              "media-src 'self' blob: https:",
              "connect-src 'self' https://*.supabase.co https://api.openai.com https://api.deepseek.com ws: wss:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
            ].join("; "),
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
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
