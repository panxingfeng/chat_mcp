from .ComfyuiServer import ComfyuiServer

async def serve(server_url: str = None):
    """启动 ComfyUI 图像生成服务器"""
    server = ComfyuiServer(server_url=server_url)
    await server.run_server()

def main():
    """MCP Image Generator Server - 图像生成功能"""
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(
        description="给模型提供生成图像的能力"
    )
    parser.add_argument("--server-url", type=str, help="ComfyUI服务器URL", default="127.0.0.1:8188")
    args = parser.parse_args()

    asyncio.run(serve(server_url=args.server_url))

if __name__ == "__main__":
    main()