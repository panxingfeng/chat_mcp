import json
import asyncio
import logging
from typing import Dict, Any

from ..error.tool_error import ToolExecutionError
from ..utils.get_logger import get_logger

# 配置日志
logger = get_logger("ToolExecutor")

class ToolExecutor:
    """工具执行器，负责工具的执行和结果处理"""
    def __init__(self, tool_execution_timeout: int = 30):
        """
        初始化工具执行器
        """
        self.tool_execution_timeout = tool_execution_timeout

    async def execute_tool(self, tool: Dict[str, Any], tool_name: str, tool_args: Dict[str, Any]) -> str:
        """执行工具并返回结果"""
        try:
            logging.debug(f"开始执行工具 {tool_name}，参数: {json.dumps(tool_args, ensure_ascii=False)}")

            if not tool:
                raise ValueError(f"无效的工具对象: {tool}")

            if "server" not in tool:
                raise ValueError(f"工具对象缺少server字段: {json.dumps(tool, ensure_ascii=False)}")

            if "session" not in tool["server"]:
                raise ValueError(f"工具服务器对象缺少session字段: {json.dumps(tool['server'], ensure_ascii=False)}")

            async with asyncio.timeout(self.tool_execution_timeout):
                try:
                    logging.debug(f"调用工具 {tool_name} 的会话对象: {tool['server']['session']}")

                    result = await tool["server"]["session"].call_tool(tool_name, tool_args)
                    result_str = str(result)

                    if not result_str or result_str.strip() == "" or result_str == "None":
                        logging.warning(f"工具 {tool_name} 执行结果为空")
                        return f"注意: 工具 {tool_name} 返回了空结果"

                    logging.info(f"工具 {tool_name} 执行成功")
                    return result_str
                except Exception as e:
                    logging.error(f"工具执行期间发生错误: {str(e)}", exc_info=True)
                    raise
        except asyncio.TimeoutError:
            logging.error(f"工具 {tool_name} 执行超时")
            raise ToolExecutionError(
                tool_name=tool_name,
                message=f"工具执行超时(>{self.tool_execution_timeout}秒)",
                is_timeout=True,
                is_recoverable=True
            )
        except Exception as e:
            logging.error(f"执行工具 {tool_name} 时出错: {str(e)}", exc_info=True)
            raise ToolExecutionError(
                tool_name=tool_name,
                message=f"执行出错: {str(e)}",
                is_timeout=False,
                is_recoverable=False
            )
