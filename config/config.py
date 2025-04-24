import os
from chat_mcp.utils.get_project_root import get_project_root

DEFAULT_SERVER_URL = "http://localhost:7860/" # index_tts客户端地址
DEFAULT_OUTPUT_DIR = "output" # 输出音频文件目录(基于项目根目录下的相对路径)

CURRENT_DIR = get_project_root() # 项目根目录(识别项目根目录的main.py的位置)

# 语音克隆原文件文件存放目录
# 例如： "角色名字": os.path.join(CURRENT_DIR, "data", "音频文件"),
CHARACTER_AUDIO_MAP = {
    "胡桃": os.path.join(CURRENT_DIR, "data", "胡桃.wav"),
}


URL_PORT = 8007  # 端口号  项目启动/音频文件URL信息的端口号

COMFYUI_PATH = "F:\\ComfyUI-aki-v1.6\\ComfyUI" # comfyui路径
COMFYUI_MODEL_PATH = "models\\checkpoints"  # comfyui模型路径
COMFYUI_LORA_PATH = "models\\Lora"  # comfyui lora路径  
BASE_MODEL = "万能_dreamshaper.safetensors" # 基础模型名称
BASE_LORA_MODE = ""  # 基础lora模型名称

# 生图质量词
QUALITY_PROMPTS = """masterpiece, best quality, highly detailed, 8k uhd, perfect composition, professional lighting, high quality, ultra-detailed, sharp focus, high resolution, detailed, award winning, stunning, breathtaking, remarkable, beautiful, intricate details, ultra realistic, photorealistic quality, cinematic lighting, dramatic lighting, excellent composition"""
# 负面提示词
NEGATIVE_PROMPTS = "nsfw,"


