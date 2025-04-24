import json
import re
from typing import Dict, Any, List, Set

from openai import OpenAI

from chat_mcp.client.result_assessor import ResultAssessor
from chat_mcp.client.tool_execution import ToolExecutor
from chat_mcp.client.tool_execution_manager import ToolExecutionPlan, ToolExecutionManager, ExecutionMode
from chat_mcp.client.tool_manager import ToolManager
from chat_mcp.client.tool_selector import ToolSelector
from chat_mcp.error import ToolExecutionError
from chat_mcp.prompt.final_answer_prompt import FINAL_ANSWER_PROMPT
from chat_mcp.prompt.preprocess import DETERMINE_EXECUTION_MODE_PROMPT
from chat_mcp.utils.create_completion import create_completion, create_stream_completion
from chat_mcp.utils.get_logger import get_logger

logger = get_logger("ConversationExecutor")


class ConversationState:
    """对话状态管理类"""
    def __init__(self):
        self.executed_tools: Set[str] = set()
        self.tool_result: str = "" 
        self.messages: List[Dict[str, Any]] = []
        self.last_successful_tool: str = ""
        self.all_tool_results: List[Dict[str, Any]] = []

    def add_tool_result(self, tool_name: str, result: str) -> None:
        """添加工具执行结果"""
        if self.tool_result:
            self.tool_result += f"\n\n[工具: {tool_name}] 结果:\n{result}"
        else:
            self.tool_result = f"[工具: {tool_name}] 结果:\n{result}"

        self.all_tool_results.append({
            "tool_name": tool_name,
            "result": result
        })

    def add_tool_execution(self, tool_name: str, args: Dict[str, Any]) -> str:
        """添加工具执行记录并返回唯一标识"""
        tool_call_key = f"{tool_name}:{json.dumps(args, sort_keys=True)}"
        self.executed_tools.add(tool_call_key)
        return tool_call_key

    def has_executed_tool(self, tool_name: str, args: Dict[str, Any]) -> bool:
        """检查是否已执行过相同的工具调用"""
        tool_call_key = f"{tool_name}:{json.dumps(args, sort_keys=True)}"
        return tool_call_key in self.executed_tools

    def add_message(self, role: str, **kwargs) -> None:
        """添加消息到历史记录"""
        message = {"role": role, **kwargs}
        self.messages.append(message)

    def get_messages(self) -> List[Dict[str, Any]]:
        """获取当前消息历史"""
        return self.messages

    def get_tool_context(self) -> str:
        """获取工具执行上下文信息"""
        context = ""
        for i, result in enumerate(self.all_tool_results):
            context += f"\n工具 {i + 1}: {result['tool_name']}\n结果: {result['result']}"
        return context


class ConversationExecutor:
    """对话执行器，负责处理用户查询和工具调用"""
    def __init__(self,
                 llm_client: OpenAI,
                 tool_manager: ToolManager,
                 model: str,
                 max_tool_calls: int = 10,
                 tool_execution_timeout: int = 30,
                 tool_selection_timeout: int = 15,):
        """
        初始化对话执行器
        """
        self.llm_client = llm_client
        self.tool_manager = tool_manager
        self.model = model
        self.max_tool_calls = max_tool_calls
        self.temperature = None
        self.history_message = None
        self.tool_execution_timeout = tool_execution_timeout
        self.tool_executor = ToolExecutor(tool_execution_timeout=tool_execution_timeout)
        self.tool_selector = ToolSelector(llm_client, model, tool_selection_timeout)
        self.result_assessor = ResultAssessor(llm_client, model)

    async def _determine_execution_mode(self, query: str, tools: List[Dict]) -> ExecutionMode | None:
        """
        使用AI动态判断最合适的工具执行模式
        """
        # 准备工具信息
        tool_descriptions = []
        for tool in tools:
            name = tool.get("function", {}).get("name", "")
            description = tool.get("function", {}).get("description", "")
            tool_descriptions.append(f"工具名称: {name}\n描述: {description}")

        tools_info = "\n\n".join(tool_descriptions)

        messages = [
            {"role": "system", "content": DETERMINE_EXECUTION_MODE_PROMPT.format(query=query, tools_info=tools_info)},
            {"role": "user", "content": "请分析执行模式"}
        ]

        try:
            response = await create_completion(
                logger=logger,
                llm_client=self.llm_client,
                model=self.model,
                messages=messages,
                temperature=0.1,
                max_tokens=150
            )

            content = response.choices[0].message.content

            mode_match = re.search(r'执行模式:\s*(SEQUENTIAL|PARALLEL|CONDITIONAL)', content)
            if mode_match:
                mode_str = mode_match.group(1)
                if mode_str == "SEQUENTIAL":
                    return ExecutionMode.SEQUENTIAL
                elif mode_str == "PARALLEL":
                    return ExecutionMode.PARALLEL
                elif mode_str == "CONDITIONAL":
                    return ExecutionMode.CONDITIONAL

        except Exception as e:
            logger.error(f"确定执行模式时出错: {str(e)}")

    async def process_query_stream(self, user_query: str, system_prompt: str, temperature, history_message):
        """处理用户查询，支持并行和串行执行模式"""
        self.temperature = temperature
        self.history_message = history_message

        try:
            if str(system_prompt.startswith("# 工具调用助手")) == "True":
                selected_tools = await self.tool_selector.select_tools(user_query, self.tool_manager.all_tools)

                if not selected_tools:
                    async for chunk in self._process_without_tools(user_query,self.tool_manager.all_tools):
                        yield chunk
                    return
                execution_mode = await self._determine_execution_mode(user_query, selected_tools)

                plan = ToolExecutionPlan(user_query, mode=execution_mode)
                for tool in selected_tools:
                    plan.add_tool(tool)

                tool_manager = ToolExecutionManager(
                    tool_executor=self.tool_executor,
                    result_assessor=self.result_assessor,
                    llm_client=self.llm_client,
                    model=self.model
                )

                should_generate_final = False
                final_summary = None
                summary_output = False

                async for result in tool_manager.execute_tool_plan(plan, self.temperature):
                    if "message" in result and "最终总结" not in result["message"]:
                        yield result["message"]

                    elif "message" in result and "最终总结" in result["message"]:
                        summary_output = True

                    if "should_generate_final" in result:
                        should_generate_final = result["should_generate_final"]

                    if "final_summary" in result:
                        final_summary = result["final_summary"]

                if should_generate_final:
                    if final_summary and not summary_output:
                        yield final_summary
                    elif final_summary:
                        pass
                    else:
                        tools_context = ""
                        for i, result in enumerate(plan.execution_order):
                            tool_result = plan.tool_results.get(result, {})
                            tools_context += f"\n工具 {i + 1}: {result}\n结果: {tool_result.get('result', '')}\n"

                        final_messages = [
                            {"role": "system", "content": FINAL_ANSWER_PROMPT.format(user_query=user_query, tools_context=tools_context)},
                            {"role": "user", "content": user_query}
                        ]

                        stream = await create_stream_completion(
                            logger=logger,
                            llm_client=self.llm_client,
                            model=self.model,
                            messages=final_messages,
                            temperature=self.temperature
                        )

                        async for chunk in stream:
                            if hasattr(chunk.choices[0].delta, 'content') and chunk.choices[0].delta.content:
                                print(f"chunk.choices[0].delta.content: {chunk.choices[0].delta.content}")
                                yield chunk.choices[0].delta.content

                else:
                    yield "\n无法完全满足您的请求，请尝试重新表述您的问题。\n"
            else:
                stream = await create_stream_completion(
                    logger=logger,
                    llm_client=self.llm_client,
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_query}
                    ],
                    temperature=self.temperature
                )
                async for chunk in stream:
                    if hasattr(chunk.choices[0].delta, 'content') and chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content

        except Exception as e:
            error_msg = f"处理查询出错: {str(e)}"
            logger.error(error_msg, exc_info=True)
            yield error_msg

    async def _process_without_tools(self, user_query: str,all_tools: List[Dict[str, Any]]):
        """无需工具时直接处理查询"""
        tool_names = [tool["name"] for tool in all_tools]
        tool_descriptions = [tool["description"] for tool in all_tools]

        formatted_tools_with_descriptions = []
        for i in range(len(tool_names)):
            formatted_tools_with_descriptions.append(f"- {tool_names[i]}: {tool_descriptions[i]}")

        combined_message = "\n".join(formatted_tools_with_descriptions)
        try:
            stream = await create_stream_completion(
                logger=logger,
                llm_client=self.llm_client,
                model=self.model,
                messages=[
                    {"role": "system", "content": f"你有如下工具可以掉用:{combined_message}，请回答用户的问题"},
                    {"role": "user", "content": user_query}
                ],
                temperature=self.temperature
            )

            async for chunk in stream:
                if hasattr(chunk.choices[0].delta, 'content') and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            error_msg = f"处理查询时出错: {str(e)}"
            logger.error(error_msg, exc_info=True)
            yield error_msg

    async def tool_test(self, tool_name: str, **kwargs):
        """测试单个工具"""
        from ..prompt.mcp_tool_test_prompt import MCP_TOOL_TEST_PROMPT

        tool = None
        for t in self.tool_manager.all_tools:
            if t["name"] == tool_name:
                tool = t
                break

        if not tool:
            return f"未找到工具: {tool_name}"

        try:
            prompt = MCP_TOOL_TEST_PROMPT.format(tool_name=tool_name, kwargs=kwargs)

            tools = [self.tool_manager.convert_tool(tool)]

            messages = [
                {"role": "system", "content": prompt},
                {"role": "user", "content": ""}
            ]

            response = await create_completion(
                logger=logger,
                llm_client=self.llm_client,
                model=self.model,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                temperature=self.temperature
            )

            message = response.choices[0].message

            if not hasattr(message, 'tool_calls') or not message.tool_calls:
                return message.content

            tool_call = message.tool_calls[0]
            called_tool_name = tool_call.function.name

            if called_tool_name != tool_name:
                return f"工具名称不匹配: 请求测试 {tool_name}，但调用了 {called_tool_name}"

            try:
                tool_args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                return f"参数解析失败: {tool_call.function.arguments}"

            try:
                result = await self.tool_executor.execute_tool(tool, tool_name, tool_args)
                return result
            except ToolExecutionError as e:
                return f"测试失败: {str(e)}"

        except Exception as e:
            logger.error(f"工具测试失败: {str(e)}", exc_info=True)
            return f"测试过程出错: {str(e)}"