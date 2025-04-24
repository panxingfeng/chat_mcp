from .WeatherServer import serve


def main():
    """MCP Weather Server"""
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(
        description="给模型提供查询天气信息的能力"
    )
    parser.add_argument("--api-key", type=str, help="高德地图天气API密钥")
    args = parser.parse_args()

    asyncio.run(serve(api_key=args.api_key))


if __name__ == "__main__":
    main()