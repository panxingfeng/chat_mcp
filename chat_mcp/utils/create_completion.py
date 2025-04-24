import asyncio


async def create_stream_completion(llm_client, logger, model,**kwargs):
    """创建流式完成，返回一个异步生成器"""
    try:
        response_stream = llm_client.chat.completions.create(
            model=model,
            stream=True,
            **kwargs
        )

        class AsyncIteratorWrapper:
            def __init__(self, obj):
                    self._it = iter(obj)

            def __aiter__(self):
                    return self

            async def __anext__(self):
                try:
                    value = next(self._it)
                    return value
                except StopIteration:
                    raise StopAsyncIteration

        return AsyncIteratorWrapper(response_stream)
    except Exception as e:
        logger.error(f"流式API调用失败: {str(e)}")
        raise

async def create_completion(llm_client, logger, model, **kwargs):
    """创建非流式完成"""
    try:
        return await asyncio.to_thread(
            llm_client.chat.completions.create,
            model=model,
            **kwargs
        )
    except Exception as e:
        logger.error(f"API调用失败: {str(e)}")
        raise