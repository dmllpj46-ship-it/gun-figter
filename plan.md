# PLAN — Duel Arena（3D 手枪对决）

> 人机手枪对战 · 第一人称 · 机器人由 Jev（TypeSafe System One）驱动

## 1. 需求拆解

| # | 需求 | 落点 |
|---|---|---|
| 1 | 3D 网页枪战游戏 | Three.js + WebGL，Vite 打包为纯静态站 |
| 2 | 人机手枪对战 | 玩家 vs 单个 AI 机器人，回合制血量对射 |
| 3 | 人类第一人称 | 摄像机在玩家眼位，右手持枪模型跟随视角 |
| 4 | 对面是机器人，开通（可爱/卡通）形象 | 程序化拼装人形机器人：圆头、发光眼、机械关节、天线 |
| 5 | 用 Jev 驱动机器人 | 服务端代理调用 TypeSafe，前端真值表执行 |
| 6 | 场景是比赛现场 | 圆形擂台 + 看台 + 程序化观众 + 灯光架 + 大屏 |
| 7 | 周围有观众和鲜花 | 观众带跳动/挥手动画；花束、花盆、被扔上台的花 |
| 8 | 人机都只能左右平移 | 双方 z 轴锁定，仅 x 轴移动，边界钳制 |
| 9 | 鼠标瞄准 + 触发射击 | Pointer Lock，鼠标控制 yaw/pitch（限位），左键开火 |
| 10 | 先分析 → 三份文档 → 编码 → 自测 → GitHub → Cloudflare | 本文件 + README.md + AGENTS.md，随后按里程碑执行 |

## 2. 关键设计决策

### 2.1 Jev 的定位：战术大脑，不是逐帧控制器

Jev 是 System One 模型，单次调用有百毫秒级延迟，**不可能每帧驱动**。因此：

- **调用频率**：每 1.6~2.6 秒一次，外加事件触发（玩家开火、玩家换弹、机器人受击、回合开始）。
- **每次调用返回类型化判断**（不是"该做什么"）：
  - `player_aiming_at_me` — Noul，玩家枪口是否指向我
  - `player_threat` — Score，玩家当前威胁等级（4 级）
  - `next_move` — Choice，推进 / 后撤 / 原地 / 左闪 / 右闪
  - `should_fire` — Noul，此刻是否该扣扳机
  - `taunt` — Choice，从预设台词里挑一句（让 Jev 的存在被玩家看见）
- **决策在代码里**：`brain.js` 持有真值表，把上述判断 + 自身血量/弹药/距离映射成动作。Jev 说"推进"但弹匣空了，代码会先换弹。
- **必须可见**：HUD 有"机器人思维"面板，实时显示 Jev 的判断值与最终动作。玩家能看懂对手在想什么。

### 2.2 密钥与降级

- API key **绝不进前端**。浏览器只请求同源 `/api/jev`。
  - 生产：Cloudflare Pages Function（`functions/api/jev.js`），key 来自 Pages 环境变量 `TYPESAFE_API_KEY`。
  - 本地：Vite dev 中间件读取 `~/.workbuddy/.secrets/jev.env` 注入。
- **三级降级**：Jev 在线 → Jev 超时/失败（自动重试 1 次）→ 启发式 AI（本地规则，行为与真值表一致）。
  游戏在完全离线下依然可玩，HUD 会标注当前大脑来源（JEV / LOCAL）。

### 2.3 结构易错点（来自 jev-classify/LOCAL.md，已验证）

| 类型 | `criteria` 形状 | 返回 |
|---|---|---|
| `noul` | 省略，或**对象**（字符串会 422） | 仅概率，无 confidence |
| `choice` | **对象**（选项名 → 描述） | `choice` + `probabilities` + `confidence` |
| `score` | **有序列表**（每级一句情境） | `score` + `legend` + `probabilities` |

阈值取 0.7 / 0.3；0.3~0.7 视为"没想清楚"，单独走一行真值表（机器人会短暂僵住、左右张望——正好是可爱的表现）。

### 2.4 手感优先

- 射击有后坐力（视角上跳 + 枪身后坐 + 准星扩散），自动回正。
- 命中反馈：机器人闪白 + 火花粒子 + 伤害数字 + 命中音；击中有轻微顿帧。
- 移动有加速度与惯性，不是硬切；平移时镜头轻微摇摆。
- 全程序化音效（WebAudio 合成），零外部资源，秒开。

## 3. 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 渲染 | Three.js（npm，非 CDN） | 离线可跑，版本锁定 |
| 构建 | Vite 7 | 快，且 `configureServer` 能做本地 key 注入 |
| 后端 | Cloudflare Pages Functions | 与静态站同源，无需额外服务 |
| 部署 | `wrangler pages deploy` | 已有账号与权限（pages:write） |
| 音频 | WebAudio 程序化合成 | 无资源文件 |
| 仓库 | GitHub `dmllpj46-ship-it`，public | 用户指定 |

## 4. 目录结构

```
gun-figter/
├── index.html              入口 + HUD DOM
├── vite.config.js          构建 + dev 代理（注入 Jev key）
├── functions/api/jev.js    Cloudflare Pages Function 代理
├── src/
│   ├── main.js             装配与主循环
│   ├── style.css           HUD 与界面样式
│   └── game/
│       ├── arena.js        竞技场、观众、鲜花、灯光
│       ├── player.js       第一人称控制、持枪、射击
│       ├── robot.js        机器人建模、动画、受击
│       ├── brain.js        Jev 客户端 + 真值表 + 启发式降级
│       ├── combat.js       弹道、命中判定、伤害、粒子
│       ├── hud.js          HUD 更新、字幕、思维面板
│       └── audio.js        WebAudio 音效
├── plan.md  README.md  AGENTS.md
```

## 5. 里程碑

- [x] M0 分析 + 三份文档
- [x] M1 工程骨架（Vite + Three.js 跑通空白场景）
- [x] M2 竞技场（地面/看台/观众/鲜花/灯光）
- [x] M3 玩家控制 + 射击手感
- [x] M4 机器人 + Jev 大脑 + 降级
- [x] M5 HUD / 音效 / 回合
- [x] M6 本地自测与调优（截图验证画面、模拟键鼠验证操控）
- [x] M7 GitHub public 仓库
- [x] M8 Cloudflare Pages 部署 + 线上验证

线上地址：https://duel-arena.pages.dev
仓库：https://github.com/dmllpj46-ship-it/gun-figter

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| Jev 延迟让机器人显得迟钝 | 决策异步进行，动作由本地插值执行；机器人"思考时"有前摇动作（歪头），把延迟变成表演 |
| 线上未配 key 导致 500 | Function 捕获异常返回 `{ok:false}`，前端静默降级到本地 AI，HUD 标 LOCAL |
| Pointer Lock 在 iframe/预览面板被拦 | 提供"点击开始"遮罩层，失败时降级为"鼠标移动即瞄准"（不锁指针） |
| 性能（观众数量多） | 观众用 InstancedMesh + 共享几何体，单个 draw call |
| 中文字体/emoji 渲染 | 只用系统字体栈，不用 emoji 做 UI 图标 |
