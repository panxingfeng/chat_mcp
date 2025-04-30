import json
import os
import re
from typing import Any, Dict, List, Optional, Sequence
from openai import OpenAI

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, ImageContent, EmbeddedResource, ErrorData
from mcp.shared.exceptions import McpError

from chat_mcp.utils.get_project_root import get_project_root


class SummaryServer:
    """
    内容摘要 MCP
    """

    def __init__(self, config_path: str = None, 
                 default_style: str = "标准风格",
                 llm_url: str = "http://localhost:11434/v1", 
                 llm_key: str = "ollama", 
                 model: str = "qwen2.5"):
        
        self.config_path = config_path
        self.default_style = default_style
        self.style_configs = self._load_style_configs(config_path)
        self.llm_url = llm_url
        self.llm_key = llm_key
        self.model = model
        
    def _load_style_configs(self, config_path: str) -> Dict[str, str]:
        """
        从文件加载风格配置
        """
        try:
            if config_path and os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    style_configs = json.load(f)
                print(f"成功从 {config_path} 加载风格配置")
                return style_configs
            else:
                print(f"警告: 配置文件不存在 {config_path}，将使用默认风格")
        except Exception as e:
            print(f"加载配置文件出错: {str(e)}，将使用默认风格")
        
        return {
            "标准风格": "请将以下内容总结为清晰简洁的摘要。使用 Markdown 格式，包括：\n1. 标题\n2. 主要内容概述\n3. 关键要点（使用无序列表）"
        }
    
    async def generate_summary(self, text: str, style: str = None) -> str:
        """
        生成文本摘要
        """
        if style is None:
            style = self.default_style
            
        style_prompt = self.style_configs.get(style)
        if not style_prompt:
            available_styles = list(self.style_configs.keys())
            if available_styles:
                style = available_styles[0]
                style_prompt = self.style_configs[style]
                print(f"警告: 未找到'{style}'风格，使用'{style}'代替")
            else:
                return f"错误: 未找到任何可用的摘要风格"
                
        try:
            llm_client = OpenAI(api_key=self.llm_key, base_url=self.llm_url)
            
            messages = [
                {"role": "system", "content": "你是一个专业的内容摘要助手，擅长以各种风格总结文本。"},
                {"role": "user", "content": f"{style_prompt}\n\n文本内容：\n{text}"}
            ]

            response = llm_client.chat.completions.create(
                model=self.model,
                messages=messages
            )

            content = response.choices[0].message.content

            think_pattern = re.compile(r'</think>(.*)', re.DOTALL)
            match = think_pattern.search(content)
            if match:
                content = match.group(1).strip()
            
            return content
            
        except Exception as e:
            print(f"LLM调用错误: {str(e)}")
            return f"生成摘要时出错: {str(e)}"


async def serve(default_style: str = "标准风格", 
                llm_url: str = "http://localhost:11434/v1", 
                llm_key: str = "ollama", 
                model: str = "qwen2.5"):
    """
    启动摘要服务器
    """
    current_dir = get_project_root()
    config_data_path = os.path.join(current_dir, "chat_mcp", "mcp_server", "mcp_server_summary","config.json")
    server = Server("SummaryServer")
    summary_server = SummaryServer(
        config_path=config_data_path,
        default_style=default_style,
        llm_url=llm_url,
        llm_key=llm_key,
        model=model
    )

    @server.list_resources()
    async def handle_list_resources():
        """列出可用的摘要资源"""
        return [
            {
                "uri": "summary://styles/available",
                "name": "可用摘要风格",
                "description": "获取所有可用的摘要风格列表",
                "mimeType": "application/json",
            }
        ]

    @server.read_resource()
    async def handle_read_resource(uri: str) -> str:
        """读取指定的摘要资源"""
        if uri == "summary://styles/available":
            styles = list(summary_server.style_configs.keys())
            return json.dumps(styles, ensure_ascii=False)
        raise ValueError(f"不支持的URI: {uri}")

    @server.list_tools()
    async def list_tools() -> List[Tool]:
        """列出可用的摘要工具"""
        available_styles = list(summary_server.style_configs.keys())
        
        if not available_styles:
            available_styles = ["标准风格"]
            
        styles_description = "、".join(available_styles)
        
        return [
            Tool(
                name="get_summary",
                description="根据指定风格生成文本摘要",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "需要摘要的文本内容",
                        },
                        "style": {
                            "type": "string",
                            "description": f"摘要风格 (可选值: {styles_description})",
                            "default": available_styles[0] if available_styles else "标准风格"
                        }
                    },
                    "required": ["text"],
                },
            )
        ]

    @server.call_tool()
    async def call_tool(
            name: str, arguments: Dict[str, Any]
    ) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
        """处理工具调用请求"""
        try:
            if name == "get_summary":
                text = arguments.get("text")
                style = arguments.get("style", summary_server.default_style)
                
                if not text:
                    raise ValueError("缺少必要参数: text")
                try:
                    summary = await summary_server.generate_summary(text, style)
                except:
                    print("ollama服务器未启动或者ollama执行出错，使用原始文本")
                    summary=text
                
                return [TextContent(type="text", text=summary)]

            else:
                raise ValueError(f"未知工具: {name}")

        except Exception as e:
            print(f"工具调用出错: {str(e)}")
            error = ErrorData(message=f"摘要服务错误: {str(e)}", code=-32603)
            raise McpError(error)

    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )