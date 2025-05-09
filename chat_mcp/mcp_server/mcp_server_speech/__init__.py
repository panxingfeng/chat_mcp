from .SpeechServer import serve


def main():
    """MCP Audio Generator Server - 语音生成功能"""
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(
        description="给模型提供生成语音的能力"
    )
    parser.add_argument("--server-url", type=str, help="Gradio服务器URL")
    parser.add_argument("--llm-url", default="http://localhost:11434/v1",
                        help="LLM 服务 URL，默认使用 Ollama")
    parser.add_argument("--llm-key", default="ollama",
                        help="LLM 服务的 API 密钥")
    parser.add_argument("--model", default="qwen2.5",
                        help="LLM 模型名称")
    args = parser.parse_args()

    asyncio.run(serve(
        server_url=args.server_url,
        llm_url=args.llm_url,
        llm_key=args.llm_key,
        model=args.model
        ))


if __name__ == "__main__":
    main()