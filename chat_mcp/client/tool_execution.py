import json
import asyncio
import logging
from typing import Dict, Any

from ..error.tool_error import ToolExecutionError
from ..utils.get_logger import get_logger

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
                raise ToolExecutionError(
                    tool_name=tool_name,
                    message=f"无效的工具对象"
                )

            # 检查工具对象结构，支持不同格式的工具对象
            if "server" in tool:
                # 从 tool_manager.py 获取的工具格式
                if "session" not in tool["server"]:
                    raise ToolExecutionError(
                        tool_name=tool_name,
                        message=f"工具服务器对象缺少session字段"
                    )
                
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
                        raise ToolExecutionError(
                            tool_name=tool_name,
                            message=f"执行错误: {str(e)}",
                            is_timeout=False,
                            is_recoverable=False
                        )
            elif "execute" in tool:
                # 直接包含execute方法的工具格式
                async with asyncio.timeout(self.tool_execution_timeout):
                    try:
                        result = await tool["execute"](tool_args)
                        result_str = self._convert_result_to_string(result)
                        logging.info(f"工具 {tool_name} 执行成功, 结果长度: {len(result_str)}")
                        return result_str
                    except Exception as e:
                        logging.error(f"工具执行期间发生错误: {str(e)}", exc_info=True)
                        raise ToolExecutionError(
                            tool_name=tool_name,
                            message=f"执行错误: {str(e)}",
                            is_timeout=False,
                            is_recoverable=False
                        )
            elif "function" in tool:
                # 处理从工具选择器获取的工具格式
                if "server" in tool and "session" in tool["server"]:
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
                            raise ToolExecutionError(
                                tool_name=tool_name,
                                message=f"执行错误: {str(e)}",
                                is_timeout=False,
                                is_recoverable=False
                            )
                else:
                    raise ToolExecutionError(
                        tool_name=tool_name,
                        message="工具对象缺少server字段或会话对象"
                    )
            else:
                # 无法识别的工具格式
                raise ToolExecutionError(
                    tool_name=tool_name,
                    message="不支持的工具格式，缺少execute方法或server字段"
                )
                
        except asyncio.TimeoutError:
            logging.error(f"工具 {tool_name} 执行超时")
            raise ToolExecutionError(
                tool_name=tool_name,
                message=f"工具执行超时(>{self.tool_execution_timeout}秒)",
                is_timeout=True,
                is_recoverable=True
            )
        except ToolExecutionError:
            # 重新抛出已经格式化的工具执行错误
            raise
        except Exception as e:
            logging.error(f"执行工具 {tool_name} 时出错: {str(e)}", exc_info=True)
            raise ToolExecutionError(
                tool_name=tool_name,
                message=f"执行出错: {str(e)}",
                is_timeout=False,
                is_recoverable=False
            )
            
    def _convert_result_to_string(self, result: Any) -> str:
        """
        将结果转换为字符串
        
        参数:
            result: 工具执行结果
            
        返回:
            结果字符串
        """
        if result is None:
            return "执行完成，但没有返回结果"
            
        if isinstance(result, str):
            return result
            
        if isinstance(result, (dict, list)):
            try:
                return json.dumps(result, ensure_ascii=False, indent=2)
            except Exception as e:
                logger.error(f"JSON序列化失败: {str(e)}")
                return str(result)
                
        return str(result)