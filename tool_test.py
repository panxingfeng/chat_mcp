from chat_mcp.tools.AudioGenerator import AudioGenerator

if __name__ == "__main__":
    generator = AudioGenerator(output_dir="output")

    # 从音频文件生成
    try:
        output_path = generator.generate_from_audio(
            "data/胡桃.wav",
            "你好啊，我叫小Q"
        )
    except Exception as e:
        print(f"音频生成过程出错: {e}")