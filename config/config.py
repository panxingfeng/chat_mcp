"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║                         chat_mcp配置文件                                 ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import os
from chat_mcp.utils.get_project_root import get_project_root

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                            基础项目设置                                    ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

# 项目路径设置
CURRENT_DIR = get_project_root()  # 项目根目录(识别项目根目录的main.py的位置)

# 服务器设置
URL_PORT = 8007  # 端口号 - 项目启动/音频文件URL信息的端口号
MAX_ITERATIONS = 15  # 单工具最大迭代次数
MAX_TOOL_RETRIES = 3  # 工具最大重试次数(上一个成功，下一个失败(防止持续循环失败)，重新执行上一个 的次数)

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                            音频生成配置                                    ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

# TTS 服务器设置
DEFAULT_SERVER_URL = "http://localhost:7860/"  # index_tts客户端地址
DEFAULT_OUTPUT_DIR = os.path.join(CURRENT_DIR, "output")  # 输出音频文件目录

# 角色语音克隆配置
# 格式: "角色名称": 音频文件路径
CHARACTER_AUDIO_MAP = {
    "胡桃": os.path.join(CURRENT_DIR, "data", "胡桃.wav"),
    # 可以添加更多角色
}

# ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
# ┃                            图像生成配置                                    ┃
# ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

# ComfyUI 路径设置
COMFYUI_PATH = "F:\\ComfyUI-aki-v1.6\\ComfyUI"  # ComfyUI主程序路径
COMFYUI_MODEL_PATH = "models\\checkpoints"  # 模型路径
COMFYUI_LORA_PATH = "models\\Lora"  # LoRA模型路径

# 默认模型设置  
BASE_MODEL = "万能_dreamshaper.safetensors"  # 基础模型名称
BASE_LORA_MODE = ""  # 基础LoRA模型名称

# 提示词设置
QUALITY_PROMPTS = """
masterpiece, best quality, highly detailed, 8k uhd, perfect composition, 
professional lighting, high quality, ultra-detailed, sharp focus, high resolution, 
detailed, award winning, stunning, breathtaking, remarkable, beautiful, 
intricate details, ultra realistic, photorealistic quality, cinematic lighting, 
dramatic lighting, excellent composition
"""

NEGATIVE_PROMPTS = """
nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, 
extra digit, fewer digits, cropped, worst quality, low quality, 
normal quality, jpeg artifacts, watermark, signature, username, blurry
"""