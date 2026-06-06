import fs from "fs";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import svgrPlugin from "vite-plugin-svgr";
import { ViteEjsPlugin } from "vite-plugin-ejs";
import { VitePWA } from "vite-plugin-pwa";
import checker from "vite-plugin-checker";
import { createHtmlPlugin } from "vite-plugin-html";
import Sitemap from "vite-plugin-sitemap";
import { woff2BrowserPlugin } from "../scripts/woff2/woff2-vite-plugins";
import { exec } from "child_process";
import os from "os";

const localScenesAPI = () => ({
  name: "local-scenes-api",
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      const scenesDir = path.resolve(__dirname, "../my-scenes");
      
      if (!fs.existsSync(scenesDir)) {
        fs.mkdirSync(scenesDir, { recursive: true });
        console.log('[Backend] Auto-created /my-scenes/ directory');
      }

      // --- EXISTING GET ALL SCENES ---
      if (req.url === "/api/scenes" && req.method === "GET") {
        const files = fs.readdirSync(scenesDir).filter((f: string) => f.endsWith(".excalidraw"));
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(files));
        return;
      }

      // --- EXISTING GET SINGLE SCENE ---
      if (req.url.startsWith("/api/scenes/") && req.method === "GET") {
        const filename = decodeURIComponent(req.url.split("/").pop());
        const filepath = path.join(scenesDir, filename);
        if (fs.existsSync(filepath)) {
          res.setHeader("Content-Type", "application/json");
          res.end(fs.readFileSync(filepath, "utf-8"));
        } else {
          res.statusCode = 404;
          res.end("Not found");
        }
        return;
      }

      // --- EXISTING POST (SAVE) SCENE ---
      if (req.url.startsWith("/api/scenes/") && req.method === "POST") {
        const filename = decodeURIComponent(req.url.split("/").pop());
        const filepath = path.join(scenesDir, filename);
        let body = "";
        req.on("data", (chunk: any) => { body += chunk.toString(); });
        req.on("end", () => {
          fs.writeFileSync(filepath, body);
          res.end("Saved successfully");
        });
        return;
      }

      // --- NEW: DELETE SCENE ---
      if (req.url.startsWith("/api/scenes/") && req.method === "DELETE") {
        const filename = decodeURIComponent(req.url.split("/").pop());
        const filepath = path.join(scenesDir, filename);
        
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath); // Delete the file
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ message: "Deleted successfully" }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "File not found" }));
        }
        return;
      }

      // --- NEW: PUT (RENAME) SCENE ---
      if (req.url.startsWith("/api/scenes/") && req.method === "PUT") {
        const filename = decodeURIComponent(req.url.split("/").pop());
        const oldPath = path.join(scenesDir, filename);
        
        let body = "";
        req.on("data", (chunk: any) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const { newName } = JSON.parse(body);
            const newPath = path.join(scenesDir, newName);
            
            if (fs.existsSync(oldPath)) {
              fs.renameSync(oldPath, newPath); // Rename the file
              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ message: "Renamed successfully" }));
            } else {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: "File not found" }));
            }
          } catch (error) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Invalid request body" }));
          }
        });
        return;
      }

      // --- NEW: OPEN LOCAL FOLDER ---
      if (req.url === "/api/open-folder" && req.method === "GET") {
        const scenesDir = path.resolve(__dirname, "../my-scenes");
        let command = "";
        
        // Determine the correct command based on the OS
        switch (os.platform()) {
          case "darwin": // macOS
            command = `open "${scenesDir}"`;
            break;
          case "win32": // Windows
            command = `start "" "${scenesDir}"`;
            break;
          default: // Linux
            command = `xdg-open "${scenesDir}"`;
            break;
        }

        exec(command, (err) => {
          res.setHeader("Content-Type", "application/json");
          if (err) {
            console.error("Failed to open folder:", err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Failed to open folder" }));
          } else {
            res.statusCode = 200;
            res.end(JSON.stringify({ message: "Folder opened" }));
          }
        });
        return;
      }


      next();
    });
  }
});

export default defineConfig(({ mode }) => {
  // To load .env variables
  const envVars = loadEnv(mode, `../`);
  // https://vitejs.dev/config/
  return {
    server: {
      port: Number(envVars.VITE_APP_PORT || 3000),
      // open the browser
      open: true,
    },
    // We need to specify the envDir since now there are no
    //more located in parallel with the vite.config.ts file but in parent dir
    envDir: "../",
    resolve: {
      alias: [
        {
          find: /^@excalidraw\/excalidraw$/,
          replacement: path.resolve(__dirname, "../packages/excalidraw/index.tsx"),
        },
        {
          find: /^@excalidraw\/excalidraw\/(.*?)/,
          replacement: path.resolve(__dirname, "../packages/excalidraw/$1"),
        },
        {
          find: /^@excalidraw\/utils$/,
          replacement: path.resolve(__dirname, "../packages/utils/index.ts"),
        },
        {
          find: /^@excalidraw\/utils\/(.*?)/,
          replacement: path.resolve(__dirname, "../packages/utils/$1"),
        },
        {
          find: /^@excalidraw\/math$/,
          replacement: path.resolve(__dirname, "../packages/math/index.ts"),
        },
        {
          find: /^@excalidraw\/math\/(.*?)/,
          replacement: path.resolve(__dirname, "../packages/math/$1"),
        },
      ],
    },
    build: {
      outDir: "build",
      rollupOptions: {
        output: {
          assetFileNames(chunkInfo) {
            if (chunkInfo?.name?.endsWith(".woff2")) {
              const family = chunkInfo.name.split("-")[0];
              return `fonts/${family}/[name][extname]`;
            }

            return "assets/[name]-[hash][extname]";
          },
          // Creating separate chunk for locales except for en and percentages.json so they
          // can be cached at runtime and not merged with
          // app precache. en.json and percentages.json are needed for first load
          // or fallback hence not clubbing with locales so first load followed by offline mode works fine. This is how CRA used to work too.
          manualChunks(id) {
            if (
              id.includes("packages/excalidraw/locales") &&
              id.match(/en.json|percentages.json/) === null
            ) {
              const index = id.indexOf("locales/");
              // Taking the substring after "locales/"
              return `locales/${id.substring(index + 8)}`;
            }
          },
        },
      },
      sourcemap: true,
      // don't auto-inline small assets (i.e. fonts hosted on CDN)
      assetsInlineLimit: 0,
    },
    plugins: [
      localScenesAPI(),
      Sitemap({
        hostname: "https://excalidraw.com",
        outDir: "build",
        changefreq: "monthly",
        // its static in public folder
        generateRobotsTxt: false,
      }),
      woff2BrowserPlugin(),
      react(),
      checker({
        typescript: true,
        eslint:
          envVars.VITE_APP_ENABLE_ESLINT === "false"
            ? undefined
            : { lintCommand: 'eslint "./**/*.{js,ts,tsx}"' },
        overlay: {
          initialIsOpen: envVars.VITE_APP_COLLAPSE_OVERLAY === "false",
          badgeStyle: "margin-bottom: 4rem; margin-left: 1rem",
        },
      }),
      svgrPlugin(),
      ViteEjsPlugin(),
      VitePWA({
        registerType: "autoUpdate",
        devOptions: {
          /* set this flag to true to enable in Development mode */
          enabled: envVars.VITE_APP_ENABLE_PWA === "true",
        },

        workbox: {
          // don't precache fonts, locales and separate chunks
          globIgnores: [
            "fonts.css",
            "**/locales/**",
            "service-worker.js",
            "**/*.chunk-*.js",
          ],
          runtimeCaching: [
            {
              urlPattern: new RegExp(".+.woff2"),
              handler: "CacheFirst",
              options: {
                cacheName: "fonts",
                expiration: {
                  maxEntries: 1000,
                  maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days
                },
                cacheableResponse: {
                  // 0 to cache "opaque" responses from cross-origin requests (i.e. CDN)
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: new RegExp("fonts.css"),
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "fonts",
                expiration: {
                  maxEntries: 50,
                },
              },
            },
            {
              urlPattern: new RegExp("locales/[^/]+.js"),
              handler: "CacheFirst",
              options: {
                cacheName: "locales",
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // <== 30 days
                },
              },
            },
            {
              urlPattern: new RegExp(".chunk-.+.js"),
              handler: "CacheFirst",
              options: {
                cacheName: "chunk",
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 90, // <== 90 days
                },
              },
            },
          ],
        },
        manifest: {
          short_name: "Excalidraw",
          name: "Excalidraw",
          description:
            "Excalidraw is a whiteboard tool that lets you easily sketch diagrams that have a hand-drawn feel to them.",
          icons: [
            {
              src: "android-chrome-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "apple-touch-icon.png",
              type: "image/png",
              sizes: "180x180",
            },
            {
              src: "favicon-32x32.png",
              sizes: "32x32",
              type: "image/png",
            },
            {
              src: "favicon-16x16.png",
              sizes: "16x16",
              type: "image/png",
            },
          ],
          start_url: "/",
          id:"excalidraw",
          display: "standalone",
          theme_color: "#121212",
          background_color: "#ffffff",
          file_handlers: [
            {
              action: "/",
              accept: {
                "application/vnd.excalidraw+json": [".excalidraw"],
              },
            },
          ],
          share_target: {
            action: "/web-share-target",
            method: "POST",
            enctype: "multipart/form-data",
            params: {
              files: [
                {
                  name: "file",
                  accept: [
                    "application/vnd.excalidraw+json",
                    "application/json",
                    ".excalidraw",
                  ],
                },
              ],
            },
          },
          screenshots: [
            {
              src: "/screenshots/virtual-whiteboard.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/wireframe.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/illustration.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/shapes.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/collaboration.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/export.png",
              type: "image/png",
              sizes: "462x945",
            },
          ],
        },
      }),
      createHtmlPlugin({
        minify: true,
      }),
    ],
    publicDir: "../public",
  };
});
