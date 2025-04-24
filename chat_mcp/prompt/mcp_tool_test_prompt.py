MCP_TOOL_TEST_PROMPT = """
这是工具名称:{tool_name}
这是接收到参数:{kwargs}
重要：你必须仅使用以下精确的JSON对象格式回应，不要有其他内容且不要修改任何的参数值：

{{
    "tool": "工具名称",
    "arguments": {{
        "参数名称": "值"
    }}
}}
"""