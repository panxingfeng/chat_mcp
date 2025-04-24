class ToolCallError(Exception):
    """工具调用相关错误的基类"""

    def __init__(self, message: str, tool_name: str = None, error_code: int = None):
        self.tool_name = tool_name
        self.error_code = error_code
        self.message = message
        super().__init__(self._format_message())

    def _format_message(self) -> str:
        """格式化错误消息"""
        if self.tool_name:
            return f"[工具{self.tool_name}]: {self.message}"
        return self.message

    def to_dict(self) -> dict:
        """转换为字典格式，便于日志记录和API返回"""
        result = {
            "error_type": self.__class__.__name__,
            "message": self.message
        }
        if self.tool_name:
            result["tool_name"] = self.tool_name
        if self.error_code:
            result["error_code"] = self.error_code
        return result


class ToolExecutionError(ToolCallError):
    """工具执行错误"""

    def __init__(self, tool_name: str, message: str, is_timeout: bool = False, is_recoverable: bool = False):
        self.is_timeout = is_timeout
        self.is_recoverable = is_recoverable

        error_code = 408 if is_timeout else 500

        if is_timeout:
            detailed_message = f"执行超时: {message}"
        else:
            detailed_message = f"执行失败: {message}"

        super().__init__(message=detailed_message, tool_name=tool_name, error_code=error_code)

    def to_dict(self) -> dict:
        result = super().to_dict()
        result["is_timeout"] = self.is_timeout
        result["is_recoverable"] = self.is_recoverable
        return result