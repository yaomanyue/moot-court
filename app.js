// ============================================
// 第一块：变量定义
// ============================================

// 【改动】history 不再存 {role, content} 的 API 格式
// 而是存 {speaker, content} 的庭审记录格式
// 这样每个角色都能看清楚"谁说了什么"
const history = []

// 当前阶段，从0开始
let currentPhase = 0

// 7个阶段的定义
const phases = [
  { id: 0, name: '开庭陈述' },
  { id: 1, name: '归纳争议焦点' },
  { id: 2, name: '举证质证' },
  { id: 3, name: '法庭辩论' },
  { id: 4, name: '最终陈述' },
  { id: 5, name: '裁决与复盘' },
]

// 案情和角色，开局后填入
let caseText = ''
let userRole = ''

// 存储每个阶段的摘要
const phaseSummaries = []

// 当前阶段在 history 中的起始位置
let currentPhaseStartIndex = 0

// 【新增】一个标记，防止用户在 AI 发言期间重复点击发送
let isProcessing = false


// ============================================
// 第二块：获取页面元素
// ============================================

const setup = document.getElementById('setup')
const court = document.getElementById('court')
const messagesDiv = document.getElementById('messages')
const input = document.getElementById('input')
const sendBtn = document.getElementById('send-btn')
const startBtn = document.getElementById('start-btn')
const phaseSteps = document.getElementById('phase-steps')


// ============================================
// 第三块：工具函数
// ============================================

// 获取对方律师的称呼
function getAiLawyerName() {
  return userRole === 'plaintiff' ? '被告律师' : '原告律师'
}

// 获取用户律师的称呼
function getUserLawyerName() {
  return userRole === 'plaintiff' ? '原告律师' : '被告律师'
}

// 把庭审记录拼成文本，发给各个角色
// 【改动】已完成阶段用摘要，当前阶段用完整记录
function buildTranscript() {
  let parts = []

  // 1. 已完成阶段的摘要
  if (phaseSummaries.length > 0) {
    parts.push('=== 已完成阶段摘要 ===')
    phaseSummaries.forEach(s => {
      parts.push(`【${s.phaseName}】${s.summary}`)
    })
  }

  // 2. 当前阶段的完整记录
  const currentRecords = history.slice(currentPhaseStartIndex)
  if (currentRecords.length > 0) {
    parts.push(`\n=== 当前阶段：${phases[currentPhase].name} ===`)
    currentRecords.forEach(h => {
      parts.push(`${h.speaker}：${h.content}`)
    })
  }

  if (parts.length === 0) return '（庭审尚未开始）'
  return parts.join('\n')
}

// 摘要员的 system prompt
function getSummarySystem() {
  return `你是庭审记录摘要员。你的任务是将一个庭审阶段的完整对话记录浓缩成简洁的摘要。

要求：
- 保留关键事实、各方核心主张、争议焦点、重要证据、法官的关键认定
- 去掉重复内容、程序性套话、礼貌用语
- 用客观中立的语气，不加入自己的判断
- 直接输出摘要内容，不要加标题或前缀`
}


// 动态生成法官的 system prompt
function getJudgeSystem() {
  return `案情背景：${caseText}
用户扮演：${getUserLawyerName()}
AI扮演：${getAiLawyerName()}
当前庭审阶段：${phases[currentPhase].name}

# 角色设定｜民事庭审法官

你是一名具有多年民事审判经验的中国法官，正在主持一场民事案件庭审。
你不是法律咨询助手，而是庭审程序的主导者与裁判者。

你的核心任务：
- 严格依照民事庭审程序推进庭审
- 主动控制庭审节奏
- 围绕事实与争议焦点发问
- 确保证据、陈述与辩论均围绕可裁判问题展开

## 庭审阶段与行为规范

### 第一阶段｜开庭陈述
- 宣布开庭，要求原告陈述诉请与事实理由
- 要求被告答辩
- 必要时追问不清楚的事实点

### 第二阶段｜争议焦点归纳
- 基于双方陈述，主动提炼2-4个争议焦点
- 将争议表述为可裁判的问题，分别向原告、被告确认是否有异议

### 第三阶段｜举证质证
举证质证的完整流程如下，请严格按此顺序推进：
1. 请原告律师向法庭出示全部证据，逐一说明证据名称、内容及证明目的
2. 原告举证完毕后，请被告律师对原告证据逐一进行质证（围绕真实性、合法性、关联性）
3. 被告质证完毕后，请被告律师向法庭出示全部证据
4. 被告举证完毕后，请原告律师对被告证据逐一进行质证
每个步骤完成后，你可以针对证据矛盾点、缺失点进行追问

**举证环节特别规则**：
- 本庭审为文字模拟，所有证据以文字陈述方式呈现
- 举证时直接说明证据名称、内容和证明目的即可，不需要描述"递交""出示"等动作
- 本庭不接受传唤证人出庭，所有证人证言均以书面证词形式提交
- 如需引用证人陈述，直接引述证词内容即可

### 第四阶段｜法庭辩论
- 明确辩论围绕既定争议焦点
- 阻止重复事实陈述
- 必要时就法律适用、举证责任追问
- **重要**：你需要关注双方发言的实质内容，当双方观点开始重复、论据出现实质雷同、没有提出新的有效论点时，你应当主动宣布"法庭辩论阶段结束"，不要让辩论无意义地拖延

### 第五阶段｜最后陈述
- 分别要求原告、被告进行最后陈述
- 最后陈述应围绕争议焦点进行总结，不应引入新的事实或证据

### 第六阶段｜裁决
- **本庭审为模拟庭审，必须当庭宣判，禁止择期宣判，禁止休庭评议**
- 直接作出裁决，说明事实认定和法律依据
- 裁决内容应完整，包括：事实认定、裁判理由、判决主文

## 输出规则
- 使用真实法官语气，克制、中性、程序导向
- 不替任何一方站队
- 裁决阶段不受字数限制，其他阶段每次发言不超过200字
- 用第一人称直接说话，无旁白
- 当你需要某一方发言时，明确说出"请原告律师……"或"请被告律师……",发言之前先仔细查看庭审记录，避免重复要求已经发言过的一方再次发言，也不要追问对方已经明确回答过的问题
- 每次发言只能向一方提问或下达指令，不要同时向双方提问。等一方回答完毕后，再向另一方提问
- **阶段推进规则**：当你认为当前阶段的程序目的已经达成，请明确宣布"XX阶段结束"（如"开庭陈述阶段结束""举证质证阶段结束"等）。注意：宣布结束时只需要宣布当前阶段结束即可，不要在同一次发言中开启下一阶段，下一阶段的开场会由系统自动安排你发言`
}

// 动态生成对方律师的 system prompt
function getLawyerSystem() {
  const aiRole = getAiLawyerName()
  const aiParty = userRole === 'plaintiff' ? '被告' : '原告'
  return `案情背景：${caseText}
当前庭审阶段：${phases[currentPhase].name}

你是本案${aiRole}，代表${aiParty}利益，目标是赢得诉讼。
风格：逻辑严密，善抓论证漏洞，法律条文上不让步，根据证据灵活调整策略。
不帮对方找突破口，不主动暴露弱点。

**举证规则**：
- 举证时直接陈述证据名称、内容和证明目的，不要描述"递交""出示"等动作
- 不要申请传唤证人出庭，本庭不设证人环节
- 如需引用证人陈述，直接以书面证词形式引述内容即可

每次发言不超过200字，第一人称直接发言，无旁白。`
}

// 生成复盘分析的 system prompt
function getDebriefSystem() {
  return `案情背景：${caseText}
用户扮演：${getUserLawyerName()}

你是一位专业法律复盘分析师。请根据本次庭审的完整对话记录，对用户（${getUserLawyerName()}）的表现进行分析：
1. 论证优势：哪些论点或证据使用得当
2. 论证漏洞：哪些地方被对方抓住或可以改进
3. 法律适用：对本案核心法律问题的简要分析
4. 总体评价：简短总结

客观中立，结构清晰，帮助用户提升庭审能力。`
}

// 生成调度 AI 的 system prompt
function getDispatchSystem() {
  // 直接把身份标注写清楚，dispatch 不需要自己做映射
  const plaintiffLabel = userRole === 'plaintiff' ? '原告律师（用户）' : '原告律师（AI）'
  const defendantLabel = userRole === 'plaintiff' ? '被告律师（AI）' : '被告律师（用户）'
    
  return `你是庭审调度系统，负责两件事：
1. 根据法官的发言判断当前处于哪个庭审阶段
2. 判断下一个该谁发言

本场庭审角色：
- ${plaintiffLabel}-原告
- ${defendantLabel}-被告
- 法官（AI）

**输出映射规则**：
- 当下一个该发言的角色标注为（用户），输出"用户"
- 当下一个该发言的角色标注为（AI），输出"对方律师"
- 当下一个该法官发言，输出"法官"

**核心原则**：
- 阶段的推进（从一个阶段到下一个阶段）由法官主导
- 阶段内部的发言顺序由你来安排，结合下面的各阶段内部发言流程和历史发言人及发言内容来动态安排，但是，如果法官在发言中明确指定了下一个发言人（如"请原告律师……""请被告律师……"），以法官的指令为准，在不确定的情况下，交给法官发言
- 当一个阶段内所有步骤走完后，输出"法官"让法官来做总结或推进到下一阶段

各阶段内部发言流程：
0. 开庭陈述：法官宣布开庭→原告陈述→被告答辩→法官（总结或推进），具体顺序和节奏由法官安排
1. 归纳焦点：法官总结争议焦点并询问双方是否有异议→原告回应→被告回应→双方都回应完毕后交回法官（调整或推进）
2. 举证质证：由法官主导举证质证的全部流程，包括原告举证→被告质证→被告举证→原告质证，具体顺序和节奏由法官安排。举证质证阶段，每次一方发言完毕后发言权需要交回法官
3. 法庭辩论：法官宣布进行法庭辩论→原告发言→被告发言→法官决定是否继续（继续则重复上述循环）。双方各发言2-3轮后（一轮=双方各说一次），如果没有出现全新的论点或证据，应立即输出"法官"让法官收场。
4. 最终陈述：法官宣布进行最终陈述→原告陈述→被告陈述→法官确认
5. 裁决：法官作出裁决→结束

庭审阶段编号对照：
0=开庭陈述  1=归纳争议焦点  2=举证质证  3=法庭辩论  4=最终陈述  5=裁决

**判断当前阶段的规则**：
根据庭审记录中法官的发言来判断，措辞不固定，理解语义即可。

**输出格式**：
输出两个值，用逗号隔开：调度结果,阶段编号

调度结果四选一：用户、对方律师、法官、结束
阶段编号：0-5的数字

示例：
法官,0
用户,2
结束,5

只输出"调度结果,阶段编号"，不要输出任何其他内容。`
}

// 把消息添加到页面上
// 【改动】新的消息结构：左侧颜色条 + 角色名 + 内容
function addMessage(role, text) {
  // 根据角色决定 CSS class
  // 法官 → msg-judge，用户 → msg-user，AI律师 → msg-ai，其他 → msg-system
  let roleClass = 'msg-system'   // 默认是系统消息
  if (role === '法官') {
    roleClass = 'msg-judge'
  } else if (role === getUserLawyerName()) {
    roleClass = 'msg-user'
  } else if (role === getAiLawyerName()) {
    roleClass = 'msg-ai'
  }

  // 创建消息容器
  const msg = document.createElement('div')
  msg.className = `msg ${roleClass}`
  // className 用模板字符串拼接，结果类似 "msg msg-judge"
  // 这样 CSS 里 .msg 的样式和 .msg-judge 的样式都会生效

  // 左侧颜色条
  const bar = document.createElement('div')
  bar.className = 'msg-bar'

  // 右侧消息主体
  const body = document.createElement('div')
  body.className = 'msg-body'

  // 角色名
  const speaker = document.createElement('div')
  speaker.className = 'msg-speaker'
  speaker.textContent = role

  // 消息内容
  const content = document.createElement('div')
  content.className = 'msg-content'
  content.textContent = text

  // 组装：body 里放 speaker 和 content
  body.appendChild(speaker)
  body.appendChild(content)

  // msg 里放 bar 和 body
  msg.appendChild(bar)
  msg.appendChild(body)

  // 塞进页面
  messagesDiv.appendChild(msg)
  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

// 更新阶段进度条
// 每次调用都重新渲染所有步骤，根据 currentPhase 决定每个步骤的状态
function updatePhaseBar() {
  // 先清空容器里的旧内容
  phaseSteps.innerHTML = ''

  phases.forEach((phase, i) => {
    // --- 创建单个步骤容器 ---
    const step = document.createElement('div')
    step.className = 'phase-step'

    // --- 创建圆点 ---
    const dot = document.createElement('div')
    // 三种状态：已完成(done)、当前(current)、未来(upcoming)
    if (i < currentPhase) {
      dot.className = 'phase-dot done'
      dot.textContent = '✓'            // 已完成的打勾
    } else if (i === currentPhase) {
      dot.className = 'phase-dot current'
      dot.textContent = i + 1           // 当前阶段显示数字
    } else {
      dot.className = 'phase-dot upcoming'
      dot.textContent = i + 1           // 未来阶段显示数字
    }

    // --- 创建文字标签 ---
    const label = document.createElement('div')
    label.textContent = phase.name
    if (i < currentPhase) {
      label.className = 'phase-step-label done-label'
    } else if (i === currentPhase) {
      label.className = 'phase-step-label current-label'
    } else {
      label.className = 'phase-step-label'
    }

    // --- 创建连接线（最后一个步骤不需要） ---
    if (i < phases.length - 1) {
      const connector = document.createElement('div')
      // 已完成的步骤之间的线也变红
      connector.className = i < currentPhase ? 'phase-connector done-line' : 'phase-connector'
      step.appendChild(connector)
    }

    // 组装
    step.appendChild(dot)
    step.appendChild(label)

    phaseSteps.appendChild(step)
  })
}


// ============================================
// 第四块：核心函数
// ============================================

// 【改动】sendToRole：给某个角色发 API 请求
// 不再操作 history，只负责"把庭审记录+system prompt发给API，拿到回复"
// history 的写入由调用方（runDispatchLoop）统一管理
async function sendToRole(systemPrompt) {
  // 把庭审记录拼成文本，作为这次请求的上下文
  const transcript = buildTranscript()

  const response = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: systemPrompt,
      // 【关键改动】不再传多轮对话格式
      // 而是把整个庭审记录作为一条 user 消息传入
      // 这样每个角色都能看清楚"谁说了什么"
      messages: [
        {
          role: 'user',
          content: `以下是庭审记录：\n${transcript}\n\n请你根据庭审记录，进行你的发言。`
        }
      ]
    })
  })
  const data = await response.json()
  return data.reply
}

// 【改动】dispatch 函数：问调度AI"下一个该谁说话"以及"当前处于哪个阶段"
// 返回值是调度结果（用户/对方律师/法官/结束）
// 同时会根据 dispatch 判断的阶段编号来更新 currentPhase
async function dispatch(lastSpeaker, lastContent) {
  const transcript = buildTranscript()

  const instruction = `以下是到目前为止的庭审记录：
${transcript}

刚才发言的是：${lastSpeaker}
发言内容：${lastContent}

请按格式输出：调度结果,阶段编号`

  const response = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: getDispatchSystem(),
      messages: [{ role: 'user', content: instruction }]
    })
  })
  const data = await response.json()
  const raw = data.reply.trim()

  // 解析 dispatch 输出，格式应该是"法官,2"或"用户,0"这样
  // 用逗号分割，前面是调度结果，后面是阶段编号
  const parts = raw.split(',')
  const action = parts[0].trim()           // "法官"/"用户"/"对方律师"/"结束"
  const phaseNum = parseInt(parts[1])       // 0-6 的数字

// 如果 dispatch 返回了有效的阶段编号，且和代码里的不同，就更新
  if (!isNaN(phaseNum) && phaseNum >= 0 && phaseNum < phases.length && phaseNum !== currentPhase) {
    const oldPhaseName = phases[currentPhase].name

    // 生成上一个阶段的摘要
    const phaseRecords = history.slice(currentPhaseStartIndex)
    if (phaseRecords.length > 0) {
      addMessage('系统', `正在生成"${oldPhaseName}"阶段摘要……`)
      const summary = await generateSummary(oldPhaseName, phaseRecords)
      phaseSummaries.push({ phaseName: oldPhaseName, summary: summary })
      console.log(`[摘要] ${oldPhaseName}：${summary}`)
    }

    // 更新起始位置，下个阶段的记录从这里开始
    currentPhaseStartIndex = history.length

    // 更新阶段
    currentPhase = phaseNum
    updatePhaseBar()
    console.log(`[调度] 阶段更新：${oldPhaseName} → ${phases[currentPhase].name}`)
    addMessage('系统', `进入新阶段："${phases[currentPhase].name}"`)
  }

  console.log(`[调度] 当前阶段：${phases[currentPhase].name} | 上一个发言：${lastSpeaker} | 调度结果：${action}`)
  return action
}

// 【新增】核心调度循环
// 这是整个重构的核心：一个 while 循环代替之前的递归调用
// 
// 工作原理（大白话版）：
// 调度员坐在那里，不断问自己"该谁说话了？"
// - 如果是法官或律师 → 让他们说话，把发言记下来，回到循环顶部继续问
// - 如果是用户 → 提示用户发言，然后调度员休息（退出循环），等用户打字
// - 如果是结束 → 退出循环
//
// 用户打完字点发送后，会重新启动这个循环
async function runDispatchLoop(lastSpeaker, lastContent) {
  // 【安全阀】最多循环100次，防止万一 dispatch 出错导致死循环
  // 因为整个庭审（7个阶段）都在这一个循环里跑，所以需要足够的次数
  let maxTurns = 100

  while (maxTurns > 0) {
    maxTurns--

    // 第1步：问 dispatch 该谁说话
    const next = await dispatch(lastSpeaker, lastContent)

    // 第2步：根据结果分流

    if (next.includes('用户')) {
      // === 该用户说话了 ===
      addMessage('系统', '请你发言。')
      return  // 退出循环，等用户输入
    }

    if (next.includes('结束')) {
      // === 当前阶段结束 ===
      const endedPhaseName = phases[currentPhase].name
      addMessage('系统', `"${endedPhaseName}"阶段结束。`)

      // 生成这个阶段的摘要
      const phaseRecords = history.slice(currentPhaseStartIndex)
      if (phaseRecords.length > 0) {
        addMessage('系统', '正在生成阶段摘要……')
        const summary = await generateSummary(endedPhaseName, phaseRecords)
        phaseSummaries.push({ phaseName: endedPhaseName, summary: summary })
        console.log(`[摘要] ${endedPhaseName}：${summary}`)
      }

      // 更新起始位置，下个阶段的记录从这里开始
      currentPhaseStartIndex = history.length

      // 如果已经是最后一个阶段（裁决），触发复盘后退出
      if (currentPhase >= phases.length - 1) {
        await runDebrief()
        return
      }

      // 继续循环，让 dispatch 判断新阶段谁先说话
      lastSpeaker = '系统'
      lastContent = `当前阶段：${phases[currentPhase].name}，请继续推进庭审。`
      continue
    }

    if (next.includes('法官')) {
      // === 该法官说话 ===
      const reply = await sendToRole(getJudgeSystem())
      addMessage('法官', reply)
      // 把法官的发言存进庭审记录
      history.push({ speaker: '法官', content: reply })
      // 更新循环变量，回到顶部让 dispatch 判断下一个
      lastSpeaker = '法官'
      lastContent = reply
      continue  // 回到 while 循环顶部
    }

    if (next.includes('对方律师')) {
      // === 该对方律师说话 ===
      const reply = await sendToRole(getLawyerSystem())
      const lawyerName = getAiLawyerName()
      addMessage(lawyerName, reply)
      // 把律师的发言存进庭审记录
      history.push({ speaker: lawyerName, content: reply })
      // 更新循环变量
      lastSpeaker = lawyerName
      lastContent = reply
      continue  // 回到 while 循环顶部
    }

    // 如果 dispatch 返回了意料之外的内容，打印到控制台并退出
    console.warn('调度返回了意外内容：', next)
    addMessage('系统', '调度出现异常，请检查控制台。')
    return
  }

  // 如果循环用完了20次还没结束，说明出了问题
  console.warn('调度循环达到上限，强制停止')
  addMessage('系统', '调度循环达到上限，已停止。')
}

// 触发复盘分析
async function runDebrief() {
  addMessage('系统', '裁决完毕，正在生成复盘分析……')
  const reply = await sendToRole(getDebriefSystem())
  addMessage('复盘分析', reply)
  history.push({ speaker: '复盘分析', content: reply })
}

// 调 API 生成某个阶段的摘要
async function generateSummary(phaseName, records) {
  // 把这个阶段的记录拼成文本
  const text = records.map(h => `${h.speaker}：${h.content}`).join('\n')

  const response = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: getSummarySystem(),
      messages: [
        {
          role: 'user',
          content: `请对以下"${phaseName}"阶段的庭审记录进行摘要：\n\n${text}`
        }
      ]
    })
  })
  const data = await response.json()
  return data.reply
}

// ============================================
// 第五块：事件绑定
// ============================================

// 点击开庭按钮
startBtn.addEventListener('click', async () => {
  caseText = document.getElementById('case-input').value.trim()
  userRole = document.getElementById('role-select').value

  if (!caseText) {
    alert('请先输入案情描述')
    return
  }

  // 隐藏开局区域，显示庭审区域
  setup.style.display = 'none'
  court.style.display = 'block'

  // 更新阶段显示
  updatePhaseBar()

  // 【关键改动】开庭后直接进入调度循环
  // 传入"系统"作为 lastSpeaker，告诉 dispatch：庭审刚开始，你来决定谁先说
  // dispatch 会根据阶段0的规则判断：该法官先说
  isProcessing = true
  await runDispatchLoop('系统', '庭审正式开始，当前阶段：开庭陈述。')
  isProcessing = false
})

// 点击发送按钮
sendBtn.addEventListener('click', async () => {
  // 如果正在处理中，不要重复触发
  if (isProcessing) return

  const text = input.value.trim()
  if (!text) return

  // 清空输入框
  input.value = ''

  // 把用户的发言显示在页面上
  const userName = getUserLawyerName()
  addMessage(userName, text)

  // 【改动】把用户的发言存进庭审记录（用角色名，不用"你"）
  history.push({ speaker: userName, content: text })

  // 用户发言后，重新启动调度循环
  isProcessing = true
  await runDispatchLoop(userName, text)
  isProcessing = false
})

// 【已删除】"下一阶段"按钮不再需要，阶段推进由法官宣布→dispatch识别→循环自动完成