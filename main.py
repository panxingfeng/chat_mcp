import asyncio

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Union
import json

from starlette.responses import JSONResponse

from chat_mcp.client.mcp_client import get_mcp_client, mcp_client
from chat_mcp.utils.get_logger import get_logger
from chat_mcp.utils.get_project_root import get_project_root
from config.config import URL_PORT

app = FastAPI()

logging = get_logger(service="main")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Settings(BaseModel):
    temperature: float = 0.7
    topP: float = 1.0
    maxTokens: int = 20
    systemPrompt: str = "你是一个助人为乐的助手"

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str
    user_id: Optional[Union[str, int]] = None
    conversation_id: Optional[str] = None
    settings: Optional[Settings] = None
    use_cache: bool = True


@app.get("/api/tools")
async def get_tools():
    """获取工具列表"""
    if not mcp_client:
        return {
            "return_code": -1,
            "return_msg": "MCP客户端未初始化",
            "groups": [],
            "tools": []
        }

    try:
        tools_data = mcp_client.get_tools_json()
        if isinstance(tools_data, dict) and "groups" in tools_data:
            return {
                "return_code": 0,
                "return_msg": "success",
                **tools_data
            }
        else:
            return {
                "return_code": 0,
                "return_msg": "success",
                "groups": [],
                "tools": tools_data
            }
    except Exception as e:
        logging.error(f"获取工具列表失败: {str(e)}", exc_info=True)
        return {
            "return_code": -1,
            "return_msg": f"获取工具列表失败: {str(e)}",
            "groups": [],
            "tools": []
        }


@app.post("/api/tools/test/{tool_name}")
async def tool_test(tool_name: str, request: Request):
    """测试指定的工具"""
    if not mcp_client:
        return {
            "return_code": -1,
            "return_msg": "MCP客户端未初始化",
            "result": None
        }
    try:
        kwargs = await request.json()
        provider = "ollama"
        api_key = "ollama"
        model = "qwen2.5"
        base_url = get_base_url(provider) if provider else None
        logging.info(f"测试工具 {tool_name}，参数: {kwargs}")
        result = await mcp_client.tool_test(
            tool_name,
            api_key=api_key,
            base_url=base_url,
            model=model,
            **kwargs
        )
        is_error = isinstance(result, str) and (
                result.startswith("错误:") or
                result.startswith("未找到工具:") or
                result.startswith("工具名称不匹配:") or
                result.startswith("测试失败:") or
                result.startswith("参数解析失败:")
        )
        if is_error:
            return {
                "return_code": -1,
                "return_msg": result,
                "result": None
            }
        return {
            "return_code": 0,
            "return_msg": "success",
            "result": result
        }
    except Exception as e:
        logging.error(f"测试工具 {tool_name} 时出错: {str(e)}", exc_info=True)
        return {
            "return_code": -1,
            "return_msg": f"测试工具失败: {str(e)}",
            "result": None
        }


def get_base_url(provider):
    """根据provider获取API基础URL"""
    if not provider:
        return None

    provider = provider.lower()
    if provider == "ollama":
        return "http://localhost:11434/v1"
    elif provider == "openai":
        return "https://api.openai.com/v1"
    elif provider == "deepseek":
        return "https://api.deepseek.com"
    elif provider == "siliconflow":
        return "https://api.ap.siliconflow.com/v1"
    elif provider == "lmstudio":
        return "http://127.0.0.1:1234/v1"
    elif provider == "gemini":
        return "https://generativelanguage.googleapis.com/v1beta/openai/"
    else:
        logging.warning(f"未知的provider: {provider}")
        return None


@app.post("/chat/stream")
async def chat_stream(request: Request):
    """使用MCP客户端流式处理聊天"""
    try:
        data = await request.json()
        message = data.get("message", [])
        model = data.get("model", "qwen2.5")
        provider = data.get("provider", "ollama")
        history_message = data.get("historyMessage", "")
        settings = data.get("settings", {})
        api_key = data.get("apiKey", "")

        system_prompt = settings.get("systemPrompt", "你是一个助人为乐的助手")
        temperature = float(settings.get("temperature", 0.7))

        if not message:
            return JSONResponse(
                status_code=400,
                content={"error": "消息不能为空"}
            )

        if not provider:
            return JSONResponse(
                status_code=400,
                content={"error": "provider不能为空"}
            )

        if not model:
            return JSONResponse(
                status_code=400,
                content={"error": "model不能为空"}
            )

        base_url = get_base_url(provider)
        if not base_url:
            return JSONResponse(
                status_code=400,
                content={"error": f"不支持的provider: {provider}"}
            )

        if not api_key and provider == "ollama":
            api_key = "ollama"

        if not api_key:
            return JSONResponse(
                status_code=400,
                content={"error": "API密钥不能为空"}
            )

        mcp_client = get_mcp_client()

        async def stream_response():
            try:
                if not mcp_client.tool_manager or not mcp_client.tool_manager.all_tools:
                    await mcp_client.initialize()
                    logging.info("已初始化MCP客户端")

                logging.info(f"开始处理查询:{message} - model: {model}, base_url: {base_url}, LLM服务商: {provider}")
                async for chunk in mcp_client.process_query_stream(
                        user_query=message,
                        system_prompt=system_prompt,
                        api_key=api_key,
                        base_url=base_url,
                        model=model,
                        temperature=temperature,
                        history_message=history_message
                ):
                    content = ""
                    if hasattr(chunk, 'choices') and chunk.choices:
                        choice = chunk.choices[0]
                        if hasattr(choice, 'delta') and hasattr(choice.delta, 'content'):
                            content = choice.delta.content or ""
                    elif isinstance(chunk, str):
                        content = chunk
                    else:
                        try:
                            content = str(chunk)
                        except:
                            content = ""
                    
                    yield f"data: {json.dumps({'content': content})}\n\n"
                    await asyncio.sleep(0.02)

            except Exception as e:
                error_msg = f"处理流式响应出错: {str(e)}"
                logging.error(error_msg, exc_info=True)
                yield f"data: {json.dumps({'content': error_msg})}\n\n"

        return StreamingResponse(
            stream_response(),
            media_type="text/event-stream"
        )
    except Exception as e:
        logging.error(f"处理请求出错: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.on_event("startup")
async def startup_event():
    await mcp_client.initialize()


@app.on_event("shutdown")
async def shutdown_event():
    await mcp_client.cleanup()


if __name__ == "__main__":
    import uvicorn
    from fastapi.staticfiles import StaticFiles

    root_dir = get_project_root()
    static_dir = root_dir / 'output'
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    uvicorn.run(app, host="0.0.0.0", port=URL_PORT)