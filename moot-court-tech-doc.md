# 模拟法庭（Moot Court）技术文档

## 一、项目概述

一个中国民事庭审模拟应用，由三个 AI 角色（法官、对方律师、调度 AI）和一个人类角色（用户扮演的律师）协作完成完整的庭审流程。

**技术栈**：
- 前端：`index.html` + `app.js`（原生 JavaScript）
- 后端：`server.js`（Node.js + Express）
- 大模型：DeepSeek API
- 版本管理：Git

**项目路径**：`C:\Users\23325\moot-court\`

---

## 二、核心架构

### 2.1 三层职责分离

```
┌─────────────────────────────────────────────┐
│                 调度层（dispatch）             │
│  · 看得到全部庭审记录                         │
│  · 判断"下一个该谁说话"                       │
│  · 根据法官发言语义判断当前处于哪个阶段         │
│  · 输出格式：调度结果,阶段编号（如 法官,2）     │
└──────────────────┬──────────────────────────┘
                   │ 调度信号
┌──────────────────▼──────────────────────────┐
│              内容层（法官 / 律师 / 用户）       │
│  · 只看到庭审记录，看不到调度指令               │
│  · 法官：主导庭审流程，控制节奏                 │
│  · 律师：根据法官指令发言                       │
│  · 用户：在轮到自己时输入发言                   │
└──────────────────┬──────────────────────────┘
                   │ 发言内容
┌──────────────────▼──────────────────────────┐
│              记录层（history 数组）             │
│  · 格式：{ speaker: '法官', content: '...' }  │
│  · 所有发言统一存储，按时间顺序                  │
│  · 不包含 dispatch 的调度指令                   │
└─────────────────────────────────────────────┘
```

### 2.2 关键设计决策

**为什么把法官和调度分开？**
法官负责"说什么"（内容和流程推进），调度负责"谁说话"（系统调度）。如果让法官同时负责两件事，它会混淆身份，既想当裁判又想当调度员。

**为什么 history 用 `{speaker, content}` 而不是 API 的 `{role, content}`？**
API 格式只有 `user` 和 `assistant` 两种角色。法官回复存成 `assistant`，律师读到时会以为是自己说的。用 `speaker` 标注真实身份（法官/原告律师/被告律师），每个角色都能看清楚"谁说了什么"。

**为什么用 while 循环而不是递归调用？**
之前的做法是"法官说完 → 调 dispatch → dispatch 调律师 → 律师调 dispatch → dispatch 调法官……"，函数里面套函数，像俄罗斯套娃，最终导致死循环。while 循环是一个"调度员"坐在那里反复问自己"该谁了"，不会越套越深。

---

## 三、庭审阶段

```
0. 开庭陈述      法官宣布开庭 → 原告陈述 → 被告答辩 → 法官总结
1. 归纳争议焦点  法官提炼焦点 → 双方确认 → 法官调整
2. 举证质证      法官主导：原告举证 → 被告质证 → 被告举证 → 原告质证
3. 法庭辩论      双方轮流辩论，法官可插入，2-3轮后法官收场
4. 最终陈述      原告最后陈述 → 被告最后陈述 → 法官确认
5. 裁决与复盘    法官当庭宣判 → 系统生成复盘分析
```

阶段编号（0-5）由 dispatch 根据法官发言的语义来判断并更新 `currentPhase`。举证质证原先分为"原告"和"被告"两个子阶段，后来合并为一个阶段，由法官主导内部流程，避免 dispatch 在举证/质证之间混乱。

---

## 四、代码结构（app.js 五大块）

### 第一块：变量定义

```javascript
const history = []              // 庭审记录，格式 {speaker, content}
let currentPhase = 0            // 当前阶段编号（0-5）
const phases = [...]            // 6个阶段定义数组
let caseText = ''               // 用户输入的案情
let userRole = ''               // 用户选择的角色（plaintiff/defendant）
const phaseSummaries = []       // 每个已完成阶段的摘要 {phaseName, summary}
let currentPhaseStartIndex = 0  // 当前阶段在 history 中的起始位置
let isProcessing = false        // 防止用户重复点击的锁
```

### 第二块：获取页面元素

用 `document.getElementById` 获取按钮、输入框、消息区等 DOM 元素。

### 第三块：工具函数

| 函数 | 作用 |
|------|------|
| `getUserLawyerName()` | 返回用户扮演的角色名（原告律师/被告律师） |
| `getAiLawyerName()` | 返回 AI 扮演的角色名 |
| `buildTranscript()` | 拼接庭审记录文本：已完成阶段摘要 + 当前阶段完整记录 |
| `getSummarySystem()` | 摘要员的 system prompt |
| `getJudgeSystem()` | 法官的 system prompt（动态生成，含案情和当前阶段） |
| `getLawyerSystem()` | 对方律师的 system prompt |
| `getDispatchSystem()` | 调度 AI 的 system prompt |
| `getDebriefSystem()` | 复盘分析的 system prompt |
| `addMessage(role, text)` | 在页面上显示一条消息 |
| `updatePhaseBar()` | 更新页面顶部的阶段显示条 |

### 第四块：核心函数

| 函数 | 作用 |
|------|------|
| `sendToRole(systemPrompt)` | 把庭审记录 + system prompt 发给 API，拿到回复 |
| `dispatch(lastSpeaker, lastContent)` | 问调度 AI"谁说话+当前阶段"，解析输出，更新阶段，触发摘要 |
| `runDispatchLoop(lastSpeaker, lastContent)` | 核心 while 循环，根据 dispatch 结果分流执行 |
| `generateSummary(phaseName, records)` | 调 API 生成某阶段的摘要 |
| `runDebrief()` | 庭审结束后生成复盘分析 |

### 第五块：事件绑定

- **开庭按钮**：读取案情和角色 → 启动 `runDispatchLoop`
- **发送按钮**：存用户发言到 history → 启动 `runDispatchLoop`

---

## 五、核心流程详解

### 5.1 调度循环（runDispatchLoop）

这是整个系统的心脏。用大白话说就是一个调度员坐在那里：

```
while (还没到上限) {
    问 dispatch：该谁说话？

    如果是"用户" → 提示用户发言 → 退出循环，等用户打字
    如果是"结束" → 裁决完则复盘，否则继续循环
    如果是"法官" → 法官发言 → 存入 history → 回到循环顶部
    如果是"对方律师" → 律师发言 → 存入 history → 回到循环顶部
}
```

用户打字点发送后，循环重新启动。

### 5.2 dispatch 函数的工作流程

```
1. 把庭审记录 + "刚才谁说了什么" 发给调度 AI
2. 调度 AI 返回 "法官,2" 这样的格式
3. 用逗号分割：action = "法官"，phaseNum = 2
4. 如果 phaseNum 和 currentPhase 不同：
   a. 对上一阶段生成摘要
   b. 更新 currentPhaseStartIndex
   c. 更新 currentPhase
5. 返回 action 给 runDispatchLoop
```

### 5.3 上下文摘要机制

**问题**：庭审记录越来越长，模型注意力下降，开始犯糊涂。

**解决**：每次阶段切换时，对已完成阶段生成摘要。发给角色的上下文变成：

```
=== 已完成阶段摘要 ===
【开庭陈述】原告主张离婚及250万折价款，被告同意离婚但主张100万……
【归纳焦点】争议焦点：1.房屋分割比例 2.贡献考量因素……

=== 当前阶段：举证质证 ===
法官：请原告律师出示证据……
原告律师：第一组证据……
（完整的每条发言记录）
```

关键变量：
- `phaseSummaries`：存每个阶段的摘要 `{phaseName, summary}`
- `currentPhaseStartIndex`：当前阶段从 history 的哪个位置开始
- `buildTranscript()`：拼接摘要 + 当前阶段记录

### 5.4 数据流向图

```
用户点击"开庭"
    │
    ▼
runDispatchLoop('系统', '庭审开始')
    │
    ▼
dispatch() ──→ 调度AI ──→ "法官,0"
    │
    ▼
sendToRole(getJudgeSystem()) ──→ DeepSeek API ──→ 法官回复
    │
    ▼
history.push({speaker:'法官', content: 回复})
    │
    ▼
dispatch() ──→ 调度AI ──→ "用户,0"
    │
    ▼
addMessage('系统', '请你发言。')
return（循环暂停，等用户输入）
    │
    ▼
用户输入并点击"发送"
    │
    ▼
history.push({speaker:'原告律师', content: 用户输入})
    │
    ▼
runDispatchLoop('原告律师', 用户输入)
    │
    ▼
dispatch() ──→ ... 循环继续 ...
```

---

## 六、server.js 说明

server.js 非常简单，只做一件事：接收前端请求，转发给 DeepSeek API，把回复返回前端。

```
前端 ──POST /chat──→ server.js ──→ DeepSeek API
前端 ←── {reply} ←── server.js ←── DeepSeek API
```

请求格式：`{ system: "...", messages: [{role:"user", content:"..."}] }`
返回格式：`{ reply: "大模型的回复" }`

API Key 存在 `.env` 文件中，变量名为 `ANTHROPIC_API_KEY`（虽然实际用的是 DeepSeek）。

---

## 七、JavaScript 语法速查（对照 C 语言）

### 变量声明
```javascript
const x = 5     // 不可重新赋值（类似 C 的 const）
let y = 10      // 可以重新赋值（类似 C 的普通变量）
// 注意：const 数组/对象的内容可以改（push等），只是变量名不能指向别的东西
```

### 箭头函数
```javascript
// C:  void func(int x) { ... }
// JS: const func = (x) => { ... }
// 简写（只有一个参数，一行代码）：
const double = x => x * 2
```

### 数组方法
```javascript
arr.push(item)           // 末尾添加元素（C: arr[len++] = item）
arr.slice(5)             // 从第5个元素截取到末尾，不改变原数组
arr.map(x => x * 2)     // 对每个元素执行操作，返回新数组
arr.forEach(x => {...})  // 遍历每个元素（类似 for 循环）
arr.join('\n')           // 用换行符把所有元素拼成字符串
```

### 异步（async/await）
```javascript
// async 标记这个函数里有需要等待的操作
async function getData() {
  // await 表示"等这个操作完成再继续下一行"
  const response = await fetch('/chat', {...})
  const data = await response.json()
  return data
}
```

类比：去餐厅点菜，`await` 就是"等菜上来再吃"，而不是"点完菜立刻拿起筷子"。

### 模板字符串
```javascript
// 用反引号 ` 包围，${...} 里可以插入变量或表达式
const name = '张三'
const msg = `你好，${name}，现在是阶段${currentPhase}`

// 三元表达式（常用于模板字符串中）
// 条件 ? 真时的值 : 假时的值
const role = userRole === 'plaintiff' ? '原告' : '被告'
```

### DOM 操作
```javascript
document.getElementById('xxx')    // 通过 id 获取页面元素
element.style.display = 'none'    // 隐藏元素
element.style.display = 'block'   // 显示元素
element.textContent = '新文字'     // 修改元素的文字内容
element.appendChild(child)         // 在元素内部末尾添加子元素
```

### 事件监听
```javascript
// 当按钮被点击时，执行后面的函数
btn.addEventListener('click', async () => {
  // 处理点击事件
})
```

---

## 八、Prompt 设计要点

### 法官 prompt 关键规则
- 每次只向一方提问，不同时向双方提问
- 每次发言只宣布一个阶段结束，不跳阶段
- 宣布阶段结束后不开启下一阶段，由系统自动安排
- 裁决阶段必须当庭宣判，禁止择期，禁止休庭评议
- 发言前先查看庭审记录，避免重复提问或重复要求已发言方再次发言
- 举证质证有严格的四步顺序（原告举证→被告质证→被告举证→原告质证）
- 裁决阶段不受字数限制，其他阶段每次发言不超过200字

### 调度 prompt 关键规则
- 输出格式固定：`调度结果,阶段编号`（如 `法官,2`）
- 根据法官发言语义判断阶段编号（0-5），不依赖代码变量
- 身份标注直接写在角色名里：`原告律师（用户）`、`被告律师（AI）`，避免 dispatch 自己做映射
- 法官明确指定发言人时，以法官指令为准，覆盖默认发言顺序
- 不确定时默认输出"法官"
- 辩论阶段2-3轮后主动让法官收场
- 除辩论阶段外，律师发言完毕后都交回法官
- 阶段推进由法官主导，dispatch 不主动跳阶段

### 律师 prompt 关键规则
- 证据以文字形式呈现，不描述动作（不说"递交""出示"）
- 不申请传唤证人，证人证言以书面证词形式引述
- 每次发言不超过200字

### 摘要员 prompt 关键规则
- 保留关键事实、各方核心主张、重要证据
- 摘要控制在200字以内
- 客观中立，直接输出，不加标题或前缀

---

## 九、踩过的坑与解决方案

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 递归调用导致死循环 | 函数里面套函数，无限嵌套 | 改为 while 循环（runDispatchLoop） |
| 法官/律师身份混淆 | API 的 user/assistant 格式无法区分多角色 | history 改为 {speaker, content} 格式 |
| dispatch 搞混用户和AI | 需要自己做"原告=用户还是AI"的推理 | 直接在角色名里标注：原告律师（用户） |
| 阶段编号不更新 | dispatch 很少输出"结束"，阶段切换靠编号变化 | 摘要生成移到 dispatch 检测到编号变化时触发 |
| 法官重复提问/重复点名 | 上下文太长，模型注意力不够 | 上下文摘要 + prompt 里要求"先查看记录再发言" |
| 法官一次向双方提问 | prompt 没限制 | 加规则"每次只能向一方提问" |
| 法官跳阶段 | 在一次发言中同时结束旧阶段+开启新阶段 | prompt 明确要求"只宣布当前阶段结束，不开启下一阶段" |
| 辩论阶段无限循环 | 法官需要 dispatch 给说话机会才能宣布结束 | dispatch 在2-3轮后主动让法官收场 |
| 法官择期宣判/休庭评议 | 模型自己的法律知识覆盖了 prompt | 加强措辞："必须当庭宣判，禁止择期，禁止休庭评议" |
| 证人传唤导致卡死 | 没有证人角色 | prompt 禁止传唤证人，改用书面证词 |
| 举证质证阶段混乱 | 分成原告/被告两个子阶段，dispatch 来回跳 | 合并为一个"举证质证"阶段，法官主导内部流程 |
| dispatch 抢了法官的活 | dispatch 规则写得太详细，自己在推进流程 | 收窄 dispatch 职责，阶段推进交给法官 |
| 法官和 dispatch 对不上 | 法官推进了阶段但代码变量没更新 | dispatch 通过语义判断阶段编号，动态更新 currentPhase |
| 摘要没有生效 | 摘要代码放在"结束"分支，但阶段切换不走"结束" | 摘要生成移到 dispatch 检测到阶段编号变化时触发 |

---

## 十、Git 常用命令

```powershell
git add .                        # 把所有改动加入暂存区
git commit -m "说明改了什么"      # 存一个版本
git log --oneline                # 查看历史版本列表
git checkout <版本编号>           # 回到某个旧版本
git checkout master              # 回到最新版本
```

---

## 十一、后续优化方向

- **前端美化**：当前是朴素的 HTML，可以加 CSS 样式
- **推到 GitHub**：实现跨电脑开发
- **换更强模型**：测试不同模型对 prompt 遵循能力的差异
- **摘要质量优化**：调整摘要 prompt，确保关键信息不丢失
- **错误处理**：API 调用失败时的重试和提示机制
