import json

from openai import OpenAI

from chat_mcp.client.conversation_state import ConversationExecutor
from chat_mcp.client.tool_manager import ToolManager
from chat_mcp.utils.get_logger import get_logger

logger = get_logger("MCPClient")

class MCPClient:
    """MCP客户端，用于处理用户问题并执行相应工具"""
    def __init__(self,
                 server_config_path: str,
                 model: str = "qwen2.5",
                 api_key: str = "ollama",
                 base_url: str = "http://localhost:11434/v1/",
                 max_tool_calls: int = 10,
                 tool_execution_timeout: int = 120,
                 similarity_threshold: float = 0.7):
        """
        初始化MCP客户端
        """
        self.model = model
        self.api_key = api_key
        self.base_url = base_url
        self.server_config_path = server_config_path
        self.llm_client = None
        self.max_tool_calls = max_tool_calls
        self.tool_execution_timeout = tool_execution_timeout
        self.similarity_threshold = similarity_threshold
        self._config_loaded = False
        self._config = None

        self.tool_manager = None
        self.conversation_executor = None

    async def initialize(self):
        """初始化客户端、服务器和工具"""
        try:
            await self._load_config()

            self.tool_manager = ToolManager(similarity_threshold=self.similarity_threshold)
            await self.tool_manager.initialize_servers(self._get_config())
            await self.tool_manager.collect_tools()

            return True
        except Exception as e:
            logger.error(f"初始化客户端失败: {str(e)}", exc_info=True)
            await self.cleanup()
            return False

    async def _load_config(self):
        """加载配置文件"""
        try:
            with open(self.server_config_path, 'r', encoding='utf-8') as f:
                self._config = json.load(f)
            self._config_loaded = True
            logger.info(f"成功加载配置文件: {self.server_config_path}")
        except json.JSONDecodeError as e:
            logger.error(f"配置文件JSON格式错误: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"加载配置文件失败: {str(e)}")
            raise

    def _get_config(self):
        """获取配置信息"""
        if not self._config_loaded:
            raise RuntimeError("配置未加载")
        return self._config

    async def process_query_stream(self,
                                   user_query: str,
                                   system_prompt: str,
                                   temperature,
                                   history_message,
                                   api_key=None,
                                   base_url=None,
                                   model=None):
        """
        流式处理用户查询
        """
        if not self.tool_manager or not self.tool_manager.all_tools:
            raise RuntimeError("客户端未初始化，请先调用 initialize()")
        
        self.api_key = api_key if api_key is not None else self.api_key
        self.base_url = base_url if base_url is not None else self.base_url
        self.model = model if model is not None else self.model

        logger.info(
            f"使用参数 - model: {self.model}, api_key: {'已设置' if self.api_key else '未设置'}, base_url: {self.base_url}")

        if not self.api_key:
            error_msg = "错误: API密钥未设置"
            logger.error(error_msg)
            yield error_msg
            return

        if not self.base_url:
            error_msg = "错误: API基础URL未设置"
            logger.error(error_msg)
            yield error_msg
            return

        if not self.model:
            error_msg = "错误: 模型名称未设置"
            logger.error(error_msg)
            yield error_msg
            return

        try:
            self.llm_client = OpenAI(api_key=self.api_key, base_url=self.base_url)
            logger.info(f"已创建LLM客户端，base_url: {self.base_url}")

            self.conversation_executor = ConversationExecutor(
                llm_client=self.llm_client,
                tool_manager=self.tool_manager,
                model=self.model,
                max_tool_calls=self.max_tool_calls,
                tool_execution_timeout=self.tool_execution_timeout
            )
            logger.info(f"已创建对话执行器，使用模型: {self.model}")

            async for chunk in self.conversation_executor.process_query_stream(user_query, system_prompt,temperature,history_message):
                yield chunk
        except Exception as e:
            error_msg = f"处理查询出错: {str(e)}"
            logger.error(error_msg, exc_info=True)
            yield error_msg

    def get_tools_json(self):
        """
        获取JSON格式的工具信息，适用于前端展示
        """
        if not self.tool_manager:
            raise RuntimeError("客户端未初始化，请先调用 initialize()")

        return self.tool_manager.get_tools_json()

    async def tool_test(self, tool_name: str, api_key=None, base_url=None, model=None, **kwargs):
        """
        测试单个工具
        """
        if not self.tool_manager:
            raise RuntimeError("客户端未初始化，请先调用 initialize()")

        if api_key is not None:
            self.api_key = api_key
        if base_url is not None:
            self.base_url = base_url
        if model is not None:
            self.model = model

        llm_client = OpenAI(api_key=self.api_key, base_url=self.base_url)

        temp_executor = ConversationExecutor(
            llm_client=llm_client,
            tool_manager=self.tool_manager,
            model=self.model,
            max_tool_calls=self.max_tool_calls,
            tool_execution_timeout=self.tool_execution_timeout
        )

        return await temp_executor.tool_test(tool_name, **kwargs)

    async def cleanup(self):
        """清理客户端资源"""
        try:
            if self.tool_manager:
                await self.tool_manager.close_servers()

            self.llm_client = None
            self.tool_manager = None
            self.conversation_executor = None

            logger.info("MCPClient 资源清理完成")
        except Exception as e:
            logger.error(f"清理资源时出错: {str(e)}", exc_info=True)

_mcp_client_instance = None

def get_mcp_client(server_config_path: str = "servers_config.json", **kwargs):
    """获取MCP客户端单例"""
    global _mcp_client_instance
    if _mcp_client_instance is None:
        _mcp_client_instance = MCPClient(server_config_path, **kwargs)

    return _mcp_client_instance


mcp_client = get_mcp_client()