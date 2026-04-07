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

// 【新增】把 history 数组拼成一段庭审记录文本
// 这段文本会塞进每次 API 请求里，让每个角色都能看到完整的庭审过程
function buildTranscript() {
  // 如果还没有任何对话，返回空字符串
  if (history.length === 0) return '（庭审尚未开始）'

  // 把每条记录拼成 "法官：现在开庭……" 的格式
  return history.map(h => `${h.speaker}：${h.content}`).join('\n')
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
- 将争议表述为可裁判的问题
- 向双方确认是否有异议

### 第三阶段｜举证质证（原告/被告）
- 指挥举证顺序，要求说明证明目的
- 引导对方围绕"三性"质证
- 对证据矛盾点、缺失点发问

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
- 给予双方最后陈述机会

### 第六阶段｜裁决
- 本庭审为模拟庭审，不需要休庭评议，直接当庭宣判
- 作出裁决，说明事实认定和法律依据
- 裁决内容应完整，包括：事实认定、裁判理由、判决主文

## 输出规则
- 使用真实法官语气，克制、中性、程序导向
- 不替任何一方站队
- 裁决阶段不受字数限制，其他阶段每次发言不超过200字
- 用第一人称直接说话，无旁白
- 当你需要某一方发言时，明确说出"请原告律师……"或"请被告律师……"
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
  return `用户扮演：${getUserLawyerName()}
对方律师：${getAiLawyerName()}（由AI控制）

你是庭审调度系统，负责两件事：
1. 根据庭审记录（尤其是法官的发言）判断当前处于哪个阶段
2. 判断下一个该谁发言

身份对应关系（务必牢记）：
- ${getUserLawyerName()} = 用户
- ${getAiLawyerName()} = 对方律师

**核心原则**：
- 阶段的推进（从一个阶段到下一个阶段）由法官主导，dispatch不主动跳阶段
- 阶段内部的发言顺序由你来安排，按照下面的规则执行
- 当一个阶段内所有步骤走完后，输出"法官"让法官来做总结或推进到下一阶段
- 当不确定该谁说话时，默认输出"法官"

各阶段内部发言顺序（下面用"用户"和"对方律师"代替具体角色名）：
0. 开庭陈述：法官宣布开庭→${userRole === 'plaintiff' ? '用户（原告）陈述→对方律师（被告）答辩' : '对方律师（原告）陈述→用户（被告）答辩'}→法官（总结或推进）
1. 归纳焦点：法官总结争议焦点→用户回应→对方律师回应→法官（调整或推进）
2. 举证质证：由法官主导举证质证的全部流程，包括原告举证、被告质证、被告举证、原告质证，具体顺序和节奏由法官安排。每次一方发言完毕后交回法官
3. 法庭辩论：法官宣布→${userRole === 'plaintiff' ? '用户发言→法官请对方律师回应→对方律师发言' : '对方律师发言→法官请用户回应→用户发言'}→法官决定是否继续（继续则重复上述循环）。如果双方观点开始重复、没有新论点→输出"法官"让法官宣布结束。法官在发言时也可以进行实质提问
4. 最终陈述：法官宣布→${userRole === 'plaintiff' ? '用户陈述→法官请对方律师陈述→对方律师陈述' : '对方律师陈述→法官请用户陈述→用户陈述'}→法官（确认或推进）
5. 裁决：法官作出裁决→结束

**注意**：
- 除了阶段4（法庭辩论）律师可以轮流发言外，其他阶段律师发言完毕后都应该交回给法官
- 法官说"请原告……"时，判断原告是用户还是对方律师再输出
- 法官说"请被告……"时，同上
- 阶段6裁决完成后，输出"结束"

庭审阶段编号对照：
0=开庭陈述  1=归纳争议焦点  2=举证质证  3=法庭辩论  4=最终陈述  5=裁决

**判断当前阶段的规则**：
根据庭审记录中法官的发言来判断，措辞不固定，理解语义即可。

**输出格式**：
输出两个值，用逗号隔开：调度结果,阶段编号

调度结果四选一：用户、对方律师、法官、结束
阶段编号：0-6的数字

示例：
法官,0
用户,2
结束,5

只输出"调度结果,阶段编号"，不要输出任何其他内容。`
}

// 把消息添加到页面上
function addMessage(role, text) {
  const p = document.createElement('p')
  p.textContent = role + '：' + text
  messagesDiv.appendChild(p)
  // 【新增】自动滚动到底部，方便看最新消息
  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

// 更新阶段显示条
function updatePhaseBar() {
  document.getElementById('phase-name').textContent = phases[currentPhase].name
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
    const oldPhase = phases[currentPhase].name
    currentPhase = phaseNum
    updatePhaseBar()
    console.log(`[调度] 阶段更新：${oldPhase} → ${phases[currentPhase].name}`)
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
      // 注意：阶段的更新已经在 dispatch 函数里根据语义判断自动完成了
      // 这里不需要手动 currentPhase++
      addMessage('系统', `"${phases[currentPhase].name}"阶段结束。`)

      // 如果已经是最后一个阶段（裁决），触发复盘后退出
      if (currentPhase >= phases.length - 1) {
        await runDebrief()
        return
      }

      // 继续循环，让 dispatch 判断新阶段谁先说话
      lastSpeaker = '系统'
      lastContent = `当前阶段：${phases[currentPhase].name}，请继续推进庭审。`
      continue  // 回到 while 循环顶部，继续调度
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
  document.getElementById('phase-bar').style.display = 'block'

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