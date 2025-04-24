import asyncio
import json
import re
from typing import Dict, Any, List

from openai import OpenAI

from chat_mcp.prompt.mcp_tool_select_prompt import MCP_TOOL_SELECT_PROMPT
from chat_mcp.utils.create_completion import create_completion
from chat_mcp.utils.get_logger import get_logger

# 配置日志
logger = get_logger("ToolSelector")


class ToolSelector:
    """
    工具选择器类，负责根据用户查询选择合适的工具
    """

    def __init__(self, llm_client: OpenAI, model: str, tool_selection_timeout: int = 15):
        """
        初始化工具选择器
        """
        self.llm_client = llm_client
        self.model = model
        self.tool_selection_timeout = tool_selection_timeout

    async def select_tools(self, user_query: str, all_tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        选择适合查询的工具
        """
        tool_names = [tool["name"] for tool in all_tools]
        tool_descriptions = [tool["description"] for tool in all_tools]

        formatted_tools_with_descriptions = []
        for i in range(len(tool_names)):
            formatted_tools_with_descriptions.append(f"- {tool_names[i]}: {tool_descriptions[i]}")

        combined_message = "\n".join(formatted_tools_with_descriptions)

        tool_select_prompt = MCP_TOOL_SELECT_PROMPT.format(
            user_query=user_query,
            tools=combined_message,
        )

        messages = [
            {"role": "system", "content": tool_select_prompt},
            {"role": "user", "content": user_query}
        ]

        try:
            response = await asyncio.wait_for(
                create_completion(logger=logger,llm_client=self.llm_client,model=self.model,messages=messages, temperature=0.7),
                timeout=self.tool_selection_timeout
            )

            content = response.choices[0].message.content

            try:
                json_match = re.search(r'```json\s*(.*?)\s*```', content, re.DOTALL)
                if json_match:
                    json_str = json_match.group(1)
                else:
                    json_str = content

                tool_selection = json.loads(json_str)

                if "tool" in tool_selection:
                    selected_tool_names = [tool_selection["tool"]]
                elif "tools" in tool_selection:
                    selected_tool_names = tool_selection["tools"]
                else:
                    selected_tool_names = []

            except json.JSONDecodeError:
                selected_tool_names = self._extract_tool_names_from_text(content, tool_names)

            logger.info(f"初步筛选可执行的工具: {selected_tool_names}")

            selected_tools_info = []
            for tool_name in selected_tool_names:
                for tool in all_tools:
                    if tool.get("name") == tool_name:
                        selected_tools_info.append(self._convert_tool(tool))
                        break

            return selected_tools_info
        except asyncio.TimeoutError:
            logger.error("工具选择阶段超时")
            return []
        except Exception as e:
            logger.error(f"工具选择失败: {str(e)}", exc_info=True)
            return []

    def _extract_tool_names_from_text(self, text: str, available_tool_names: List[str]) -> List[str]:
        """从文本中提取工具名称"""
        selected_tools = []

        if "无工具" in text or "no tools" in text.lower():
            return []

        for tool_name in available_tool_names:
            if tool_name in text:
                selected_tools.append(tool_name)

        return selected_tools

    def _convert_tool(self, tool: Dict[str, Any]) -> Dict[str, Any]:
        """
        转换工具格式为标准格式，保留原始工具对象的server字段
        """
        converted_tool = {
            "type": "function",
            "function": {
                "name": tool.get("name", ""),
                "description": tool.get("description", ""),
                "parameters": tool.get("inputSchema", {})
            },
            "server": tool.get("server")
        }

        return converted_tool