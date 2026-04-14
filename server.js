require('dotenv').config()  

//把刚才装的 express 库引入进来，就像"我要用这个工具"
const express = require('express')
//用 express 创建一个应用实例，后续所有操作都在这个 app 上进行
const app = express()

//告诉服务器"请求里如果有 JSON 数据，帮我自动解析"
app.use(express.json())
//把当前文件夹设为静态文件目录，意思是浏览器访问时可以直接拿到 `index.html`
app.use(express.static('.'))

// 处理对话请求的接口
// 定义一个接口，专门处理发到 /chat 这个地址的 POST 请求。POST 是一种请求类型，适合用来"发送数据"
// async这个函数是异步的，意思是它里面会有需要等待的操作（比如等API返回结果），加了 async 才能用 await
// req 是请求对象，里面装着前端发过来的数据；res 是响应对象，用来把结果返回给前端
app.post('/chat', async(req, res) => {
  // 从请求里取出数据
  //req.body — 请求体，前端发过来的数据就在这里面
  const { system, messages } = req.body
 
  console.log('messages:', JSON.stringify(messages, null, 2))
  // 调用大模型API-deepseek
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      //从。env文件里读取APIkey
      'Authorization': 'Bearer ' + process.env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
    model: 'deepseek-chat',
    max_tokens: 2048,
    // DeepSeek把system作为第一条消息传入
    messages: [{ role: 'system', content: system }, ...messages]

    })
  })
  //把api返回的结果解析成JSON
  const data = await response.json()
  //取出大模型回复的内容，发回给前端
  res.json({ reply: data.choices[0].message.content })

})

//启动服务器，监听 3000 端口，启动成功后打印一行提示
app.listen(3000, () => {
  console.log('Server is running on port 3000')
})  

