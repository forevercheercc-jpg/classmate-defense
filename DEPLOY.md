# 同学局像素防守联机 — 部署指南

零成本、不绑卡。`server` → Render（Docker free plan），`client` → Cloudflare Pages。

## Server: Render

1. 打开 <https://render.com>，用 **GitHub 账号**一键注册/登录
2. Dashboard 顶部点 **New + → Blueprint**
3. 选 `forevercheercc-jpg/classmate-defense` 仓库 → **Apply**
4. Render 自动读 `render.yaml`，创建 `classmate-defense-server` Web Service
5. 第一次构建约 5–8 分钟。完成后 Render 给一个域名，形如：
   ```
   https://classmate-defense-server.onrender.com
   ```
6. **注意 free plan 冷启动约 30s** —— 同学点开游戏首次要等几十秒

## Client: Cloudflare Pages

1. 打开 <https://dash.cloudflare.com/>，注册（邮箱即可，**不要绑卡**）
2. 左侧栏 **Workers & Pages → Create application → Pages → Connect to Git**
3. 选 `forevercheercc-jpg/classmate-defense` 仓库
4. 配置：
   | 字段 | 填什么 |
   |---|---|
   | **Project name** | `classmate-defense` |
   | **Production branch** | `master` |
   | **Build command** | `pnpm install --frozen-lockfile=false && pnpm --filter @claude-royale/client build` |
   | **Build output directory** | `client/dist` |
   | **Root directory** *(新版有)* | **留空**（用仓库根） |

5. **环境变量** (Settings → Environment variables)：
   | 变量 | 值 |
   |---|---|
   | `VITE_SERVER_URL` | `wss://classmate-defense-server.onrender.com` ← 换成 server 真实域名 |

6. 点 **Save and Deploy**。约 3 分钟构建完，得到：
   ```
   https://classmate-defense.pages.dev
   ```

## 同学怎么玩

把 client URL（`https://classmate-defense.pages.dev`）发到同学群即可。
任何人点开就进中文首页 → 「🛡️ 防守 PVE」开局（默认 4 人同屏，可少于 4）。

## 自动部署

- **Render**：push master 自动 build+deploy server
- **Cloudflare Pages**：push master 自动 build+deploy client
- **GitHub Actions** (`deploy-server.yml`)：原本是 Fly.io 用的，Render 不需要，已禁用（不影响）

## 失败兜底

| 现象 | 解决 |
|---|---|
| Render build 报 `pnpm install` 超时 | 在 Render Dashboard → Environment → 加 `NPM_CONFIG_PREFER_OFFLINE=true` |
| Client 打开连不上 server | 检查 client 的 `VITE_SERVER_URL` 是否填了 server 真实域名；浏览器开发者工具 Network/WS 看握手 |
| Render 冷启动 30s+ | free plan 正常；或开第二个 server 实例分担 |
| Cloudflare Pages build 报 monorepo 错 | 把 Build command 改成 `pnpm install --frozen-lockfile=false && cd client && pnpm build`（备用） |

## 资源占用估算

| 组件 | 空闲 | 4 同学对局 |
|---|---|---|
| Render free (512MB) | 80MB | 200–300MB |
| Cloudflare Pages (静态) | 0 | 0（只发 HTML/JS） |

够用。
