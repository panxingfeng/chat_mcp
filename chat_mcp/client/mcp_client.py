import json
import asyncio
import os
import re
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

from openai import OpenAI

from chat_mcp.client.tool_execution import ToolExecutor
from chat_mcp.client.tool_manager import ToolManager
from chat_mcp.client.result_assessor import ResultAssessor
from chat_mcp.error.tool_error import ToolExecutionError
from chat_mcp.utils.create_completion import create_completion,create_stream_completion
from chat_mcp.utils.get_logger import get_logger
from config.config import MAX_ITERATIONS

logger = get_logger("MCPClient")

def extract_json_from_llm_response(content: str) -> Dict[str, Any]:
    """
    从LLM响应中提取JSON内容
    """
    if not content:
        return {}
    
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    code_block_pattern = r'```(?:json)?\s*([\s\S]*?)```'
    code_match = re.search(code_block_pattern, content)
    if code_match:
        try:
            json_str = code_match.group(1).strip()
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass
    
    json_object_pattern = r'({[\s\S]*})'
    match = re.search(json_object_pattern, content)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass
    
    try:
        json_pattern = r'{\s*"([^"]+)"\s*:\s*"([^"]+)"\s*,\s*"([^"]+)"\s*:\s*"([\s\S]*?)"\s*}'
        full_match = re.search(json_pattern, content)
        
        if full_match:
            key1, value1, key2, value2 = full_match.groups()
            result = {}
            result[key1] = value1
            result[key2] = value2
            return result
    except Exception as e:
        logger.warning(f"特殊处理JSON也失败: {str(e)}")
    
    logger.warning(f"无法从响应中提取JSON: {content}")
    return {}

async def filter_stream(stream_generator):
    in_think_block = False
    buffer = ""
    think_detected = False
    
    async for chunk in stream_generator:
        if hasattr(chunk, 'choices') and chunk.choices:
            if hasattr(chunk.choices[0], 'delta') and hasattr(chunk.choices[0].delta, 'content'):
                chunk_text = chunk.choices[0].delta.content or ""
            else:
                chunk_text = ""
        else:
            try:
                chunk_text = str(chunk)
            except:
                chunk_text = ""
        
        buffer += chunk_text
        
        if "<think>" in buffer and not in_think_block:
            think_detected = True
            in_think_block = True
            buffer = ""
            continue
        
        if "</think>" in buffer and in_think_block:
            post_think_content = buffer.split("</think>", 1)[1]
            buffer = post_think_content
            in_think_block = False
            
            if buffer:
                yield buffer
                buffer = ""
            continue
            
        if not in_think_block and not think_detected:
            yield chunk_text
            buffer = ""
        
        if in_think_block:
            continue
            
        if not in_think_block and think_detected and buffer:
            yield buffer
            buffer = ""

class ExecutionStep:
    def __init__(self, 
                 step_id: str, 
                 tool_name: str, 
                 tool_args: Dict[str, Any], 
                 description: str = "",
                 depends_on: List[str] = None,
                 parallel_group: str = None,
                 polling_required: bool = False,
                 polling_interval: int = 5,
                 polling_condition: str = ""):
        self.step_id = step_id
        self.tool_name = tool_name
        self.tool_args = tool_args
        self.description = description
        self.depends_on = depends_on or []
        self.parallel_group = parallel_group
        self.executed = False
        self.success = None
        self.result = None
        self.error = None
        self.start_time = None
        self.end_time = None

        self.polling_required = polling_required
        self.polling_interval = polling_interval
        self.polling_condition = polling_condition
        self.polling_iteration = 0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "step_id": self.step_id,
            "tool_name": self.tool_name,
            "tool_args": self.tool_args,
            "description": self.description,
            "depends_on": self.depends_on,
            "parallel_group": self.parallel_group,
            "executed": self.executed,
            "success": self.success,
            "result": self.result,
            "error": self.error,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "polling_required": self.polling_required,
            "polling_interval": self.polling_interval,
            "polling_condition": self.polling_condition,
            "polling_iteration": self.polling_iteration
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ExecutionStep':
        """从字典创建实例"""
        step = cls(
            step_id=data["step_id"],
            tool_name=data["tool_name"],
            tool_args=data["tool_args"],
            description=data.get("description", ""),
            depends_on=data.get("depends_on", []),
            parallel_group=data.get("parallel_group"),
            polling_required=data.get("polling_required", False),
            polling_interval=data.get("polling_interval", 5),
            polling_condition=data.get("polling_condition", "")
        )
        step.executed = data.get("executed", False)
        step.success = data.get("success")
        step.result = data.get("result")
        step.error = data.get("error")
        step.start_time = data.get("start_time")
        step.end_time = data.get("end_time")
        step.polling_iteration = data.get("polling_iteration", 0)
        return step

class ExecutionPlan:
    """执行计划类"""
    def __init__(self, user_query: str):
        self.user_query = user_query
        self.steps: Dict[str, ExecutionStep] = {}
        self.parallel_groups: Dict[str, List[str]] = {}
        self.creation_time = datetime.now().isoformat()
        self.completed = False
    
    def add_step(self, step: ExecutionStep) -> None:
        self.steps[step.step_id] = step
        
        if step.parallel_group:
            if step.parallel_group not in self.parallel_groups:
                self.parallel_groups[step.parallel_group] = []
            self.parallel_groups[step.parallel_group].append(step.step_id)
    
    def get_ready_steps(self) -> List[ExecutionStep]:
        """获取执行的步骤"""
        ready_steps = []
        executed_steps = {step_id for step_id, step in self.steps.items() if step.executed}
        
        for step_id, step in self.steps.items():
            if not step.executed and all(dep in executed_steps for dep in step.depends_on):
                ready_steps.append(step)
        
        return ready_steps
    
    def get_parallel_ready_groups(self) -> List[List[ExecutionStep]]:
        """获取可以并行执行的步骤组"""
        ready_steps = self.get_ready_steps()
        group_steps: Dict[str, List[ExecutionStep]] = {}
        
        for step in ready_steps:
            if step.parallel_group:
                if step.parallel_group not in group_steps:
                    group_steps[step.parallel_group] = []
                group_steps[step.parallel_group].append(step)
        
        complete_groups = []
        for group_name, steps in group_steps.items():
            expected_count = len(self.parallel_groups.get(group_name, []))
            if len(steps) == expected_count:
                complete_groups.append(steps)
        
        for step in ready_steps:
            if not step.parallel_group:
                complete_groups.append([step])
        
        return complete_groups
    
    def update_step_result(self, step_id: str, success: bool, result: Any = None, error: str = None) -> None:
        if step_id in self.steps:
            step = self.steps[step_id]
            step.executed = True
            step.success = success
            step.result = result
            step.error = error
            step.end_time = datetime.now().isoformat()
    
    def is_completed(self) -> bool:
        return all(step.executed for step in self.steps.values())
    
    def get_execution_results(self) -> Dict[str, Any]:
        """获取所有执行结果"""
        results = {}
        for step_id, step in self.steps.items():
            if step.executed:
                results[step_id] = {
                    "success": step.success,
                    "result": step.result,
                    "error": step.error
                }
        return results
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_query": self.user_query,
            "steps": {step_id: step.to_dict() for step_id, step in self.steps.items()},
            "parallel_groups": self.parallel_groups,
            "creation_time": self.creation_time,
            "completed": self.completed
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ExecutionPlan':
        plan = cls(user_query=data["user_query"])
        plan.parallel_groups = data.get("parallel_groups", {})
        plan.creation_time = data.get("creation_time", datetime.now().isoformat())
        plan.completed = data.get("completed", False)
        
        for step_data in data.get("steps", {}).values():
            step = ExecutionStep.from_dict(step_data)
            plan.steps[step.step_id] = step
        
        return plan
    
    def save_to_file(self, file_path: str) -> None:
        """保存执行计划"""
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=2)
    
    @classmethod
    def load_from_file(cls, file_path: str) -> 'ExecutionPlan':
        """从文件加载执行计划"""
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return cls.from_dict(data)
    
    def get_todo_list(self) -> str:
        """生成可读的待办事项列表"""
        todo = []
        todo.append(f"# 执行计划: {self.user_query}")
        todo.append(f"# 创建时间: {self.creation_time}")
        todo.append("")
        
        executed = set()
        remaining = set(self.steps.keys())
        execution_order = []
        
        while remaining:
            next_steps = []
            for step_id in remaining:
                step = self.steps[step_id]
                if all(dep in executed for dep in step.depends_on):
                    next_steps.append(step_id)
            
            if not next_steps:
                break
            
            grouped = {}
            for step_id in next_steps:
                step = self.steps[step_id]
                group = step.parallel_group or f"single_{step_id}"
                if group not in grouped:
                    grouped[group] = []
                grouped[group].append(step_id)
            
            for group, steps in grouped.items():
                if len(steps) > 1:
                    execution_order.append((group, steps))
                else:
                    execution_order.append((None, steps))
                
                for step_id in steps:
                    executed.add(step_id)
                    remaining.remove(step_id)

        step_number = 1
        for group, step_ids in execution_order:
            if group and group.startswith("parallel_"):
                todo.append(f"## 并行组 {group}")
                for step_id in step_ids:
                    step = self.steps[step_id]
                    status = "✓" if step.executed else "□"
                    todo.append(f"{step_number}. [{status}] {step.description or step.tool_name} (ID: {step_id})")
                    todo.append(f"   工具: {step.tool_name}")
                    todo.append(f"   参数: {json.dumps(step.tool_args, ensure_ascii=False)}")
                    if step.executed:
                        result = step.result if step.success else step.error
                        todo.append(f"   结果: {'成功' if step.success else '失败'}")
                        todo.append(f"   详情: {result}")
                    todo.append("")
                    step_number += 1
            else:
                for step_id in step_ids:
                    step = self.steps[step_id]
                    status = "✓" if step.executed else "□"
                    todo.append(f"{step_number}. [{status}] {step.description or step.tool_name} (ID: {step_id})")
                    todo.append(f"   工具: {step.tool_name}")
                    todo.append(f"   参数: {json.dumps(step.tool_args, ensure_ascii=False)}")
                    if step.executed:
                        result = step.result if step.success else step.error
                        todo.append(f"   结果: {'成功' if step.success else '失败'}")
                        todo.append(f"   详情: {result}")
                    todo.append("")
                    step_number += 1
        
        return "\n".join(todo)

class MCPClient:
    """MCP客户端"""
    def __init__(self,
            server_config_path: str,
            model: str = "qwen2.5",
            api_key: str = "ollama",
            base_url: str = "http://localhost:11434/v1/",
            max_tool_calls: int = 10,
            tool_execution_timeout: int = 120,
            similarity_threshold: float = 0.7,
            log_dir: str = "execution_logs"):
        
        self.model = model
        self.api_key = api_key
        self.base_url = base_url
        self.server_config_path = server_config_path
        self.llm_client = None
        self.max_tool_calls = max_tool_calls
        self.tool_execution_timeout = tool_execution_timeout
        self.similarity_threshold = similarity_threshold
        self.log_dir = log_dir
        self._config_loaded = False
        self._config = None

        self.tool_manager = None
        self.tool_executor = None
        self.result_assessor = None
        
        os.makedirs(self.log_dir, exist_ok=True)

    async def initialize(self):
        """初始化客户端、服务器和工具"""
        try:
            await self._load_config()

            self.tool_manager = ToolManager(similarity_threshold=self.similarity_threshold)
            await self.tool_manager.initialize_servers(self._get_config())
            await self.tool_manager.collect_tools()
            
            self.tool_executor = ToolExecutor(tool_execution_timeout=self.tool_execution_timeout)
            
            logger.info("MCPClient 初始化完成")
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
                            temperature: float,
                            history_message: List[Dict[str, Any]] = None,
                            api_key=None,
                            base_url=None,
                            model=None,
                            plan_file=None):
        """
        处理用户查询
        """
        if not self.tool_manager or not self.tool_manager.all_tools:
            raise RuntimeError("客户端未初始化，请先调用 initialize()")
        
        self.api_key = api_key if api_key is not None else self.api_key
        self.base_url = base_url if base_url is not None else self.base_url
        self.model = model if model is not None else self.model

        if not self.api_key or not self.base_url or not self.model:
            error_msg = "错误: API密钥、基础URL或模型名称未设置"
            logger.error(error_msg)
            yield error_msg
            return

        try:
            self.llm_client = OpenAI(api_key=self.api_key, base_url=self.base_url)
            
            self.result_assessor = ResultAssessor(self.llm_client, self.model)
            
            tool_list = []
            for tool in self.tool_manager.all_tools:
                tool_name = tool.get("name", "")
                description = tool.get("description", "")
                tool_list.append({"name": tool_name, "description": description})
            
            tools_json = json.dumps(tool_list, ensure_ascii=False)

            if str(system_prompt.startswith("# 工具调用助手")) == "True":
                needs_tools = await self._check_if_needs_tools(user_query)
                
                if needs_tools:
                    async for chunk in self._execute_workflow(
                        user_query=user_query,
                        temperature=temperature,
                        history_message=history_message,
                        plan_file=plan_file,
                        tools_json=tools_json
                    ):
                        yield chunk
                else:
                    logger.info("问题不需要工具调用")
                    messages = [{"role": "system", "content": f"你是一个助人为乐的助手，你可以使用以下工具:{tools_json}"}]
                    if history_message:
                        messages.extend(history_message)
                    messages.append({"role": "user", "content": user_query})
                    
                    stream_generator = await create_stream_completion(
                        llm_client=self.llm_client,
                        logger=logger,
                        model=self.model,
                        messages=messages,
                        temperature=temperature
                    )
                    async for chunk in stream_generator:
                        yield chunk
            else:
                messages = [{"role": "system", "content": system_prompt}]
                if history_message:
                    messages.extend(history_message)
                messages.append({"role": "user", "content": user_query})
                
                stream_generator = await create_stream_completion(
                    llm_client=self.llm_client,
                    logger=logger,
                    model=self.model,
                    messages=messages,
                    temperature=temperature
                )
                async for chunk in stream_generator:
                        yield chunk

        except Exception as e:
            error_msg = f"处理查询出错: {str(e)}"
            logger.error(error_msg, exc_info=True)
            yield error_msg

    async def _check_if_needs_tools(self, user_query: str) -> bool:
        """使用LLM判断是否需要工具调用"""
        prompt = f"""分析以下用户问题，判断是否需要使用外部工具或API来回答。

    用户问题: {user_query}

    如果问题满足以下任一条件，就需要工具调用:
    1. 需要实时信息(天气、股票、新闻等)
    2. 需要执行计算或数据处理
    3. 需要搜索网络或数据库
    4. 需要生成或处理媒体内容(图像、音频等)
    5. 需要与外部系统交互(发送邮件、消息等)

    如果问题满足以下条件，不需要工具调用:
    1. 仅需要常识或基本知识
    2. 是简单的问候或闲聊
    3. 是请求解释概念或原理
    4. 是对已知信息的总结或分析
    5. 是不需要实时数据的简单问答

    请只回答"需要"或"None"，不要有任何其他解释。
    """
        
        try:
            if not self.llm_client:
                self.llm_client = OpenAI(api_key=self.api_key, base_url=self.base_url)
            
            response = await create_completion(
                llm_client=self.llm_client,
                model=self.model,
                logger=logger,
                messages=[
                    {"role": "system", "content": "你是工具需求分析专家，能够准确判断问题是否需要外部工具"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1
            )
            
            content = response.choices[0].message.content.strip().lower()

            think_pattern = re.compile(r'</think>(.*)', re.DOTALL)
            match = think_pattern.search(content)
            if match:
                content = match.group(1).strip()

            if "需要" in content:
                logger.info(f"LLM判断问题'{user_query}'需要工具调用")
                return True
            else:
                return False
            
        except Exception as e:
            logger.error(f"LLM判断是否需要工具调用出错: {str(e)}")
            return False            

    async def _filter_relevant_tools(self, user_query: str,tools_json) -> List[Dict[str, Any]]:
        """预筛选工具"""

        prompt = f"""分析用户查询，从提供的工具列表中选择最适合完成任务的工具。

    用户查询: {user_query}

    可用工具列表:
    {tools_json}

    选择规则:
    1. 只选择与任务直接相关的工具
    2. 网络搜索工具只有在用户明确需要获取网络信息时才选择
    3. 对于生成类任务(如图像生成)，必须包含提交任务和检查进度的相关工具
    4. 避免选择功能重复的工具
    5. 确保包含所有必要的工具以完成完整的工作流程
    6. 音频、语音工具只有在用户明确需要时才选择

    对于特殊任务的工具选择规则:
    - 图像生成任务：必须包含"generate_image"(提交任务)和"get_image_progress"(检查进度)
    - 语音相关任务：只有在用户明确要求语音功能时才选择相关工具
    - 文件处理任务：包含必要的上传、处理和下载工具
    - 社交媒体任务：必须包含发送和接收消息的工具

    请返回一个JSON数组，包含选中工具的名称:
    ["工具名1", "工具名2", ...]
    """

        try:

            response = await create_completion(
                llm_client=self.llm_client,
                model=self.model,
                logger=logger,
                messages=[
                    {"role": "system", "content": "你是工具选择专家，能够根据用户需求筛选最合适的工具"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1
            )
            
            content = response.choices[0].message.content
            think_pattern = re.compile(r'</think>(.*)', re.DOTALL)
            match = think_pattern.search(content)
            if match:
                content = match.group(1).strip()

            selected_tools = extract_json_from_llm_response(content)
            if not selected_tools or not isinstance(selected_tools, list):
                logger.warning(f"无法解析筛选工具结果，使用所有工具: {content}")
                return self.tool_manager.all_tools
            
            filtered_tools = []
            for tool in self.tool_manager.all_tools:
                tool_name = tool.get("name", "") or (tool.get("function", {}).get("name", ""))
                if tool_name in selected_tools:
                    filtered_tools.append(tool)
            
            if not filtered_tools:
                logger.warning("筛选后没有适合的工具，使用所有工具")
                return self.tool_manager.all_tools
                
            logger.info(f"已筛选工具: {[t.get('name', '') for t in filtered_tools]}")
            return filtered_tools
        
        except Exception as e:
            logger.error(f"筛选工具出错: {str(e)}", exc_info=True)
            return self.tool_manager.all_tools

    async def _create_execution_plan(self, user_query: str,history_message: str,tools_json) -> ExecutionPlan:
        """
        使用LLM创建执行计划
        """
        filtered_tools = await self._filter_relevant_tools(user_query,tools_json)
        
        tool_descriptions = []
        for tool in filtered_tools:
            tool_name = tool.get("name", "")
            description = tool.get("description", "")
            
            parameters = {}
            required = []
            
            if "inputSchema" in tool:
                parameters = tool["inputSchema"].get("properties", {})
                required = tool["inputSchema"].get("required", [])
            elif "function" in tool and "parameters" in tool["function"]:
                parameters = tool["function"]["parameters"].get("properties", {})
                required = tool["function"]["parameters"].get("required", [])
            
            param_descriptions = []
            for param_name, param_info in parameters.items():
                is_required = param_name in required
                param_desc = param_info.get("description", "")
                param_type = param_info.get("type", "")
                param_descriptions.append(f"- {param_name} ({'必填' if is_required else '选填'}): {param_desc} (类型: {param_type})")
            
            tool_descriptions.append(
                f"工具名称: {tool_name}\n"
                f"描述: {description}\n"
                f"参数:\n" + "\n".join(param_descriptions)
            )
        
        tools_text = "\n\n".join(tool_descriptions)
        
        prompt = f"""分析用户查询，创建一个详细的执行计划，包括工具选择、参数设置和执行顺序。

    用户查询: {user_query}

    用户的历史记录: {history_message}

    可用工具:
    {tools_text}

    请创建一个执行计划，包括以下内容:
    1. 确定需要执行的工具操作
    2. 设置每个操作的参数
    3. 确定操作之间的依赖关系
    4. 标记可以并行执行的操作
    5. 标记需要轮询的操作（对于那些可能需要多次查询才能获得最终结果的任务）

    重要说明: 当一个步骤需要使用前一个步骤的结果时，请使用方括号占位符格式，例如 [占位符名称]。
    例如: step_1查询了武汉天气，step_3需要发送这个信息，应设置 "message": "武汉的天气是: [武汉天气]"

    关于轮询操作:
    某些工具操作（如检查异步任务进度、查询长时间运行的任务状态等）可能需要多次执行直到获得最终结果。对于这类步骤，请设置 polling_required 为 true。

    返回JSON格式:
    {{
    "steps": [
        {{
        "step_id": "唯一标识符",
        "tool_name": "工具名称",
        "tool_args": {{
            "参数名": "参数值或带占位符的字符串"
        }},
        "description": "步骤描述",
        "depends_on": ["依赖的步骤ID列表"],
        "parallel_group": "并行组标识符(可选)",
        "polling_required": false,
        "polling_interval": 5,
        "polling_condition": ""
        }}
    ]
    }}

    注意事项:
    1. 每个步骤必须有唯一的step_id
    2. 所有必需参数都必须提供
    3. depends_on指定步骤依赖的其他步骤ID
    4. 可以并行执行的步骤应该有相同的parallel_group值(例如"parallel_1")
    5. 没有依赖关系的步骤可以有空的depends_on数组
    6. 确保没有循环依赖
    7. 只使用必要的工具来完成任务
    8. 对于依赖前面步骤结果的参数，使用清晰的占位符如 [武汉天气]、[股票信息] 等
    9. 依赖关系和占位符必须一致，如果step_3依赖step_1的结果，step_3中的参数应该使用与step_1相关的占位符
    10. 除非用户明确需要，否则不要使用与音频、语音相关的工具
    11. 对于检查任务状态、查询进度等操作，考虑将其标记为需要轮询的步骤
    12. 除非用户明确要求，否则不要使用网络搜索相关的工具
    """

        try:
            response = await create_completion(
                llm_client=self.llm_client,
                model=self.model,
                logger=logger,
                messages=[
                    {"role": "system", "content": "你是执行计划专家，擅长分析复杂任务并设计最优执行流程"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1
            )
            
            content = response.choices[0].message.content
            think_pattern = re.compile(r'</think>(.*)', re.DOTALL)
            match = think_pattern.search(content)
            if match:
                content = match.group(1).strip()

            logger.info(f"执行计划LLM响应: {content}")
            
            plan_data = extract_json_from_llm_response(content)
            if not plan_data or "steps" not in plan_data:
                logger.error(f"无法解析执行计划: {content}")
                return ExecutionPlan(user_query)
            
            execution_plan = ExecutionPlan(user_query)
            
            for step_data in plan_data["steps"]:
                tool_name = step_data["tool_name"]
                
                step = ExecutionStep(
                    step_id=step_data["step_id"],
                    tool_name=tool_name,
                    tool_args=step_data["tool_args"],
                    description=step_data.get("description", ""),
                    depends_on=step_data.get("depends_on", []),
                    parallel_group=step_data.get("parallel_group"),
                    polling_required=step_data.get("polling_required", False),
                    polling_interval=step_data.get("polling_interval", 5),
                    polling_condition=step_data.get("polling_condition", "")
                )
                execution_plan.add_step(step)
            
            valid_step_ids = set(execution_plan.steps.keys())
            
            for step_id, step in execution_plan.steps.items():
                step.depends_on = [dep for dep in step.depends_on if dep in valid_step_ids]
            
            return execution_plan
        except Exception as e:
            logger.error(f"创建执行计划出错: {str(e)}", exc_info=True)
            return ExecutionPlan(user_query)

    async def _execute_workflow(self, 
                            user_query: str, 
                            temperature: float, 
                            tools_json,
                            history_message: List[Dict[str, Any]] = None,
                            plan_file: str = None):
        """
        执行工具调用工作流
        1. 分析用户问题
        2. 生成执行计划
        3. 按计划执行工具
        4. 输出最终总结
        """
        self.execution_plan = None
        plan_created = False
        
        if plan_file and os.path.exists(plan_file):
            try:
                self.execution_plan = ExecutionPlan.load_from_file(plan_file)
                yield f"从文件加载执行计划: {plan_file}\n"
                
                todo_list = self.execution_plan.get_todo_list()
                yield f"执行计划详情:\n{todo_list}\n"
            except Exception as e:
                logger.error(f"加载执行计划失败: {str(e)}")
                yield f"加载执行计划失败: {str(e)}\n"
                self.execution_plan = None
        
        if not self.execution_plan:
            self.execution_plan = await self._create_execution_plan(user_query,history_message,tools_json)
            plan_created = True
            
            plan_file = os.path.join(self.log_dir, f"plan_{user_query}.json")
            self.execution_plan.save_to_file(plan_file)
            
            todo_list = self.execution_plan.get_todo_list()
            yield f"执行计划详情:\n{todo_list}\n"
        
        execution_results = {}
        
        iteration = 0
        while not self.execution_plan.is_completed() and iteration < MAX_ITERATIONS:
            iteration += 1
            logger.info(f"当前工具执行次数 {iteration}/{MAX_ITERATIONS}")
            
            ready_groups = self.execution_plan.get_parallel_ready_groups()
            if not ready_groups:
                logger.info("没有可执行的步骤，终止执行")
                break
            
            for group in ready_groups:
                for step in group:
                    step.start_time = datetime.now().isoformat()
                    logger.info(f"开始执行步骤 {step.step_id}: {step.tool_name}")
                
                if len(group) == 1:
                    step = group[0]
                    success, result, error = await self._execute_step(step, execution_results,history_message)
                    
                    self.execution_plan.update_step_result(step.step_id, success, result if success else None, None if success else error)
                    execution_results[step.step_id] = {"success": success, "result": result if success else None, "error": None if success else error}
                    
                    assessment = await self._evaluate_step_result(step, result if success else error, success)
                    
                    polling_info = f"(轮询 {step.polling_iteration} 次)" if step.polling_required else ""
                    yield f"执行步骤 {step.step_id} ({step.tool_name}) {polling_info}: {'成功' if success else '失败'}\n"
                    yield f"结果: {result if success else error}\n"
                    yield f"评估: {assessment}\n\n"
                else:
                    tasks = []
                    steps_with_processed_args = {}
                    
                    for step in group:
                        tool = self._find_tool(step.tool_name)
                        if not tool:
                            async def error_task(step_id, tool_name):
                                return (step_id, False, None, f"找不到工具: {tool_name}")
                            tasks.append(asyncio.create_task(error_task(step.step_id, step.tool_name)))
                            steps_with_processed_args[step.step_id] = step.tool_args
                        else:
                            processed_args = await self._process_args_with_llm(step, execution_results,history_message)
                            steps_with_processed_args[step.step_id] = processed_args
                            step.tool_args = processed_args
                            
                            if step.polling_required:
                                async def execute_polling_task(step_id, step, tool, execution_results):
                                    try:
                                        success, result, error = await self._execute_polling_step(step, tool, execution_results)
                                        return (step_id, success, result, error)
                                    except Exception as e:
                                        return (step_id, False, None, f"执行出错: {str(e)}")
                                
                                tasks.append(asyncio.create_task(execute_polling_task(step.step_id, step, tool, execution_results)))
                            else:
                                async def execute_task(step_id, tool, tool_name, args):
                                    try:
                                        result = await self.tool_executor.execute_tool(tool, tool_name, args)
                                        return (step_id, True, result, None)
                                    except Exception as e:
                                        return (step_id, False, None, f"执行出错: {str(e)}")
                                
                                tasks.append(asyncio.create_task(execute_task(step.step_id, tool, step.tool_name, processed_args)))
                    
                    results = await asyncio.gather(*tasks)
                    
                    for step_id, success, result, error in results:
                        step = self.execution_plan.steps[step_id]
                        
                        self.execution_plan.update_step_result(step_id, success, result, error)
                        execution_results[step_id] = {"success": success, "result": result, "error": error}
                        
                        assessment = await self._evaluate_step_result(step, result if success else error, success)
                        
                        polling_info = f"(轮询 {step.polling_iteration} 次)" if step.polling_required else ""
                        yield f"执行步骤 {step_id} ({step.tool_name}) {polling_info}: {'成功' if success else '失败'}\n"
                        yield f"结果: {result if success else error}\n"
                        yield f"评估: {assessment}\n\n"
            
            if plan_file:
                self.execution_plan.save_to_file(plan_file)
        
        self.execution_plan.completed = self.execution_plan.is_completed()
        if plan_file:
            self.execution_plan.save_to_file(plan_file)
            
            if plan_created:
                result_file = os.path.join(self.log_dir, f"results_{user_query}.txt")
                with open(result_file, 'w', encoding='utf-8') as f:
                    f.write(self.execution_plan.get_todo_list())
        
        execution_results = self.execution_plan.get_execution_results()
        
        async for chunk in self._generate_check(user_query, execution_results, temperature,history_message):
            yield chunk

    async def _process_args_with_llm(self, step: ExecutionStep, execution_results: Dict[str, Any], history_message: str) -> Dict[str, Any]:
        """
        处理工具参数
        """
        args = step.tool_args
        processed_args = args.copy()
        
        placeholder_pattern = r'\[(.*?)\]'
        import re
        
        has_placeholders = False
        for key, value in args.items():
            if isinstance(value, str) and re.search(placeholder_pattern, value):
                has_placeholders = True
                break
        
        if not has_placeholders:
            return processed_args
        
        logger.info(f"步骤 {step.step_id} 的参数中检测到占位符，使用LLM生成新参数")
        
        previous_results_text = ""
        for prev_step_id, result_data in execution_results.items():
            success = result_data.get("success", False)
            if not success:
                continue
            
            result = result_data.get("result", "")
            try:
                result_text = ""
                if hasattr(result, "content") and isinstance(result.content, list):
                    for item in result.content:
                        if hasattr(item, "text"):
                            result_text += item.text + "\n"
                else:
                    result_text = str(result)
                
                previous_results_text += f"步骤 {prev_step_id} 结果:\n{result_text}\n\n"
            except:
                previous_results_text += f"步骤 {prev_step_id} 结果: {str(result)}\n\n"
        
        prompt = f"""请根据之前步骤的执行结果，为当前工具调用生成准确的参数值。

用户原始问题: {self.execution_plan.user_query}

当前步骤信息
- 步骤ID: {step.step_id}
- 工具名称: {step.tool_name}
- 参数(含占位符): 
{json.dumps(step.tool_args, ensure_ascii=False, indent=2)}

之前步骤的执行结果:
{previous_results_text}

任务说明:
你需要替换参数中的占位符文本（如[LLM中的MCP技术搜索结果总结]）为真实内容。

具体操作流程:
1. 识别当前参数中需要替换的占位符（方括号[]中的内容）
2. 从之前步骤的执行结果中提取相关信息
3. 基于提取的信息生成合适的内容替换占位符
4. 保持原始JSON结构，只替换占位符部分

输出要求:
- 仅返回完整的JSON格式参数，不要包含其他说明
- 不要修改JSON键名，只替换值中的占位符
- 确保JSON格式有效，特殊字符需正确转义
- 不要添加额外的字段或注释

例如，如果参数中有 "message": "搜索结果：[搜索结果摘要]"，你应该将[搜索结果摘要]替换为从之前步骤中提取的实际摘要内容。
"""
        try:
            if not self.llm_client:
                logger.error("LLM客户端未初始化，无法生成新参数")
                return processed_args
            
            response = await create_completion(
                llm_client=self.llm_client,
                model=self.model,
                logger=logger,
                messages=[
                    {"role": "system", "content": "你是参数优化专家，擅长根据上下文生成准确的参数值，确保生成的参数是有效的JSON格式"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1
            )
            
            content = response.choices[0].message.content
            logger.info(f"LLM生成的参数内容: {content}")
            
            new_params = extract_json_from_llm_response(content)
                
            if not new_params:
                logger.error(f"无法解析LLM生成的参数: {content}")
                return processed_args

            if "message" in new_params and isinstance(new_params["message"], str):
                logger.info("已处理包含message字段的参数")
            
            return new_params
        except Exception as e:
            logger.error(f"使用LLM处理参数时出错: {str(e)}")
            return processed_args
    
    async def _execute_plan(self, plan: ExecutionPlan) -> Dict[str, Any]:
        """
        执行计划
        """
        execution_results = {}
        
        iteration = 0
        while not plan.is_completed() and iteration < MAX_ITERATIONS:
            iteration += 1
            logger.info(f"执行迭代 {iteration}/{MAX_ITERATIONS}")
            
            ready_groups = plan.get_parallel_ready_groups()
            if not ready_groups:
                logger.info("没有可执行的步骤，终止执行")
                break
            
            for group in ready_groups:
                for step in group:
                    step.start_time = datetime.now().isoformat()
                    logger.info(f"开始执行步骤 {step.step_id}: {step.tool_name}")
                
                if len(group) == 1:
                    step = group[0]
                    try:
                        tool = self._find_tool(step.tool_name)
                        if not tool:
                            result = f"找不到工具: {step.tool_name}"
                            success = False
                        else:
                            processed_args = self._process_args_with_context(step.tool_args, execution_results)
                            result = await self.tool_executor.execute_tool(tool, step.tool_name, processed_args)
                            success = True
                    except Exception as e:
                        result = f"执行出错: {str(e)}"
                        success = False
                    
                    plan.update_step_result(step.step_id, success, result if success else None, None if success else result)
                    execution_results[step.step_id] = {"success": success, "result": result if success else None, "error": None if success else result}
                    
                    assessment = await self._evaluate_step_result(step, result, success)
                    
                    yield f"执行步骤 {step.step_id} ({step.tool_name}): {'成功' if success else '失败'}\n"
                    yield f"结果: {result}\n"
                    yield f"评估: {assessment}\n\n"
                else:
                    tasks = []
                    
                    for step in group:
                        tool = self._find_tool(step.tool_name)
                        if not tool:
                            async def error_task(step_id, tool_name):
                                return (step_id, False, None, f"找不到工具: {tool_name}")
                            tasks.append(asyncio.create_task(error_task(step.step_id, step.tool_name)))
                        else:
                            processed_args = self._process_args_with_context(step.tool_args, execution_results)
                            
                            async def execute_task(step_id, tool, tool_name, args):
                                try:
                                    result = await self.tool_executor.execute_tool(tool, tool_name, args)
                                    return (step_id, True, result, None)
                                except Exception as e:
                                    return (step_id, False, None, f"执行出错: {str(e)}")
                            
                            tasks.append(asyncio.create_task(execute_task(step.step_id, tool, step.tool_name, processed_args)))
                    
                    results = await asyncio.gather(*tasks)
                    
                    for step_id, success, result, error in results:
                        plan.update_step_result(step_id, success, result, error)
                        execution_results[step_id] = {"success": success, "result": result, "error": error}
                        
                        step = plan.steps[step_id]
                        
                        assessment = await self._evaluate_step_result(step, result if success else error, success)
                        
                        yield f"执行步骤 {step_id} ({step.tool_name}): {'成功' if success else '失败'}\n"
                        yield f"结果: {result if success else error}\n"
                        yield f"评估: {assessment}\n\n"

    
    async def _evaluate_step_result(self, step: ExecutionStep, result: Any, success: bool) -> str:
        """评估步骤执行结果"""
        if not self.result_assessor:
            return "无法评估结果(评估器未初始化)"
        
        try:
            assessment = await self.result_assessor.assess_tool_result(
                user_query="",
                tool_name=step.tool_name,
                tool_args=step.tool_args,
                result=result,
                all_previous_results=[]
            )
            
            formatted = f"满足度: {assessment.get('satisfaction_level', '不满足需求')} " + \
                        f"(置信度: {assessment.get('confidence', 0.0)})\n" + \
                        f"原因: {assessment.get('reason', '')}"
            
            return formatted
        except Exception as e:
            logger.error(f"评估结果出错: {str(e)}")
            return f"评估失败: {str(e)}"
    
    def _find_tool(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """查找工具"""
        for tool in self.tool_manager.all_tools:
            if ("name" in tool and tool["name"] == tool_name) or \
               ("function" in tool and tool["function"]["name"] == tool_name):
                return tool
        return None
    
    def _process_args_with_context(self, args: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """处理工具参数，替换结果引用"""
        processed_args = {}
        
        for key, value in args.items():
            if isinstance(value, str) and value.startswith("${") and value.endswith("}"):
                ref_key = value[2:-1]
                if ref_key in context:
                    result_data = context[ref_key]
                    if isinstance(result_data, dict) and "result" in result_data:
                        processed_args[key] = result_data["result"]
                    else:
                        processed_args[key] = result_data
                else:
                    processed_args[key] = f"引用错误: {ref_key}不存在"
            else:
                processed_args[key] = value
        
        return processed_args
    
    async def _generate_check(self, user_query: str, execution_results: Dict[str, Any], temperature: float, history_message: str):
        """生成检查总结"""
        results_text = ""
        for step_id, result in execution_results.items():
            success = result.get("success", False)
            result_content = result.get("result") if success else result.get("error")
            results_text += f"步骤 {step_id}: {'成功' if success else '失败'}\n"
            results_text += f"结果: {result_content}\n\n"
        
        prompt = f"""根据以下执行结果，检查最后输出的内容是否符合安全标准并生成适当回答。

用户原始问题:
{user_query}

用户的历史记录: {history_message}

执行结果:
{results_text}

请仔细检查内容是否符合法律和道德规范。内容不应包含:
1. 违法内容(如制作武器、毒品、黑客工具等指南)
2. 侵犯隐私内容
3. 仇恨言论或歧视内容
4. 成人、淫秽或色情内容
5. 暴力或恐怖内容
6. 欺诈或误导性内容

处理规则:
1. 优先考虑最后一步的执行结果:
   - 如果最后一步执行结果(如step_2, step_3等执行链的最后一步)已经完整解决了用户问题，请直接原封不动地输出该步骤的结果内容
   - 无需进行任何格式调整、总结或改写，直接输出最后步骤的content字段内容

2. 仅在以下情况下处理结果:
   - 最后一步执行结果不完整或无法解决用户问题
   - 执行结果包含不适当内容需要修改

3. 安全检查:
   - 如果发现内容包含不适当内容且可以安全修改，请修改后输出
   - 如果包含不适当内容且无法安全修改，请只输出："不好意思。根据规则，当前的执行结果不允许输出。"

4. 输出原则:
   - 始终优先考虑原始输出，尤其是最后一步的执行结果
   - 不要添加任何与执行结果无关的内容
   - 不要创造执行结果中不存在的信息
   - 保持简洁性和可读性
   - 不要在输出中解释或提及执行过程
"""
        yield "最终结果:"
        stream_generator = await create_stream_completion(
            llm_client=self.llm_client,
            logger=logger,
            model=self.model,
            messages=[
                {"role": "system", "content": "你是一个专业的内容检查助手"},
                {"role": "user", "content": prompt}
            ],
            temperature=temperature
        )

        async for chunk in filter_stream(stream_generator):
            yield chunk
    
    async def _execute_step(self, step: ExecutionStep, execution_results: Dict[str, Any],history_message: str) -> Tuple[bool, Any, str]:
        """执行单个步骤，支持轮询模式"""
        try:
            tool = self._find_tool(step.tool_name)
            if not tool:
                return False, None, f"找不到工具: {step.tool_name}"
            
            processed_args = await self._process_args_with_llm(step, execution_results,history_message)
            
            step.tool_args = processed_args
            
            if step.polling_required:
                return await self._execute_polling_step(step, tool, execution_results)
            else:
                result = await self.tool_executor.execute_tool(tool, step.tool_name, processed_args)
                return True, result, None
        except Exception as e:
            return False, None, f"执行出错: {str(e)}"

    async def _execute_polling_step(self, step: ExecutionStep, tool: Dict[str, Any], execution_results: Dict[str, Any]) -> Tuple[bool, Any, str]:
        """执行需要轮询的步骤，直到满足结束条件或达到最大迭代次数"""
        MAX_POLLING_ITERATIONS = MAX_ITERATIONS
        poll_count = 0
        last_result = None
        last_error = None
        
        logger.info(f"开始轮询执行步骤 {step.step_id}: {step.tool_name}")
        
        while poll_count < MAX_POLLING_ITERATIONS:
            poll_count += 1
            step.polling_iteration = poll_count
            
            try:
                result = await self.tool_executor.execute_tool(tool, step.tool_name, step.tool_args)
                last_result = result
                
                is_completed = await self._check_polling_condition(step, result, execution_results)
                
                if is_completed:
                    logger.info(f"轮询步骤 {step.step_id} 已完成，共执行 {poll_count} 次")
                    return True, result, None
                
                await asyncio.sleep(step.polling_interval)
                
            except Exception as e:
                last_error = f"轮询执行出错: {str(e)}"
                logger.error(f"轮询步骤 {step.step_id} 执行失败: {last_error}")
                return False, None, last_error
        
        if last_result:
            logger.warning(f"轮询步骤 {step.step_id} 达到最大轮询次数 {MAX_POLLING_ITERATIONS}，返回最后结果")
            return True, last_result, None
        else:
            return False, None, last_error or f"轮询步骤 {step.step_id} 达到最大轮询次数 {MAX_POLLING_ITERATIONS} 但未获得有效结果"

    async def _check_polling_condition(self, step: ExecutionStep, result: Any, execution_results: Dict[str, Any]) -> bool:
        """检查轮询结果是否满足结束条件"""
        if not step.polling_condition:
            return await self._check_polling_condition_with_llm(step, result, execution_results)
        
        try:
            result_str = str(result)
            
            completion_keywords = ["completed", "finished", "done", "success", "complete", 
                                "完成", "成功", "结束", "就绪", "100%"]
            
            for keyword in completion_keywords:
                if keyword.lower() in result_str.lower():
                    return True
            
            if isinstance(result, dict):
                status = result.get("status", "").lower()
                state = result.get("state", "").lower()
                progress = result.get("progress", 0)
                
                if status in ["completed", "success", "done", "完成", "成功"] or \
                state in ["completed", "success", "done", "完成", "成功"] or \
                progress == 100 or progress == "100%":
                    return True
            
            return False
        except Exception as e:
            logger.error(f"检查轮询条件出错: {str(e)}")
            return False

    async def _check_polling_condition_with_llm(self, step: ExecutionStep, result: Any, execution_results: Dict[str, Any]) -> bool:
        """使用LLM判断轮询是否完成"""
        prompt = f"""
        请判断以下任务结果是否表明任务已完成，无需继续轮询。
        
        步骤ID: {step.step_id}
        工具名称: {step.tool_name}
        当前轮询次数: {step.polling_iteration}
        
        当前结果:
        {result}
        
        请只输出:已完成/未完成
        不要有任何其他解释。
        """
        
        try:
            response = await create_completion(
                llm_client=self.llm_client,
                model=self.model,
                logger=logger,
                messages=[
                    {"role": "system", "content": "你是轮询判断专家，能准确判断任务是否已完成"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1
            )
            
            content = response.choices[0].message.content.strip().lower()
            return "已完成" in content or "完成" in content or "done" in content or "completed" in content
        except Exception as e:
            logger.error(f"使用LLM判断轮询条件出错: {str(e)}")
            return False

    def get_tools_json(self):
        """
        获取JSON格式的工具信息
        """
        if not self.tool_manager:
            raise RuntimeError("客户端未初始化，请先调用 initialize()")

        return self.tool_manager.get_tools_json()

    async def tool_test(self, 
                        tool_name: str, 
                        api_key: str,
                        base_url: str,
                        model: str,
                        **kwargs):
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
            llm_client=OpenAI(api_key=api_key,base_url=base_url)
            tools = [self.tool_manager.convert_tool(tool)]

            messages = [
                {"role": "system", "content": prompt},
                {"role": "user", "content": ""}
            ]
            response = await create_completion(
                logger=logger,
                llm_client=llm_client,
                model=model,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                temperature=0.7
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

    async def cleanup(self):
        """清理客户端资源"""
        try:
            if self.tool_manager:
                await self.tool_manager.close_servers()

            self.llm_client = None
            self.tool_manager = None
            self.tool_executor = None
            self.result_assessor = None

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