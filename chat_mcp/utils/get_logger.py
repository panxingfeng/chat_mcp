from loguru import logger
import sys
from pathlib import Path
from datetime import datetime

# 创建日志目录
from chat_mcp.utils.get_project_root import get_project_root

log_dir = Path(get_project_root() / "logs")
log_dir.mkdir(exist_ok=True)

# 获取当前日期字符串，格式为YYYY-MM-DD
current_date = datetime.now().strftime("%Y-%m-%d")

# 创建日期目录
date_log_dir = log_dir / current_date
date_log_dir.mkdir(exist_ok=True)

# 移除默认的控制台输出
logger.remove()

# 添加控制台输出
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level="INFO"
)

# 添加应用日志文件输出 - 使用日期目录
logger.add(
    date_log_dir / "app.log",
    rotation="500 MB",
    retention="10 days",
    compression="zip",
    format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} - {message}",
    level="INFO",
    encoding="utf-8"
)

# 错误日志单独存储 - 使用相同的日期目录
logger.add(
    date_log_dir / "error.log",
    rotation="100 MB",
    retention="30 days",
    compression="zip",
    format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} - {message}",
    level="ERROR",  # 只记录错误级别的日志
    encoding="utf-8"
)

def get_logger(service: str):
    """获取带有服务名称的 logger"""
    return logger.bind(service=service)

def log_structured(event_type: str, data: dict):
    """结构化日志记录"""
    logger.info({"event_type": event_type, "data": data})