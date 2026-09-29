import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, URL } from 'node:url';

/** 视频生成的上游。形状见 docs/video-api-probe.md */
const VIDEO_UPSTREAM = 'https://llm-proxy.forgeax.com';

export default defineConfig(({ mode }) => {
  // loadEnv 的第三个参数给空前缀，才读得到没有 VITE_ 前缀的变量。
  // 这正是我们要的：LITELLM_KEY 只在 node 进程里存在，不会被内联进产物。
  const env = loadEnv(mode, process.cwd(), '');
  const key = env.LITELLM_KEY ?? '';

  return {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: false,
      proxy: {
        /**
         * 摄像头「曝光一卷」的视频生成代理。
         *
         * ## 这一层不是为了 CORS
         *
         * 上游的 CORS 实测是完全放开的（`access-control-allow-origin: *`，
         * 且 preflight 放行 `authorization` 头），浏览器**可以**直连。
         * 加这个代理的理由是另一个：`import.meta.env.VITE_*` 会被 Vite
         * 原样内联进打包产物，key 就跟着 js 一起发给每一个玩家了。
         * 走这里，key 只留在 node 进程的内存里。
         *
         * ## 生产环境这一层不存在
         *
         * `server.proxy` 只在 vite dev server 里生效。`npm run build` 出来的
         * dist/ 是一堆静态文件，没有任何东西会替它注入 Authorization 头。
         * 所以线上必须自己部署一个等价的后端（转发 + 注入 key + 限流 +
         * 计费上限），否则这个功能在生产环境只有两种结局：要么不工作
         * （然后优雅回落到程序化画面，游戏照常通关），要么你把 key 公开了。
         * 这个问题没有纯前端的解法，别假装它不存在。
         *
         * 一次生成计费 $0.345，所以真上线的话后端那一层必须带限流。
         */
        '/api/video': {
          target: VIDEO_UPSTREAM,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/video/, '/v1'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (key) proxyReq.setHeader('authorization', `Bearer ${key}`);
            });
            proxy.on('error', (err) => {
              // 代理挂了不该让 dev server 跟着倒。前端那边会收到一个失败的
              // fetch，然后走它已经有的回落路径（「信号中断」）。
              console.warn('[video-proxy]', err.message);
            });
          },
        },
      },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      rollupOptions: {
        input: {
          game: fileURLToPath(new URL('./index.html', import.meta.url)),
          deepsea: fileURLToPath(new URL('./deepsea.html', import.meta.url)),
          reference: fileURLToPath(new URL('./reference.html', import.meta.url)),
          expedition: fileURLToPath(new URL('./expedition.html', import.meta.url)),
          whitebox: fileURLToPath(new URL('./whitebox.html', import.meta.url)),
        },
      },
    },
  };
});
