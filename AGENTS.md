# AGENTS.md

给接手这个仓库的 agent 看的约定。人类读者请看 [README.md](./README.md)。

## 项目性质

单页 3D 网页游戏（Three.js）。无后端业务逻辑，唯一的服务端代码是
`functions/api/jev.js` —— 一个把请求转发给 TypeSafe 的代理。

## 命令

```bash
npm install
npm run dev        # Vite dev server，默认 5173，带 /api/jev 代理
npm run build      # -> dist/
npm run preview    # 预览 dist/
```

## 硬性约束

1. **API 密钥永不进前端。** 浏览器只能请求同源 `/api/jev`。
   - 本地：`vite.config.js` 的 `configureServer` 中间件读 `~/.workbuddy/.secrets/jev.env`。
   - 生产：`functions/api/jev.js` 读 `env.TYPESAFE_API_KEY`。
   - 任何情况下不要把 key 写进 `src/`、`index.html`、`.env`（提交进仓库的）、日志或提交信息。
2. **Jev 的调用频率受控。** 只在 `brain.js` 的 `think()` 里发起，最小间隔 1600ms，
   且同一时刻最多一个 in-flight 请求。不要把它接到逐帧循环里。
3. **决策逻辑必须在代码里。** Jev 只回答类型化判断（noul / choice / score），
   "该不该开火""该往哪走"的最终裁决写在 `brain.js` 的真值表里。不要把决策措辞塞进问题。
4. **必须可降级。** `/api/jev` 失败、超时（7.5s，兼容 Pages Functions 冷启动）或返回异常时，
   `brain.js` 回落到 `heuristicThink()`。降级后游戏要完全可玩；连续两次失败才把 HUD 标成 LOCAL。
5. **零外部资源。** 不引入图片、模型、音频文件。几何体程序化生成，音效用 WebAudio 合成。
6. **两侧都只能左右平移。** 玩家和机器人的 z 坐标锁定，只动 x，且钳制在场地边界内。
   机器人的移动目标必须在**到达后重新下发**（`main.js` 的 `state.moveTargetX`），
   只按模式切换时下发一次会让机器人走到位后永久停住。改动移动逻辑时别破坏这条。
7. **渲染性能。** 观众用 InstancedMesh。新增大量重复物体时同样处理。

## 结构易错点（TypeSafe API）

| 类型 | `criteria` | 返回字段 |
|---|---|---|
| `noul` | 省略或**对象**（字符串 → 422 `model_attributes_type`） | 只有概率，**没有** confidence |
| `choice` | **对象**：选项名 → 描述 | `choice` + `probabilities` + `confidence` |
| `score` | **有序列表**：每级一句情境描述 | `score` + `legend` + `probabilities` + `confidence` |

- 端点 `POST https://api.typesafe.ai/v1/systemone`，`model: "jev-latest"`（实际应答 `jev-1.14.0`）。
- 头：`Authorization: Bearer <key>`、`Content-Type: application/json`。
- 定价 $0.042/Mtok，只计输入 token。一次对局几十次调用，成本可忽略。
- 阈值：>0.7 判是，<0.3 判否，中间视为"没想清楚"。
- 中文能用但精度低于英文；`brain.js` 里的 state 与问题统一用**英文**写，台词表另存中文。

## 代码风格

- 原生 ESM，无框架，无 TypeScript。模块单一职责。
- 单位：米 / 秒 / 弧度。摄像机高度 1.62。
- 每帧逻辑放 `main.js` 的 `tick()`，用 `dt` 缩放，不写死帧率假设。
- 新增可调参数集中放在各模块顶部的 `const CONFIG = {...}` 里，别散落魔法数字。

## 部署

```bash
npm run build
npx wrangler pages deploy dist --project-name duel-arena --branch main --cwd .
```

- `--cwd .` **必须给**，否则 wrangler 会跳过 `functions/`，`/api/jev` 变 404。
- 密钥：`npx wrangler pages secret put TYPESAFE_API_KEY --project-name duel-arena`。
- 账号：Cloudflare `poetfangnimagoupi@gmail.com`，`wrangler whoami` 核对。

## Git

- 远端：`https://github.com/dmllpj46-ship-it/gun-figter.git`（HTTPS，本机 SSH 未注册）。
- 身份由 `gh` CLI 提供（active 账号 `dmllpj46-ship-it`）。
- 提交前 `git status --short` 过一遍，确认没有 key、`dist/`、`node_modules/`。
