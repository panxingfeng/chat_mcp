from chat_mcp.mcp_server.mcp_server_summary.SummarySever import serve


def main():
    """内容摘要 MCP 服务器 - 为模型提供文本摘要能力"""
    import argparse
    import asyncio
    
    parser = argparse.ArgumentParser(
        description="给模型提供内容摘要能力的 MCP 服务器"
    )
    parser.add_argument("--default-style", default="标准风格",
                        help="默认使用的摘要风格")
    parser.add_argument("--llm-url", default="http://localhost:11434/v1",
                        help="LLM 服务 URL，默认使用 Ollama")
    parser.add_argument("--llm-key", default="ollama",
                        help="LLM 服务的 API 密钥")
    parser.add_argument("--model", default="qwen2.5",
                        help="LLM 模型名称")
    args = parser.parse_args()

    asyncio.run(serve(
        default_style=args.default_style,
        llm_url=args.llm_url,
        llm_key=args.llm_key,
        model=args.model
    ))


if __name__ == "__main__":
    main()