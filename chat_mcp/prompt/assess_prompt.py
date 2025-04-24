ASSESS_PROMPT = """
## 评估任务
请根据工具执行情况和历史记录，判断用户问题是否已完全解决。

## 用户原始问题
{user_query}

## 已执行工具历史
{previous_context}

## 当前工具执行详情
工具名称: {tool_name}  
输入参数: {input_args}
执行结果: {result}
执行状态: {message3}

## 评估标准
1. 对比工具参数与用户需求，判断参数是否准确匹配需求
2. 分析工具结果是否完整解决了对应子任务
3. 综合已执行工具历史，判断是否还有需要调用工具的子任务
4. 置信度仅基于参数与结果的匹配程度（0.7-1.0）

## 重要判断规则
- 分析未完成任务的性质:
  - 如果是"数据获取类"任务（如搜索、查询、计算等），则需要调用工具
  - 如果是"总结、分析、建议类"任务（如总结信息、给建议、做推荐等），则无需调用工具
  - 基于工具结果进行解释和回答的任务，无需再调用其他工具

## 输出要求  
工具结果评估: [完全解决/部分解决/未解决]
参数匹配度: [0.7-1.0]
原因分析: [简明说明评估依据]
是否需要其他工具: [是/否] 
   - 判断依据: 
     1. 若还有需要获取数据的子任务未完成，则需要其他工具（是）
     2. 若仅剩分析总结类任务（如建议、推荐、解释已获取数据），则不需要其他工具（否）

{message1}
{message2}
"""


TASK_COMPLETION_PROMPT = """
请评估当前任务是否已经完成：

工具名称: {tool_name}
执行结果: {result}
是否出错: {has_error}
已执行工具: {previous_tools}
用户查询: {user_query}

请基于以下角度判断：
1. 此工具执行是否成功
2. 当前工具解决了用户问题的哪些部分
3. 结合已执行工具，是否还需要其他工具

返回JSON格式：
{{
    "is_complete": boolean,
    "reason": "判断理由",
    "next_step": "建议下一步操作"
}}
"""

POST_PROCESSING_PROMPT = """
请对评估结果进行后处理校正：

当前评估结果: {assessment}
工具名称: {tool_name}
执行结果: {result}
是否出错: {has_error}
已执行工具: {previous_tools}
用户查询: {user_query}

后处理规则：
1. 检查评估结果是否合理
2. 特别注意是否只剩下总结、建议类任务
3. 验证置信度是否合理
4. 确认是否需要更多工具
5. 对于异步任务（任务提交、进度查询等）：
   - 如果结果包含"任务ID"、"进度"、"生成中"等字样
   - 必须设置need_more_tools为true，以确保任务完成
6. 如果置信结果返回的相关的url信息(图像、文件、视频、音频等)，请设置confidence为更高值，除非还有继续的工具执行
7. satisfaction_level的值根据当前工具的执行结果，是否满足用户的需求来判断
8. 如果之前执行的工具返回了错误的结果，请设置need_more_tools为false

返回JSON格式（只返回需要修改的字段）：
{{
    "satisfied": boolean,
    "satisfaction_level": "满足全部需求/满足部分需求/不满足需求",
    "need_more_tools": boolean,
    "problem_solved": boolean,
    "final_confidence": 0.0-1.0,
    "confidence": 0.0-1.0,
    "next_tool_suggestion": "建议的下一个工具"
}}
"""

TASK_TYPE_ANALYSIS_PROMPT = """
分析剩余任务的类型：

用户查询: {user_query}
工具名称: {tool_name}
执行结果: {result}
评估原因: {reason}

请判断剩余任务是否仅包含总结、建议、分析类任务。

返回JSON格式：
{{
    "only_summary": boolean,
    "has_action_task": boolean,
    "task_types": ["任务类型列表"],
    "analysis": "分析结果"
}}
"""


FINAL_STATE_PROMPT = """
综合评估所有工具执行结果，判断用户问题是否已得到解决：

用户原始问题: {user_query}
所有工具执行结果:
{tools_context}

## 特别注意异步任务处理
1. 对于图像生成、文件处理等异步任务：
   - 如果结果中包含"任务ID"、"进度"、"生成中"等关键词
   - 如果最后一个工具的结果显示任务尚未完成
   - 如果需要继续等待或查询结果
   这些情况下，必须将need_more_tools设为true

2. 只有在以下情况才能将need_more_tools设为false：
   - 问题已完全解决
   - 确认没有任何工具可以继续推进解决方案
   - 工具执行出错且无法恢复

请进行综合分析并返回JSON格式：
{{
    "problem_solved": boolean,
    "solution_level": "已解决/部分解决/未解决",
    "confidence": 0.0-1.0,
    "reason": "详细原因",
    "need_more_tools": boolean,
    "generate_final": boolean,
    "remaining_tasks": ["剩余任务列表"],
    "analysis": "综合分析结果"
}}
"""
