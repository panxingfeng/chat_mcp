"""
错误处理模块，包含工具调用相关错误类
"""

from .tool_error import (
    ToolCallError,
    ToolExecutionError
)

__all__ = [
    'ToolCallError',
    'ToolExecutionError'
]