import json
import asyncio
import logging
import shutil
from typing import Any, Sequence, Dict, List, Optional
from pathlib import Path
from enum import Enum
from datetime import datetime
from uuid import uuid4

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, ImageContent, EmbeddedResource, ErrorData
from mcp.shared.exceptions import McpError
import requests

from chat_mcp.mcp_server.mcp_server_comfyui.comfyui_api import ComfyuiAPI
from config.config import QUALITY_PROMPTS, URL_PORT, DEFAULT_OUTPUT_DIR

logger = logging.getLogger("ComfyuiServer")

class TaskStatus(Enum):
    PENDING = "pending"          # 任务已创建但未开始
    INITIALIZING = "initializing"  # 正在初始化
    UPLOADING_IMAGE = "uploading_image"  # 上传参考图片
    GENERATING = "generating"    # 正在生成图像
    UPLOADING_RESULT = "uploading_result"  # 上传生成结果
    COMPLETED = "completed"      # 任务完成
    FAILED = "failed"           # 任务失败
    STOPPED = "stopped"         # 任务被手动停止
    ERROR = "error"            # 发生错误

class ComfyuiServer:
    """
    图像生成MCP服务器类，集成ComfyUI图像生成功能和MCP协议支持，并支持进度报告
    """
    def __init__(self, server_url: str = "127.0.0.1:8188"):
        """
        初始化图像生成MCP服务器
        
        Args:
            server_url: ComfyUI服务器URL
        """
        self.server_url = server_url
        self.comfyui_api = ComfyuiAPI(server_url=server_url)
        self.tasks = {} 
        self.user_task = {}
        self.server = Server("ImageGeneratorServer")

        self._setup_server_handlers()
        
    def _setup_server_handlers(self):
        """设置MCP服务器的处理函数"""


        @self.server.list_resources()
        async def handle_list_resources():
            """列出可用的图像生成资源"""
            return [
                {
                    "uri": "image-generator://comfyui/models",
                    "name": "ComfyUI模型列表",
                    "description": "获取可用的ComfyUI模型列表",
                    "mimeType": "application/json",
                },
                {
                    "uri": "image-generator://comfyui/workflows",
                    "name": "ComfyUI工作流",
                    "description": "获取可用的ComfyUI工作流类型",
                    "mimeType": "application/json",
                }
            ]

        @self.server.read_resource()
        async def handle_read_resource(uri: str) -> str:
            """读取指定的图像生成资源"""
            if uri == "image-generator://comfyui/models":
                models = self.comfyui_api.get_models()
                return json.dumps({"models": models}, ensure_ascii=False)
            elif uri == "image-generator://comfyui/workflows":
                workflows = self.comfyui_api.get_type_mode(str(Path("config") / "workflow_json.xlsx"))
                return json.dumps({"workflows": workflows}, ensure_ascii=False)
            else:
                raise ValueError(f"不支持的URI: {uri}")

        @self.server.list_tools()
        async def list_tools() -> List[Tool]:
            """列出可用的图像生成工具"""
            # 获取可用的任务类型
            type_modes = self.comfyui_api.get_type_mode(str(Path("config") / "workflow_json.xlsx"))
            type_modes_str = ", ".join(type_modes) if type_modes else "基础文生图"
            
            # 获取可用的模型
            models = self.comfyui_api.get_models()
            models_str = ", ".join(models) if models else "未找到模型"
            
            return [
                Tool(
                    name="generate_image",
                    description=f"基于文本提示生成图像。支持的模式: {type_modes_str}。可用模型: {models_str}",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "prompt": {
                                "type": "string",
                                "description": "用于生成图像的文本描述",
                            },
                            "task_mode": {
                                "type": "string",
                                "description": f"生成模式，可选值: {type_modes_str}",
                            },
                            "model_name": {
                                "type": "string",
                                "description": "要使用的模型名称",
                            },
                            "width": {
                                "type": "integer",
                                "description": "生成图像的宽度，默认512",
                            },
                            "height": {
                                "type": "integer", 
                                "description": "生成图像的高度，默认768",
                            },
                            "negative_prompt": {
                                "type": "string",
                                "description": "负面提示词，描述不希望在图像中出现的内容",
                            },
                            "wait_for_result": {
                                "type": "boolean",
                                "description": "是否等待生成完成后才返回结果，默认为false",
                            }
                        },
                        "required": ["prompt"],
                    },
                ),
                Tool(
                    name="get_image_progress",
                    description="获取图像生成任务的进度信息",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "task_id": {
                                "type": "string",
                                "description": "任务ID",
                            }
                        },
                        "required": ["task_id"],
                    },
                )
            ]

        @self.server.call_tool()
        async def call_tool(
                name: str, arguments: Dict[str, Any]
        ) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
            """处理工具调用请求"""
            try:
                if name == "generate_image":
                    prompt = arguments.get("prompt")
                    if not prompt:
                        raise ValueError("缺少必要参数: prompt")

                    user_id = arguments.get("user_id", "default_user")
                    task_id = self.create_task(user_id, {
                        "parameters": arguments,
                        "progress": 0,
                        "total_steps": 0,
                        "current_step": 0
                    })
                    
                    wait_for_result = arguments.get("wait_for_result", False)
                    
                    asyncio.create_task(self.handle_image_generation(task_id, arguments))
                    
                    if not wait_for_result:
                        # 如果不等待结果，直接返回任务已提交的消息
                        return [TextContent(
                            type="text", 
                            text=f"图像生成任务已提交，任务ID: {task_id}。生成过程需要一些时间，请稍候。"
                        )]
                    
                    timeout = 300
                    start_time = asyncio.get_event_loop().time()
                    
                    while True:
                        current_time = asyncio.get_event_loop().time()
                        if current_time - start_time > timeout:
                            return [TextContent(
                                type="text", 
                                text=f"图像生成任务 {task_id} 超时，请稍后询问结果。"
                            )]
                        
                        task_status = self.get_task_status(task_id)
                        if not task_status:
                            return [TextContent(type="text", text=f"未找到任务ID: {task_id}")]

                        status = task_status.get("status")
                        if status in [TaskStatus.COMPLETED.value, TaskStatus.FAILED.value, 
                                    TaskStatus.ERROR.value, TaskStatus.STOPPED.value]:
                            break
                        
                        await asyncio.sleep(2)
                    
                    final_status = self.get_task_status(task_id)
                    
                    progress_info = ""
                    if final_status.get("status") == TaskStatus.GENERATING.value:
                        progress = final_status.get("progress", 0)
                        current_step = final_status.get("current_step", 0)
                        total_steps = final_status.get("total_steps", 0)
                        
                        if total_steps > 0:
                            progress_info = f"\n进度: {progress:.1f}% ({current_step}/{total_steps}步)"
                    
                    response = f"任务ID: {task_id}\n状态: {final_status['status']}\n消息: {final_status['message']}{progress_info}"
                    
                    if final_status.get("status") == TaskStatus.COMPLETED.value and final_status.get("image_urls"):
                        response += f"\n图像已生成完成！\n生成的图像URL:\n" + "\n".join(final_status.get("image_urls", []))
                    
                    return [TextContent(type="text", text=response)]
                elif name == "get_image_progress":
                    task_id = arguments.get("task_id")
                    if not task_id:
                        raise ValueError("缺少必要参数: task_id")
                    
                    task_status = self.get_task_status(task_id)
                    if not task_status:
                        return [TextContent(type="text", text=f"未找到任务ID: {task_id}")]
                    
                    status = task_status.get("status")
                    message = task_status.get("message", "无消息")
                    

                    progress_info = ""
                    if status == TaskStatus.GENERATING.value:
                        progress = task_status.get("progress", 0)
                        current_step = task_status.get("current_step", 0)
                        total_steps = task_status.get("total_steps", 0)
                        
                        if total_steps > 0:
                            progress_info = f"\n进度: {progress:.1f}% ({current_step}/{total_steps}步)"
                    
                    response = f"任务ID: {task_id}\n状态: {status}\n消息: {message}{progress_info}"
                    
                    if status == TaskStatus.COMPLETED.value and task_status.get("image_urls"):
                        response += f"\n生成的图像URL:\n" + "\n".join(task_status.get("image_urls", []))
                    
                    return [TextContent(type="text", text=response)]

                else:
                    raise ValueError(f"未知工具: {name}")

            except Exception as e:
                logger.error(f"工具调用出错: {str(e)}")
                error = ErrorData(message=f"图像生成服务错误: {str(e)}", code=-32603)
                raise McpError(error)

    def create_task(self, user_id: str, initial_data: Dict[str, Any] = None) -> str:
        """创建新任务"""
        if user_id in self.user_task:
            old_task_id = self.user_task[user_id]
            self.stop_task(old_task_id)

        task_id = str(uuid4())
        task_info = {
            "status": TaskStatus.PENDING.value,
            "message": "任务已提交，等待处理",
            "running": True,
            "user_id": user_id,
            "image_paths": None,
            "file_ids": None,
            "image_urls": None,
            "reference_image": None,
            "created_at": datetime.now().isoformat(),
            **(initial_data or {})
        }

        self.tasks[task_id] = task_info
        self.user_task[user_id] = task_id
        return task_id

    def update_task_status(self, task_id: str, status: TaskStatus, message: str = None, **kwargs):
        """更新任务状态"""
        if task_id in self.tasks:
            self.tasks[task_id]["status"] = status.value
            if message:
                self.tasks[task_id]["message"] = message
            self.tasks[task_id].update(kwargs)

    def stop_task(self, task_id: str) -> bool:
        """停止任务"""
        if task_id in self.tasks:
            self.tasks[task_id]["running"] = False
            self.tasks[task_id]["status"] = TaskStatus.STOPPED.value
            self.tasks[task_id]["message"] = "任务已手动停止"
            return True
        return False

    def is_running(self, task_id: str) -> bool:
        """检查任务是否在运行"""
        return self.tasks.get(task_id, {}).get("running", False)

    def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取任务状态"""
        return self.tasks.get(task_id)

    def remove_task(self, task_id: str):
        """移除任务"""
        if task_id in self.tasks:
            user_id = self.tasks[task_id].get("user_id")
            if user_id and self.user_task.get(user_id) == task_id:
                del self.user_task[user_id]
            del self.tasks[task_id]

    async def monitor_progress(self, task_id: str):
        """监控生成进度的异步函数"""
        try:
            if not self.is_running(task_id):
                return
            
            prompt_id = self.comfyui_api.current_prompt_id
            if not prompt_id:
                logger.error("无法获取 prompt_id，无法监控进度")
                return
            last_progress = -1

            while self.is_running(task_id):
                try:
                    response = requests.get(
                        f"http://{self.server_url}/history/{prompt_id}",
                        timeout=5
                    )
                    
                    if response.ok:
                        data = response.json()
                        
                        if prompt_id in data:
                            prompt_data = data[prompt_id]
                            
                            for node_id, node_data in prompt_data.get("outputs", {}).items():
                                if "progress" in node_data:
                                    progress_info = node_data["progress"]
                                    current_step = progress_info.get("step", 0)
                                    total_steps = progress_info.get("max_steps", 0)
                                    
                                    if total_steps > 0:
                                        progress_percent = (current_step / total_steps) * 100
                                        
                                        if abs(progress_percent - last_progress) >= 1:
                                            last_progress = progress_percent
                                            self.update_task_status(
                                                task_id,
                                                TaskStatus.GENERATING,
                                                f"正在生成图像 (步骤 {current_step}/{total_steps})",
                                                progress=progress_percent,
                                                current_step=current_step,
                                                total_steps=total_steps
                                            )
                                    break
                
                except Exception as e:
                    logger.error(f"获取进度信息失败: {str(e)}")

                await asyncio.sleep(0.5)
        
        except Exception as e:
            logger.error(f"监控进度时出错: {str(e)}")

    async def handle_image_generation(self, task_id: str, arguments: Dict[str, Any]):
        """异步处理图像生成任务"""
        try:
            from pathlib import Path
            import os
            
            self.update_task_status(
                task_id, 
                TaskStatus.INITIALIZING, 
                "正在初始化图像生成任务"
            )
            
            prompt = arguments.get("prompt", "")

            user_task_mode = arguments.get("task_mode")
            user_model_name = arguments.get("model_name")
            negative_prompt = arguments.get("negative_prompt", "")
            width = arguments.get("width", 512)
            height = arguments.get("height", 768)
            
            # TODO  可以选择增加一个优化提示词的代码

            self.update_task_status(
                task_id, 
                TaskStatus.GENERATING, 
                "正在生成图像"
            )
            
            def check_task_status():
                return not self.is_running(task_id)
            
            params = {
                "task_mode": user_task_mode,
                "model_name": user_model_name,
                "prompt_text": prompt + QUALITY_PROMPTS,
                "negative_prompt_text": negative_prompt,
                "width": width,
                "height": height,
                "check_stop": check_task_status
            }

            monitor_task = asyncio.create_task(self.monitor_progress(task_id))
            
            img_paths = await self.comfyui_api.run(**params)
            
            monitor_task.cancel()
            
            if img_paths:
                output_dir = Path(DEFAULT_OUTPUT_DIR)
                output_dir.mkdir(exist_ok=True, parents=True)
                
                image_urls = []
                static_img_paths = []
                
                for img_path in img_paths:
                    src_path = Path(img_path)
                    if not src_path.exists():
                        logger.warning(f"源图像不存在: {img_path}")
                        continue
                        
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    safe_name = src_path.name.replace(" ", "_")
                    filename = f"image_{timestamp}_{safe_name}"
                    dest_path = output_dir / filename
                    
                    try:
                        shutil.copy2(src_path, dest_path)
                        static_img_paths.append(str(dest_path))
                        
                        image_url = f"http://localhost:{URL_PORT}/static/{filename}"
                        image_urls.append(image_url)
                        
                        try:
                            os.remove(src_path)
                            logger.info(f"已删除原始图像文件: {img_path}")
                        except Exception as delete_err:
                            logger.warning(f"删除原始图像文件失败: {delete_err}")
                            
                    except Exception as e:
                        logger.error(f"复制图像文件失败: {str(e)}")
                
                self.update_task_status(
                    task_id, 
                    TaskStatus.COMPLETED, 
                    "图像生成完成",
                    static_image_paths=static_img_paths,
                    image_urls=image_urls
                )
            else:
                if not self.is_running(task_id):
                    self.update_task_status(
                        task_id, 
                        TaskStatus.STOPPED, 
                        "任务已被手动停止"
                    )
                else:
                    self.update_task_status(
                        task_id, 
                        TaskStatus.FAILED, 
                        "图像生成失败"
                    )
                    
        except Exception as e:
            logger.error(f"图像生成过程出错: {str(e)}")
            self.update_task_status(
                task_id, 
                TaskStatus.ERROR, 
                f"处理过程中出错: {str(e)}"
            )

    async def run_server(self):
        """运行MCP服务器"""
        async with stdio_server() as (read_stream, write_stream):
            await self.server.run(
                read_stream,
                write_stream,
                self.server.create_initialization_options(),
            )