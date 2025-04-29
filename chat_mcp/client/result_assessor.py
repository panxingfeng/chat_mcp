import json
import re
from typing import Dict, Any, List

from openai import OpenAI

from chat_mcp.utils.get_logger import get_logger

logger = get_logger("ResultAssessor")

class ResultAssessor:
    """工具结果评估器，使用LLM动态评估工具执行是否满足用户需求"""
    def __init__(self, llm_client: OpenAI, model: str, assessment_timeout: int = 10):
        self.llm_client = llm_client
        self.model = model
        self.assessment_timeout = assessment_timeout

    async def assess_tool_result(
            self,
            user_query: str,
            tool_name: str,
            tool_args: Dict[str, Any],
            result: str,
            all_previous_results: List[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """评估单个工具的执行结果"""
        # 构建评估提示
        prompt = self._build_assessment_prompt(
            user_query, tool_name, tool_args, result, all_previous_results
        )
        
        # 获取LLM评估
        response = await self._get_llm_response(prompt, temperature=0.3)
        
        # 解析评估结果
        assessment = self._extract_json_from_response(response)
        
        # 如果解析失败，构建默认评估
        if not assessment:
            assessment = self._get_default_assessment("解析评估结果失败")
            
        logger.info(f"工具 {tool_name} 执行结果评估: {assessment}")
        return assessment
        
    async def assess_final_state(
        self,
        user_query: str,
        all_tool_results: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """评估整体执行计划的完成情况"""
        if not all_tool_results:
            return {
                "problem_solved": False,
                "confidence": 0.0,
                "reason": "没有执行任何工具",
                "generate_final": True,
                "need_more_tools": False
            }

        # 构建工具执行上下文
        tools_context = ""
        for i, result in enumerate(all_tool_results):
            tools_context += f"\n工具 {i + 1}: {result.get('tool_name', '')}\n"
            tools_context += f"结果: {result.get('result', '')}\n\n"

        # 构建最终评估提示
        prompt = f"""综合评估所有工具执行结果，判断用户问题是否已得到解决：

用户问题:
{user_query}

所有工具执行结果:
{tools_context}

特别注意:
1. 对于图像生成、文件处理等异步任务：
   - 如果结果中包含"任务ID"、"进度"、"生成中"等关键词
   - 如果任务尚未完成
   这些情况下，必须将need_more_tools设为true

2. 只有在以下情况才能将need_more_tools设为false：
   - 问题已完全解决
   - 确认没有任何工具可以继续推进解决方案
   - 工具执行出错且无法恢复

请返回JSON格式：
{{
    "problem_solved": true/false,  // 问题是否已解决
    "solution_level": "已解决/部分解决/未解决",
    "confidence": 0.0-1.0,  // 解决方案置信度
    "reason": "详细原因",  // 评估理由
    "need_more_tools": true/false,  // 是否需要继续执行工具
    "generate_final": true/false  // 是否生成最终总结
}}
"""

        try:
            response = await self._get_llm_response(prompt, temperature=0.1)
            assessment = self._extract_json_from_response(response)
            
            if not assessment:
                assessment = {
                    "problem_solved": False,
                    "confidence": 0.0,
                    "reason": "评估过程出错",
                    "generate_final": True,
                    "need_more_tools": False
                }
                
            # 检查异步任务特征
            if not assessment.get("problem_solved", False) and not assessment.get("need_more_tools", False):
                # 检查最后一个结果是否包含异步任务特征
                if all_tool_results:
                    last_result = all_tool_results[-1].get("result", "")
                    async_keywords = ["任务ID", "进度", "生成中", "处理中", "等待", "排队中"]
                    if any(keyword in last_result for keyword in async_keywords):
                        assessment["need_more_tools"] = True
                        assessment["reason"] = assessment.get("reason", "") + " (检测到异步任务仍在进行中)"
                        logger.info("检测到异步任务标志，设置need_more_tools=True")
            
            logger.info(f"最终状态评估: {assessment}")
            return assessment
            
        except Exception as e:
            logger.error(f"评估最终状态失败: {str(e)}")
            return {
                "problem_solved": False,
                "confidence": 0.0,
                "reason": f"评估过程出错: {str(e)}",
                "generate_final": True,
                "need_more_tools": False
            }

    async def _get_llm_response(self, prompt: str, temperature: float = 0.1) -> str:
        """获取LLM响应"""
        messages = [
            {"role": "system", "content": "你是一个专业的任务评估助手。"},
            {"role": "user", "content": prompt}
        ]

        try:
            # 移除await，直接调用
            response = self.llm_client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"LLM调用失败: {str(e)}")
            return ""

    def _extract_json_from_response(self, response: str) -> Dict[str, Any]:
        """从LLM响应中提取JSON"""
        if not response:
            return {}
            
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            # 尝试使用正则表达式提取JSON
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group())
                except json.JSONDecodeError:
                    logger.warning(f"无法从提取的文本解析JSON: {json_match.group()}")
                    return {}
            else:
                logger.warning(f"无法从响应中提取JSON: {response}")
                return {}

    def _build_assessment_prompt(
            self,
            user_query: str,
            tool_name: str,
            tool_args: Dict[str, Any],
            result: str,
            all_previous_results: List[Dict[str, Any]] = None
    ) -> str:
        """构建评估提示词"""
        has_error = "isError=True" in result or "执行出错" in result
        
        # 构建工具执行上下文
        previous_context = "无"
        if all_previous_results:
            context_lines = []
            for i, prev in enumerate(all_previous_results):
                context_lines.append(f"工具 {i + 1}: {prev.get('tool_name', '')}")
                context_lines.append(f"参数: {json.dumps(prev.get('tool_args', {}), ensure_ascii=False)}")
                context_lines.append(f"结果: {prev.get('result', '')}\n")
            previous_context = "\n".join(context_lines)

        return f"""
请根据工具执行情况和历史记录，判断用户问题是否已得到解决。

## 用户问题
{user_query}

## 已执行工具历史
{previous_context}

## 当前工具执行详情
工具名称: {tool_name}  
输入参数: {json.dumps(tool_args, ensure_ascii=False)}
执行结果: {result}
执行状态: {'失败' if has_error else '成功'}

## 评估标准
1. 对比工具参数与用户需求，判断参数是否准确匹配需求
2. 分析工具结果是否完整解决了对应子任务
3. 综合已执行工具历史，判断是否还有需要调用工具的子任务
4. 置信度仅基于参数与结果的匹配程度（0.7-1.0）

## 判断规则
- 分析未完成任务的性质:
  - 如果是"数据获取类"任务（如搜索、查询、计算等），则需要调用工具
  - 如果是"总结、分析、建议类"任务（如总结信息、给建议、做推荐等），则无需调用工具
  - 基于工具结果进行解释和回答的任务，无需再调用其他工具

## 输出要求
请返回JSON格式：
{{
    "satisfaction_level": "满足全部需求/满足部分需求/不满足需求",
    "confidence": 0.0-1.0,
    "reason": "简明说明评估依据",
    "tool_failed": {'true' if has_error else 'false'},
    "problem_solved": true/false,
    "need_more_tools": true/false,
    "next_tool_suggestion": "建议的下一个工具（如有）"
}}

注意：
{f'由于执行失败，可能未解决用户问题' if has_error else '如果问题已完全解决，则不需要更多工具'}
"""

    def _get_default_assessment(self, error_msg: str) -> Dict[str, Any]:
        """当评估失败时获取默认评估结果"""
        return {
            "satisfaction_level": "不满足需求",
            "confidence": 0.5,
            "reason": f"评估过程出错: {error_msg}",
            "tool_failed": False,
            "problem_solved": False,
            "need_more_tools": True,
            "next_tool_suggestion": ""
        }