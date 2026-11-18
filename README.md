# Duel Arena — 3D 手枪对决

浏览器里的第一人称手枪对决：你 vs 一台由 **Jev（TypeSafe System One 模型）** 驱动的人形机器人。
场地是夜场竞技擂台，看台上坐满观众，台边堆着花束，赢了会被扔花。

**在线试玩**：https://duel-arena.pages.dev
**源码**：https://github.com/dmllpj46-ship-it/gun-figter

---

## 玩法

- 你和机器人**都只能左右平移**，谁也别想绕后。
- 鼠标瞄准，左键开火。手枪 7 发弹匣，`R` 换弹。
- 双方各 100 点生命，先把对方打空的一方赢下这一回合。三局两胜。
- 机器人每隔两秒左右会"思考"一次，右上角面板会实时显示它在想什么——
  它在判断你有多危险、该不该开枪、下一步往哪闪。

## 操作

| 输入 | 动作 |
|---|---|
| `A` / `D` 或 `←` / `→` | 左右平移 |
| 鼠标 | 瞄准（Pointer Lock） |
| 左键 | 开火 |
| `R` | 换弹 |
| `Esc` | 释放鼠标 |
| `Enter` | 开始 / 重开 |

## 本地运行

```bash
npm install
npm run dev          # http://localhost:5173
```

本地开发时，Vite 中间件会从 `~/.workbuddy/.secrets/jev.env` 读取 `TYPESAFE_API_KEY`
并注入 `/api/jev` 代理，浏览器端永远看不到密钥。没配 key 也能玩，机器人会自动降级到本地启发式 AI。

```bash
npm run build        # 产物在 dist/
npm run preview      # 预览构建结果
```

## 部署（Cloudflare Pages）

```bash
npm run build
npx wrangler pages deploy dist --project-name duel-arena --branch main --cwd .
```

`functions/api/jev.js` 会被自动打包为同源 API。密钥需在 Pages 项目里配置：

```bash
npx wrangler pages secret put TYPESAFE_API_KEY --project-name duel-arena
```

## 技术

- **Three.js** 渲染，全程序化建模（无外部模型/贴图/音频文件）
- **Vite** 构建
- **Cloudflare Pages Functions** 做 Jev 代理（密钥只存服务端）
- 机器人决策 = **Jev 做判断 + 代码真值表做决策**，Jev 不可用时无缝降级

细节见 [plan.md](./plan.md)，开发约定见 [AGENTS.md](./AGENTS.md)。

## 许可

MIT
