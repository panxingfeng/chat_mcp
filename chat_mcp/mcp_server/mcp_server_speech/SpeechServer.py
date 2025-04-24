import os
import asyncio
import shutil
import json
from datetime import datetime
from typing import Dict, Any, Sequence, List

from mcp import ErrorData
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, ImageContent, EmbeddedResource
from mcp.shared.exceptions import McpError
from gradio_client import Client, handle_file

from config.config import CHARACTER_AUDIO_MAP, CURRENT_DIR, DEFAULT_OUTPUT_DIR, DEFAULT_SERVER_URL, URL_PORT
from chat_mcp.utils.get_logger import get_logger

_client = None

OUTPUT_DIR = os.path.join(CURRENT_DIR, DEFAULT_OUTPUT_DIR)
os.makedirs(OUTPUT_DIR, exist_ok=True)

class AudioGenerator:
    def __init__(self, server_url: str = None) -> None:
        """初始化音频生成器
        """
        self.server_url = server_url or DEFAULT_SERVER_URL
        self.logger = get_logger(service="AudioGenerator")

    async def init_client(self) -> Client | None:
        """初始化Gradio客户端"""
        global _client

        if _client is None:
            try:
                import sys
                original_stdout = sys.stdout

                class NullOutput:
                    def write(self, *args, **kwargs):
                        pass

                    def flush(self):
                        pass

                try:
                    sys.stdout = NullOutput()
                    _client = Client(self.server_url)
                finally:
                    sys.stdout = original_stdout

                try:
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(None, lambda: _client.predict(api_name="/update_prompt_audio"))
                except Exception as e:
                    print(f"初始化音频提示时出错: {e}")
            except Exception as e:
                print(f"创建Gradio客户端失败: {e}")
                raise

        return _client

    async def process_audio(self, audio_file_path: str, text_prompt: str) -> Dict[str, Any]:
        """处理音频生成过程"""
        try:
            client = await self.init_client()

            if not os.path.exists(audio_file_path):
                print(f"错误: 文件不存在 - {audio_file_path}")
                return {"success": False, "error": f"找不到音频文件: {audio_file_path}"}

            try:
                audio_file = handle_file(audio_file_path)

                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None,
                    lambda: client.predict(
                        prompt=audio_file,
                        text=text_prompt,
                        api_name="/gen_single"
                    )
                )

                if isinstance(result, dict) and 'value' in result:
                    temp_file_path = result['value']
                else:
                    temp_file_path = result

                if not os.path.exists(temp_file_path):
                    print(f"错误: 生成的临时文件不存在: {temp_file_path}")
                    return {"success": False, "error": f"生成的临时文件不存在: {temp_file_path}"}

                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                file_ext = os.path.splitext(temp_file_path)[1]
                output_filename = f"audio_{timestamp}{file_ext}"
                output_path = os.path.join(OUTPUT_DIR, output_filename)

                shutil.copy2(temp_file_path, output_path)

                try:
                    os.remove(temp_file_path)
                except Exception as e:
                    print(f"删除临时文件时出错 (非致命): {e}")

                return {"success": True, "output_path": output_path, "file_name": output_filename}

            except Exception as e:
                print(f"处理音频过程中出错: {str(e)}")
                import traceback
                traceback.print_exc()
                return {"success": False, "error": f"处理音频时出错: {str(e)}"}

        except Exception as e:
            print(f"整体处理过程中出错: {str(e)}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": f"生成音频时出错: {str(e)}"}

    async def generate_audio(self, speech_character: str, text_prompt: str) -> str:
        """
        使用指定角色音色生成音频
        """
        audio_file_path = CHARACTER_AUDIO_MAP.get(speech_character)

        if not audio_file_path:
            error_msg = f"错误：不支持的角色音色 '{speech_character}'，当前支持: {', '.join(CHARACTER_AUDIO_MAP.keys())}"
            print(error_msg)
            return error_msg
        if not os.path.exists(audio_file_path):
            error_msg = f"错误：音频文件不存在: {audio_file_path}"
            print(error_msg)
            return error_msg
        result = await self.process_audio(audio_file_path, text_prompt)

        if result["success"]:
            success_msg = f"音频url地址:http://localhost:{URL_PORT}/static/{result['file_name']}"
            return success_msg
        else:
            error_msg = f"音频生成失败: {result['error']}"
            print(error_msg)
            return error_msg


async def serve(server_url: str = None):
    """启动音频生成服务器"""
    server = Server("AudioGeneratorServer")
    audio_generator = AudioGenerator(server_url=server_url)

    @server.list_resources()
    async def handle_list_resources():
        """列出可用的音频资源"""
        return [
            {
                "uri": f"audio://{character}/generate",
                "name": f"{character}音色",
                "description": f"使用{character}的音色生成语音",
                "mimeType": "audio/wav",
            }
            for character in CHARACTER_AUDIO_MAP.keys()
        ]

    @server.read_resource()
    async def handle_read_resource(uri: str) -> str:
        """读取指定的音频资源"""
        if uri.startswith("audio://"):
            return json.dumps({"message": "此功能暂未实现"}, ensure_ascii=False)
        raise ValueError(f"不支持的URI: {uri}")

    @server.list_tools()
    async def list_tools() -> List[Tool]:
        """列出可用的音频生成工具"""
        return [
            Tool(
                name="generate_audio",
                description="使用指定角色音色生成音频",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "speech_character": {
                            "type": "string",
                            "description": f"音色角色名称，目前支持: {', '.join(CHARACTER_AUDIO_MAP.keys())}",
                        },
                        "text_prompt": {
                            "type": "string",
                            "description": "要生成的文本内容",
                        }
                    },
                    "required": ["speech_character", "text_prompt"],
                },
            )
        ]

    @server.call_tool()
    async def call_tool(
            name: str, arguments: Dict[str, Any]
    ) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
        """处理工具调用请求"""
        try:
            if name == "generate_audio":
                speech_character = arguments.get("speech_character")
                text_prompt = arguments.get("text_prompt")

                if not speech_character or not text_prompt:
                    raise ValueError("缺少必要参数: speech_character 或 text_prompt")

                result = await audio_generator.generate_audio(speech_character, text_prompt)
                return [TextContent(type="text", text=result)]
            else:
                raise ValueError(f"未知工具: {name}")

        except Exception as e:
            print(f"工具调用出错: {str(e)}")
            import traceback
            traceback.print_exc()
            error = ErrorData(message=f"音频生成服务错误: {str(e)}",code=-32603)
            raise McpError(error)

    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )