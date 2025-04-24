import asyncio
import json
import re
from typing import Dict, Any, List, Optional

from openai import OpenAI

from chat_mcp.prompt.assess_prompt import ASSESS_PROMPT, FINAL_STATE_PROMPT, TASK_COMPLETION_PROMPT, POST_PROCESSING_PROMPT, \
    TASK_TYPE_ANALYSIS_PROMPT
from chat_mcp.utils.create_completion import create_completion
from chat_mcp.utils.get_logger import get_logger

logger = get_logger("ResultAssessor")

class ResultAssessor:
    """工具结果评估器，使用LLM动态评估工具执行是否满足用户需求"""
    def __init__(self, llm_client: OpenAI, model: str, assessment_timeout: int = 10):
        self.llm_client = llm_client
        self.model = model
        self.assessment_timeout = assessment_timeout

    async def _get_llm_response(self, prompt: str, temperature: float = 0.1) -> str:
        messages = [
            {"role": "system", "content": "你是一个专业的任务评估助手。"},
            {"role": "user", "content": prompt}
        ]

        try:
            response = await asyncio.wait_for(
                create_completion(logger=logger,llm_client=self.llm_client,model=self.model,messages=messages, temperature=temperature),
                timeout=self.assessment_timeout
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"LLM调用失败: {str(e)}")
            raise

    async def _extract_json_from_response(self, response: str) -> Dict[str, Any]:
        """从LLM响应中提取JSON"""
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
            else:
                logger.warning(f"无法从响应中提取JSON: {response}")
                return {}

    async def assess_tool_result(
            self,
            user_query: str,
            tool_name: str,
            tool_args: Dict[str, Any],
            result: str,
            all_previous_results: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """评估单个工具的执行结果"""
        has_error = "isError=True" in result

        previous_context = self._build_previous_context(all_previous_results)
        previous_tools = {res['tool_name'] for res in all_previous_results} if all_previous_results else set()

        completion_prompt = TASK_COMPLETION_PROMPT.format(
            tool_name=tool_name,
            result=result,
            has_error=has_error,
            previous_tools=list(previous_tools),
            user_query=user_query
        )

        completion_response = await self._get_llm_response(completion_prompt, temperature=0.1)
        completion_data = await self._extract_json_from_response(completion_response)
        is_complete = completion_data.get("is_complete", False)

        assessment_prompt = self._build_assessment_prompt(
            user_query, tool_name, tool_args, result,
            has_error, is_complete, previous_context
        )

        assessment_response = await self._get_llm_response(assessment_prompt, temperature=0.3)
        assessment_result = self._parse_assessment(assessment_response)

        post_processing_prompt = POST_PROCESSING_PROMPT.format(
            assessment=json.dumps(assessment_result, ensure_ascii=False),
            tool_name=tool_name,
            result=result,
            has_error=has_error,
            previous_tools=list(previous_tools),
            user_query=user_query
        )

        post_processing_response = await self._get_llm_response(post_processing_prompt, temperature=0.1)
        corrections = await self._extract_json_from_response(post_processing_response)

        if corrections:
            assessment_result.update(corrections)

        task_type_prompt = TASK_TYPE_ANALYSIS_PROMPT.format(
            user_query=user_query,
            tool_name=tool_name,
            result=result,
            reason=assessment_result.get("reason", "")
        )

        task_type_response = await self._get_llm_response(task_type_prompt, temperature=0.1)
        task_type_data = await self._extract_json_from_response(task_type_response)

        if task_type_data.get("only_summary"):
            assessment_result["need_more_tools"] = False
            assessment_result["problem_solved"] = True

        logger.info(f"工具 {tool_name} 执行结果评估: {assessment_result}")
        return assessment_result

    def _build_previous_context(self, all_previous_results: List[Dict[str, Any]]) -> str:
        """构建工具执行上下文"""
        if not all_previous_results:
            return "无"

        context_lines = []
        for i, prev in enumerate(all_previous_results):
            context_lines.append(f"工具 {i + 1}: {prev['tool_name']}")
            context_lines.append(f"参数: {json.dumps(prev.get('tool_args', {}), ensure_ascii=False)}")
            context_lines.append(f"结果: {prev['result']}\n")

        return "\n".join(context_lines)

    def _build_assessment_prompt(
            self,
            user_query: str,
            tool_name: str,
            tool_args: Dict[str, Any],
            result: str,
            has_error: bool,
            is_complete: bool,
            previous_context: str
    ) -> str:
        """构建评估提示词"""
        return ASSESS_PROMPT.format(
            user_query=user_query,
            tool_name=tool_name,
            input_args=json.dumps(tool_args, ensure_ascii=False),
            result=result,
            previous_context=previous_context,
            message1="注意: 由于执行失败，直接判定为未解决" if has_error else "",
            message2="问题可能已完全解决，请仔细评估" if is_complete else "",
            message3="失败" if has_error else "成功"
        )

    def _parse_assessment(self, content: str) -> Dict[str, Any]:
        """解析LLM的评估响应"""
        result = {
            "satisfied": False,
            "satisfaction_level": "不满足需求",
            "confidence": 0.0,
            "reason": "",
            "problem_solved": False,
            "final_confidence": 0.0,
            "need_more_tools": True,
            "next_tool_suggestion": ""
        }

        assessment_match = re.search(
            r'(?:工具结果评估|结果评估):\s*(完全解决|部分解决|未解决)\s*(?:\(置信度:\s*([\d.]+)\))?',
            content
        )
        if assessment_match:
            level = assessment_match.group(1)
            result.update({
                "satisfaction_level": self._map_level(level),
                "satisfied": level == "完全解决",
                "problem_solved": level == "完全解决",
                "confidence": float(assessment_match.group(2)) if assessment_match.group(
                    2) else self._default_confidence(level)
            })

        reason_match = re.search(r'原因分析:\s*([^\n]+)', content)
        if reason_match:
            result["reason"] = reason_match.group(1).strip()

        tools_match = re.search(r'是否需要其他工具:\s*(是|否)', content)
        if tools_match:
            result["need_more_tools"] = tools_match.group(1) == "是"
        else:
            result["need_more_tools"] = not result.get("problem_solved", False)

        if "问题已完全解决" in content:
            result.update({
                "problem_solved": True,
                "need_more_tools": False,
                "final_confidence": self._extract_final_confidence(content) or result.get("confidence", 0.8)
            })

        return result

    def _map_level(self, level: str) -> str:
        """映射评估等级到统一的术语"""
        mapping = {
            "完全解决": "满足全部需求",
            "部分解决": "满足部分需求",
            "未解决": "不满足需求"
        }
        return mapping.get(level, "不满足需求")

    def _default_confidence(self, level: str) -> float:
        """根据评估等级获取默认置信度"""
        return {
            "完全解决": 0.9,
            "部分解决": 0.7,
            "未解决": 0.5
        }.get(level, 0.5)

    def _extract_final_confidence(self, content: str) -> Optional[float]:
        """从内容中提取最终置信度"""
        match = re.search(r'置信度:\s*([\d.]+)', content)
        return float(match.group(1)) if match else None

    def _get_default_assessment(self, has_error: bool, error_msg: str) -> Dict[str, Any]:
        """当评估失败时获取默认评估结果"""
        return {
            "satisfied": False,
            "satisfaction_level": "不满足需求" if has_error else "满足部分需求",
            "confidence": 0.0 if has_error else 0.7,
            "reason": f"评估过程出错: {error_msg}",
            "problem_solved": False,
            "need_more_tools": not has_error,
            "next_tool_suggestion": ""
        }

    async def assess_final_state(
        self,
        user_query: str,
        all_tool_results: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        评估执行计划完成情况
        """
        if not all_tool_results:
            return {
                "problem_solved": False,
                "confidence": 0.0,
                "reason": "没有执行任何工具",
                "generate_final": False,
                "need_more_tools": False
            }

        tools_context = ""
        for i, result in enumerate(all_tool_results):
            tools_context += f"\n工具 {i + 1}: {result['tool_name']}\n结果: {result['result']}\n"

        final_state_prompt = FINAL_STATE_PROMPT.format(
            user_query=user_query,
            tools_context=tools_context
        )

        try:
            final_response = await self._get_llm_response(final_state_prompt, temperature=0.1)
            final_state = await self._extract_json_from_response(final_response)

            result = {
                "problem_solved": final_state.get("problem_solved", False),
                "solution_level": final_state.get("solution_level", "未解决"),
                "confidence": final_state.get("confidence", 0.0),
                "reason": final_state.get("reason", ""),
                "need_more_tools": final_state.get("need_more_tools", True),
                "generate_final": final_state.get("generate_final", False),
                "partially_solved": final_state.get("solution_level") == "部分解决"
            }
            
            if not result["problem_solved"] and not result["need_more_tools"]:
                has_async_signs = False
                
                if all_tool_results:
                    last_result = all_tool_results[-1]["result"]
                    async_keywords = ["任务ID", "进度", "生成中", "处理中", "等待", "排队中"]
                    if any(keyword in last_result for keyword in async_keywords):
                        has_async_signs = True
                
                if "remaining_tasks" in final_state:
                    wait_tasks = [task for task in final_state["remaining_tasks"] 
                                if any(word in task.lower() for word in ["等待", "检查", "获取", "查询"])]
                    if wait_tasks:
                        has_async_signs = True
                
                if has_async_signs:
                    result["need_more_tools"] = True
                    result["reason"] += " (系统检测到异步任务仍在进行中，需要继续轮询进度)"
                    logger.info("检测到异步任务标志，强制设置need_more_tools=True")

            for key, value in final_state.items():
                if key not in result:
                    result[key] = value

            logger.info(f"最终状态评估: {result}")
            return result

        except Exception as e:
            logger.error(f"评估最终状态失败: {str(e)}", exc_info=True)
            return {
                "problem_solved": False,
                "confidence": 0.0,
                "reason": f"评估过程出错: {str(e)}",
                "generate_final": False,
                "need_more_tools": False
            }