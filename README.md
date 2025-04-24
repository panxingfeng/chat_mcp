# chat_mcp

chat_mcp是一个聊天服务和工具执行平台，允许用户通过聊天界面与AI助手交互并执行各种工具。支持多种LLM模型和各种MCP工具服务集成。

## 项目概述

chat_mcp为大型语言模型(LLM)提供了工具调用能力，完成Agent实现。包含前端UI、后端服务和mcp工，使AI助手能够根据用户需求选择并执行适当的工具，提供更完善的内容回答。

## 支持模型

- **Ollama**
- **DeepSeek**
- **OpenAI**
- **硅基流动 (SiliconFlow)**
- **LM Studio**
- **Gemini**

> PS: 目前不支持推理模型,历史记录保存只支持在Microsoft Edge使用，谷歌不适用

## 核心功能

- **多工具集成**: 可以集成各种MCP工具
- **智能工具选择**: 自动根据用户意图选择合适的工具
- **工具执行管理**: 处理工具调用流程
- **结果评估**: 评估工具执行结果并给出合理响应
- **流式响应**: 支持流式返回结果
- **会话管理**: 暂时未做处理

## 快速开始

### 前端启动

```bash
# 安装依赖
cd chat_ui
npm install

# 启动开发服务器
npm start
```

### 后端启动

```bash
# 创建环境
python -m venv venv

# 激活虚拟环境
.venv\Scripts\activate  # win
source venv/bin/activate #linux/mac
  

# 安装Python依赖
pip install -r requirements.txt

# 启动服务
python main.py
```

### 工具服务配置

在`servers_config.json`中配置MCP工具服务:

```json
{
  "mcpServers": {
    "weather": {
      "command": "python",
      "args": ["-m", "chat_mcp.mcp_server.mcp_server_weather", "--api-key=高德API"]
    },
    "speech": {
      "command": "python",
      "args": ["-m", "chat_mcp.mcp_server.mcp_server_speech", "--server-url=INDEX-TTS的url信息"]
    },
    "web_search": {
      "command": "python",
      "args": ["-m", "mcp_server_searxng", "--instance-url=searXNG的url信息"]
    },
    "wechat": {
      "command": "python",
      "args": ["-m", "mcp_server_wechat","--folder-path=保存历史记录的目录"]
    },
    "comfyui": {
      "command": "python",
      "args": ["-m", "chat_mcp.mcp_server.mcp_server_comfyui","--server-url=COMFYUI的url信息"]
    }
  }
}
```

## 功能演示

| ![工具交互测试](./images/MCP工具交互测试.gif) | ![MCP工具测试](./images/MCP工具测试.gif) | ![单工具测试](./images/单工具测试.png) | ![双工具测试](./images/双工具测试.png) |
|:---:|:---:|:---:|:---:|


## 许可证

MIT
