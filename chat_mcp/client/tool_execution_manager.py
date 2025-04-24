import asyncio
import json
import re
from typing import Dict, Any, List, AsyncGenerator
from enum import Enum

from openai import OpenAI
from chat_mcp.prompt.tool_prompt import GEN_FINAL_SUMMARY
from chat_mcp.utils.create_completion import create_stream_completion
from chat_mcp.utils.get_logger import get_logger

logger = get_logger("ToolExecutionManager")

class ExecutionMode(Enum):
    """工具执行模式"""
    SEQUENTIAL = "sequential" 
    PARALLEL = "parallel"
    CONDITIONAL = "conditional"


class ToolExecutionPlan:
    """工具执行计划类，描述工具的执行顺序和依赖关系"""
    def __init__(self,
                 user_query: str,
                 mode: ExecutionMode = ExecutionMode.SEQUENTIAL):
        """
        初始化工具执行计划
        """
        self.user_query = user_query
        self.mode = mode
        self.tools: List[Dict[str, Any]] = []
        self.tool_results: Dict[str, Any] = {}
        self.execution_order: List[str] = []
        self.dependencies: Dict[str, List[str]] = {}
        self.completed = False
        self.final_result: Dict[str, Any] = {}

    def add_tool(self, tool: Dict[str, Any], depends_on: List[str] = None):
        """
        添加工具到执行计划
        """
        self.tools.append(tool)
        tool_name = tool.get("function", {}).get("name", f"tool_{len(self.tools)}")

        if depends_on and self.mode != ExecutionMode.PARALLEL:
            self.dependencies[tool_name] = depends_on

    def record_tool_result(self, tool_name: str, result: Any, success: bool):
        """
        记录工具执行结果
        """
        self.tool_results[tool_name] = {
            "result": result,
            "success": success
        }
        self.execution_order.append(tool_name)

    def can_execute_tool(self, tool_name: str) -> bool:
        """
        检查工具是否可以执行（依赖的工具是否已执行完成）
        """
        if self.mode == ExecutionMode.PARALLEL:
            return True

        if tool_name in self.dependencies:
            for dep in self.dependencies[tool_name]:
                if dep not in self.tool_results or not self.tool_results[dep]["success"]:
                    return False

        return True

    async def determine_next_tool_with_llm(self, llm_client, model) -> str:
        """
        使用LLM判断下一个需要执行的工具
        返回工具名称，如果返回空字符串则表示问题已解决
        """
        executed_tools_info = []
        for tool_name in self.execution_order:
            tool_result = self.tool_results.get(tool_name, {})
            executed_tools_info.append({
                "tool_name": tool_name,
                "result": tool_result.get("result", ""),
                "success": tool_result.get("success", False)
            })
        
        available_tools = []
        for tool in self.tools:
            tool_name = tool.get("function", {}).get("name")
            if tool_name not in self.tool_results:
                tool_description = tool.get("function", {}).get("description", "")
                available_tools.append({
                    "name": tool_name,
                    "description": tool_description
                })

        if not available_tools:
            return ""
        
        prompt = f"""
        你的任务是判断下一步应该执行哪个工具来解决用户的查询问题。
        
        ## 用户查询
        {self.user_query}
        
        ## 已执行的工具和结果
        """
        
        if executed_tools_info:
            for i, info in enumerate(executed_tools_info):
                success_status = "成功" if info["success"] else "失败"
                prompt += f"\n工具 {i + 1}: {info['tool_name']} (执行{success_status})\n结果: {info['result']}\n"
        else:
            prompt += "\n尚未执行任何工具\n"
        
        prompt += "\n## 可用工具列表\n"
        for i, tool in enumerate(available_tools):
            prompt += f"{i + 1}. {tool['name']}: {tool['description']}\n"
        
        prompt += """
        ## 你的任务
        1. 分析用户查询和已执行的工具结果
        2. 判断问题是否已解决
        3. 如果问题已解决，请返回空字符串 ""
        4. 如果问题未解决，请从可用工具列表中选择最合适的下一个工具名称
        5. 支持调用同一个工具多次
        
        只返回工具名称或空字符串，不要有任何额外解释。
        """
        
        try:
            messages = [
                {"role": "system", "content": prompt},
                {"role": "user", "content": "请判断下一步执行哪个工具"}
            ]
            
            response = await asyncio.to_thread(
                llm_client.chat.completions.create,
                model=model,
                messages=messages,
                temperature=0.2
            )
            print("response:\n", response)
            
            next_tool = response.choices[0].message.content.strip()
            
            # 验证返回的工具是否在可用列表中
            available_tool_names = [tool["name"] for tool in available_tools]
            if next_tool and next_tool not in available_tool_names:
                logger.warning(f"LLM返回的工具 '{next_tool}' 不在可用工具列表中，将使用默认选择")
                return available_tool_names[0] if available_tool_names else ""
            
            return next_tool
            
        except Exception as e:
            logger.error(f"LLM判断下一个工具时出错: {str(e)}")
            return available_tools[0]["name"] if available_tools else ""
    

    def is_complete(self) -> bool:
        """
        检查执行计划是否已完成
        """
        if self.completed:
            return True

        if len(self.tool_results) == len(self.tools):
            return True

        return False

    def set_completed(self, completed: bool, reason: str = ""):
        """
        设置执行计划的完成状态
        """
        self.completed = completed
        if completed:
            self.final_result = {
                "completed": True,
                "reason": reason or "所有必要工具已执行完成",
                "execution_order": self.execution_order
            }
        else:
            self.final_result = {
                "completed": False,
                "reason": reason or "执行计划未完成",
                "execution_order": self.execution_order
            }


class ToolParameterSetter:
    """工具参数设置器，使用AI为工具设置参数"""
    def __init__(self, llm_client: OpenAI, model: str):
        self.llm_client = llm_client
        self.model = model

    async def set_parameters(self,
                             tool: Dict[str, Any],
                             user_query: str,
                             execution_mode: ExecutionMode,
                             previous_results: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        为工具设置参数
        """
        tool_name = tool.get("function", {}).get("name", "unknown_tool")
        tool_description = tool.get("function", {}).get("description", "")
        tool_parameters = tool.get("function", {}).get("parameters", {})

        prompt = f"""
        你需要为工具 "{tool_name}" 设置合适的参数。

        ## 工具描述
        {tool_description}

        ## 工具参数结构
        {json.dumps(tool_parameters, ensure_ascii=False, indent=2)}

        ## 用户查询
        {user_query}
        """

        if execution_mode == ExecutionMode.SEQUENTIAL and previous_results:
            context = ""
            for i, result in enumerate(previous_results):
                context += f"\n之前工具 {i + 1}: {result.get('tool_name')}\n"
                context += f"结果: {result.get('result', '')}\n"

            prompt += f"\n## 之前工具的执行结果(请参考这些结果设置参数)\n{context}"

        prompt += """
        ## 你的任务
        1. 分析用户查询的意图
        2. 理解工具的参数结构
        3. 为该工具生成合适的参数值
        4. 以JSON格式返回参数，不要有任何额外的解释

        只返回一个有效的JSON对象，包含所有必要的参数。
        """

        try:
            messages = [
                {"role": "system", "content": prompt},
                {"role": "user", "content": "请为此工具生成参数"}
            ]

            response = await asyncio.to_thread(
                self.llm_client.chat.completions.create,
                model=self.model,
                messages=messages,
                temperature=0.2
            )

            param_text = response.choices[0].message.content

            json_match = re.search(r'{.*}', param_text, re.DOTALL)
            if json_match:
                param_json = json_match.group(0)
                parameters = json.loads(param_json)
                return parameters
            else:
                return json.loads(param_text)

        except Exception as e:
            logger.error(f"为工具 {tool_name} 设置参数时出错: {str(e)}")
            return {}

class ToolExecutionManager:
    """工具执行管理器，负责协调多个工具的执行顺序和依赖关系"""
    def __init__(self,
                 tool_executor,
                 result_assessor,
                 llm_client: OpenAI,
                 model: str):
        """
        初始化工具执行管理器
        """
        self.tool_executor = tool_executor
        self.result_assessor = result_assessor
        self.llm_client = llm_client
        self.model = model

    async def execute_tool_plan(self, plan: ToolExecutionPlan, temperature) -> AsyncGenerator[Dict[str, Any], None]:
        """
        按照执行计划执行工具
        """
        while not plan.is_complete():
            next_tool_name = await plan.determine_next_tool_with_llm(self.llm_client, self.model)
            print("next_tool_name:\n", next_tool_name)
            if not next_tool_name:
                plan.set_completed(True, "LLM判断问题已解决，不需要执行更多工具")
                break
            
            next_tool = None
            for tool in plan.tools:
                if tool.get("function", {}).get("name") == next_tool_name:
                    next_tool = tool
                    break
            
            if not next_tool:
                plan.set_completed(True, f"找不到工具: {next_tool_name}")
                break
            
            async for result in self._execute_single_tool(next_tool, plan):
                yield result
                
                if result.get("processed") and result.get("assessment", {}).get("problem_solved", False):
                    plan.set_completed(True, "工具执行结果表明问题已解决")
                    break

        if plan.is_complete():
            final_assessment = await self._assess_plan_completion(plan)
            yield {
                "final_assessment": final_assessment,
                "should_generate_final": True,
            }

            try:
                async for chunk in self.generate_final_summary(plan, temperature):
                    yield chunk
            except Exception as e:
                logger.error(f"生成最终总结失败: {str(e)}")
                yield {
                    "error": "生成总结时发生错误。"
                }
        else:
            final_assessment = await self._assess_plan_completion(plan)
            yield {
                "final_assessment": final_assessment,
                "should_generate_final": False
            }

    async def _execute_single_tool(self,
                                   tool: Dict[str, Any],
                                   plan: ToolExecutionPlan) -> AsyncGenerator[Dict[str, Any], None]:
        """执行单个工具"""
        tool_name = tool.get("function", {}).get("name", "unknown_tool")

        previous_results = []
        if plan.mode == ExecutionMode.SEQUENTIAL and plan.execution_order:
            for prev_tool in plan.execution_order:
                previous_results.append({
                    "tool_name": prev_tool,
                    "result": plan.tool_results.get(prev_tool, {}).get("result", "")
                })

        param_setter = ToolParameterSetter(self.llm_client, self.model)

        args = await param_setter.set_parameters(
            tool=tool,
            user_query=plan.user_query,
            execution_mode=plan.mode,
            previous_results=previous_results
        )

        yield {"message": f"执行工具: {tool_name}\n"}

        result_info = {"tool_name": tool_name, "processed": False}

        try:
            result = await self.tool_executor.execute_tool(tool, tool_name, args)
            result_str = str(result)

            success = "isError=True" not in result_str

            plan.record_tool_result(tool_name, result_str, success)

            assessment = await self.result_assessor.assess_tool_result(
                user_query=plan.user_query,
                tool_name=tool_name,
                tool_args=args,
                result=result_str,
                all_previous_results=[{"tool_name": t, "result": plan.tool_results[t]["result"]}
                                      for t in plan.execution_order[:-1]]
            )

            result_info["message"] = f"{result_str}\n\n"
            result_info["message"] += self._format_assessment(assessment)
            result_info["processed"] = True
            result_info["success"] = success
            result_info["assessment"] = assessment

            if assessment.get("problem_solved", False):
                plan.set_completed(True, "工具执行结果表明问题已解决")
                result_info["generate_final"] = True

            yield result_info

        except Exception as e:
            logger.error(f"执行工具 {tool_name} 出错: {str(e)}")
            error_message = f"执行出错: {str(e)}"

            plan.record_tool_result(tool_name, error_message, False)

            result_info["message"] = error_message
            result_info["error"] = True
            result_info["success"] = False

            yield result_info

    async def _should_continue_execution(self, plan: ToolExecutionPlan) -> bool:
        """
        条件模式下，评估是否应该继续执行
        """
        if not plan.execution_order:
            return True

        last_tool = plan.execution_order[-1]
        tool_result = plan.tool_results.get(last_tool, {})

        if not tool_result.get("success", False):
            return True

        result_str = tool_result.get("result", "")

        assessment = await self.result_assessor.assess_tool_result(
            user_query=plan.user_query,
            tool_name=last_tool,
            tool_args={},
            result=result_str,
            all_previous_results=[{"tool_name": t, "result": plan.tool_results[t]["result"]}
                                  for t in plan.execution_order[:-1]]
        )

        return assessment.get("need_more_tools", True)

    async def _assess_plan_completion(self, plan: ToolExecutionPlan) -> Dict[str, Any]:
        """
        评估执行计划完成情况
        """
        all_results = []
        for tool_name in plan.execution_order:
            result = plan.tool_results.get(tool_name, {})
            all_results.append({
                "tool_name": tool_name,
                "result": result.get("result", "")
            })

        final_assessment = await self.result_assessor.assess_final_state(
            user_query=plan.user_query,
            all_tool_results=all_results
        )

        plan.final_result.update({
            "assessment": final_assessment,
            "problem_solved": final_assessment.get("problem_solved", False),
            "generate_final": final_assessment.get("problem_solved", False) or
                              final_assessment.get("generate_final", False)
        })

        return plan.final_result

    def _format_assessment(self, assessment: Dict[str, Any]) -> str:
        """
        格式化评估结果
        """
        formatted = f"工具结果评估: {assessment.get('satisfaction_level', '不满足需求')} " + \
                    f"(置信度: {assessment.get('confidence', 0.0)})\n" + \
                    f"原因: {assessment.get('reason', '')}\n" + \
                    f"是否需要执行其他工具: {'是' if assessment.get('need_more_tools', True) else '否'}\n"

        if assessment.get('problem_solved', False):
            formatted += "\n问题已完全解决，将生成最终回答\n"

        return formatted

    async def generate_final_summary(self, plan: ToolExecutionPlan,temperature) -> AsyncGenerator[Any, Any]:
        """
        使用LLM生成执行结果的最终总结
        """
        tool_history = []
        for tool_name in plan.execution_order:
            result = plan.tool_results.get(tool_name, {})
            tool_history.append({
                "tool": tool_name,
                "result": result.get("result", ""),
                "success": result.get("success", False)
            })

        tools_context = ""
        for i, info in enumerate(tool_history):
            success_status = "成功" if info["success"] else "失败"
            tools_context += f"\n工具 {i + 1}: {info['tool']} (执行{success_status})\n结果: {info['result']}\n"

        prompt = GEN_FINAL_SUMMARY.format(
            plan=plan.user_query,
            tools_context=tools_context
        )

        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": "请生成最终回答"}
        ]

        try:
            stream = await create_stream_completion(
                logger=logger,
                llm_client=self.llm_client,
                model=self.model,
                messages=messages,
                temperature=temperature
            )

            async for chunk in stream:
                if hasattr(chunk.choices[0].delta, 'content') and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            logger.error(f"生成最终总结失败: {str(e)}")
            return
