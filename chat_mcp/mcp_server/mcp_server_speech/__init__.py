from .SpeechServer import serve


def main():
    """MCP Audio Generator Server - 语音生成功能"""
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(
        description="给模型提供生成语音的能力"
    )
    parser.add_argument("--server-url", type=str, help="Gradio服务器URL")
    args = parser.parse_args()

    asyncio.run(serve(server_url=args.server_url))


if __name__ == "__main__":
    main()