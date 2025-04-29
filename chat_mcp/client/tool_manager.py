import os
import re
import shutil
import asyncio
from typing import Dict, Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from ..utils.get_logger import get_logger

logging = get_logger("ToolManager")


class ToolManager:
    """工具管理器，负责工具的初始化、收集和查找"""

    def __init__(self, similarity_threshold: float = 0.7):
        """
        初始化工具管理器
        """
        self.servers = []
        self.all_tools = []
        self.grouped_tools = {}
        self.similarity_threshold = similarity_threshold
        self._tool_name_cache = {}
        self._tool_name_index = {}

    async def initialize_server(self, name: str, config: Dict[str, Any]):
        """
        初始化单个服务器
        """
        try:
            env = os.environ.copy()
            if config.get('env'):
                env.update(config['env'])

            command = shutil.which("npx") if config['command'] == "npx" else config['command']
            if not command:
                logging.error(f"找不到命令: {config['command']}")
                return None

            server_params = StdioServerParameters(
                command=command,
                args=config['args'],
                env=env
            )

            try:
                async with asyncio.timeout(30):  # 30秒超时
                    stdio_context = stdio_client(server_params)
                    read, write = await stdio_context.__aenter__()
                    session = ClientSession(read, write)
                    await session.__aenter__()
                    capabilities = await session.initialize()

                    logging.info(f"服务器 {name} 初始化成功")

                    return {
                        "name": name,
                        "session": session,
                        "stdio_context": stdio_context,
                        "capabilities": capabilities,
                        "config": config
                    }
            except asyncio.TimeoutError:
                logging.error(f"初始化服务器 {name} 超时")
                return None

        except Exception as e:
            logging.error(f"初始化服务器 {name} 出错: {e}", exc_info=True)
            return None

    async def initialize_servers(self, config: Dict[str, Any]):
        """
        初始化所有服务器
        """
        self.servers = []
        initialization_tasks = []

        for name, server_config in config['mcpServers'].items():
            initialization_tasks.append(self.initialize_server(name, server_config))

        servers = await asyncio.gather(*initialization_tasks, return_exceptions=True)

        self.servers = [server for server in servers if server and not isinstance(server, Exception)]

        if not self.servers:
            logging.warning("没有任何服务器成功初始化")

        return self.servers

    async def collect_tools(self):
        """
        收集所有可用工具，并按服务器分组
        """
        self.all_tools = []
        self.grouped_tools = {}
        collection_tasks = []

        for server in self.servers:
            collection_tasks.append(self._collect_server_tools(server))

        server_tools_list = await asyncio.gather(*collection_tasks, return_exceptions=True)

        for i, server_tools in enumerate(server_tools_list):
            if isinstance(server_tools, list) and server_tools:
                server_name = self.servers[i]["name"]
                self.all_tools.extend(server_tools)

                self.grouped_tools[server_name] = server_tools

        unique_tools = {}
        grouped_unique_tools = {}

        for tool in self.all_tools:
            tool_name = tool["name"]
            if tool_name not in unique_tools:
                unique_tools[tool_name] = tool
            else:
                logging.warning(f"发现重复工具 '{tool_name}'，保留先前添加的版本")

        self.all_tools = list(unique_tools.values())

        for server_name, tools in self.grouped_tools.items():
            grouped_unique_tools[server_name] = [
                tool for tool in tools
                if tool["name"] in unique_tools and unique_tools[tool["name"]] == tool
            ]

        self.grouped_tools = grouped_unique_tools

        for server_name, tools in self.grouped_tools.items():
            logging.info(f"服务器 {server_name} 注册了 {len(tools)} 个有效工具")

        logging.info(f"成功收集总计 {len(self.all_tools)} 个工具，来自 {len(self.grouped_tools)} 个服务器")

        self._build_tool_name_index()

        return len(self.all_tools)

    async def _collect_server_tools(self, server):
        """
        从单个服务器收集工具
        """
        server_tools = []
        try:
            async with asyncio.timeout(20):
                tools_response = await server["session"].list_tools()

                for item in tools_response:
                    if isinstance(item, tuple) and item[0] == 'tools':
                        for tool in item[1]:
                            server_tools.append({
                                "name": tool.name,
                                "description": tool.description,
                                "inputSchema": tool.inputSchema,
                                "server": server
                            })

                return server_tools
        except asyncio.TimeoutError:
            logging.error(f"从服务器 {server['name']} 获取工具超时")
            return []
        except Exception as e:
            logging.error(f"从服务器 {server['name']} 获取工具失败: {e}", exc_info=True)
            return []

    def _build_tool_name_index(self):
        """构建工具名称查找索引，用于模糊匹配"""
        self._tool_name_index = {}
        for tool in self.all_tools:
            name = tool["name"].lower()
            self._tool_name_index[name] = tool["name"]

            parts = re.split(r'[_\-.]', name)
            for part in parts:
                if part and len(part) > 3:
                    if part not in self._tool_name_index:
                        self._tool_name_index[part] = tool["name"]

    def get_tools_json(self):
        """
        获取JSON格式的工具信息
        """
        result = {
            "groups": []
        }

        for server_name, tools in self.grouped_tools.items():
            group = {
                "name": server_name,
                "display_name": server_name,
                "tools": []
            }

            for tool in tools:
                tool_info = {
                    "name": tool['name'],
                    "description": tool['description'],
                    "args": []
                }

                if 'properties' in tool['inputSchema']:
                    for param_name, param_info in tool['inputSchema']['properties'].items():
                        arg_info = {
                            "name": param_name,
                            "description": param_info.get('description', '无描述'),
                            "required": param_name in tool['inputSchema'].get('required', [])
                        }
                        tool_info["args"].append(arg_info)

                group["tools"].append(tool_info)

            if group["tools"]:
                result["groups"].append(group)

        result["tools"] = []
        for tool in self.all_tools:
            tool_info = {
                "name": tool['name'],
                "description": tool['description'],
                "server": tool['server']['name'],
                "args": []
            }

            if 'properties' in tool['inputSchema']:
                for param_name, param_info in tool['inputSchema']['properties'].items():
                    arg_info = {
                        "name": param_name,
                        "description": param_info.get('description', '无描述'),
                        "required": param_name in tool['inputSchema'].get('required', [])
                    }
                    tool_info["args"].append(arg_info)

            result["tools"].append(tool_info)

        return result

    def convert_tool(self, tool: Dict[str, Any]) -> Dict[str, Any]:
        """
        将工具对象转换为LLM可用的格式
        """
        return {
            "function": {
                "name": tool['name'],
                "description": tool['description'],
                "parameters": tool['inputSchema']
            }
        }

    async def close_servers(self):
        """关闭所有服务器连接"""
        cleanup_tasks = []

        for server in self.servers:
            async def cleanup_server(server):
                try:
                    await server["session"].__aexit__(None, None, None)
                    await server["stdio_context"].__aexit__(None, None, None)
                    logging.info(f"清理服务器 {server['name']} 完成")
                except Exception as e:
                    logging.warning(f"清理服务器 {server['name']} 时出错: {e}")

            cleanup_tasks.append(cleanup_server(server))

        if cleanup_tasks:
            await asyncio.gather(*cleanup_tasks, return_exceptions=True)

        self.servers = []
        self.all_tools = []
        self.grouped_tools = {}