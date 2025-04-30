import json
import os
import httpx
import openpyxl
from enum import Enum
from typing import Any, Sequence, Dict, List, Optional, Tuple

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent, ImageContent, EmbeddedResource, ErrorData
from mcp.shared.exceptions import McpError

from chat_mcp.utils.get_project_root import get_project_root

GAODE_WEATHER_API_BASE = "https://restapi.amap.com/v3/weather/weatherInfo"
USER_AGENT = "weather-app/1.0"

class AdministrativeLevel(str, Enum):
    """行政区划等级枚举"""
    PROVINCE = "province"
    CITY = "city"
    DISTRICT = "district"


class WeatherServer:
    def __init__(self, api_key: str = None):
        """
        初始化天气服务器
        """
        self.api_key = api_key
        self.base_url = GAODE_WEATHER_API_BASE
        self.timeout = 10.0
    
        current_dir = get_project_root()
        self.region_data_path = os.path.join(current_dir, "chat_mcp", "config", "citycode.xlsx")

        self._init_region_lookup(self.region_data_path)

    def _init_region_lookup(self, file_path: str) -> None:
        """
        初始化区域数据查询表
        """
        try:
            abs_file_path = os.path.abspath(file_path)

            self.region_lookup = {}

            if os.path.exists(abs_file_path):
                try:
                    wb = openpyxl.load_workbook(abs_file_path)
                    ws = wb.active

                    for row in list(ws.rows)[1:]:
                        if len(row) >= 3:
                            chinese_name = str(row[0].value) if row[0].value else ""
                            adcode = str(row[1].value) if row[1].value else ""
                            citycode = str(row[2].value) if row[2].value else ""

                            if chinese_name and adcode:
                                self.region_lookup[chinese_name] = {
                                    'adcode': adcode,
                                    'citycode': citycode
                                }
                except ImportError:
                    print("警告: 未安装openpyxl，使用默认城市数据")
                    self._use_default_city_data()
                except Exception as e:
                    print(f"Excel读取错误: {str(e)}，使用默认城市数据")
                    self._use_default_city_data()
            else:
                print(f"警告: 文件不存在 {abs_file_path}，使用默认城市数据")
                self._use_default_city_data()

            self.province_codes = []
            self.city_codes = []

            for adcode in [info['adcode'] for info in self.region_lookup.values()]:
                if adcode.endswith('0000'):
                    self.province_codes.append(adcode)
                elif adcode.endswith('00'):
                    self.city_codes.append(adcode)

        except Exception as e:
            print(f"区域数据初始化错误：{str(e)}")
            self._use_default_city_data()

    def _use_default_city_data(self):
        """使用默认的城市数据"""
        self.region_lookup = {
            "北京": {"adcode": "110000", "citycode": "010"},
            "北京市": {"adcode": "110000", "citycode": "010"},
            "上海": {"adcode": "310000", "citycode": "021"},
            "上海市": {"adcode": "310000", "citycode": "021"},
            "广州": {"adcode": "440100", "citycode": "020"},
            "广州市": {"adcode": "440100", "citycode": "020"},
            "深圳": {"adcode": "440300", "citycode": "0755"},
            "深圳市": {"adcode": "440300", "citycode": "0755"},
            "杭州": {"adcode": "330100", "citycode": "0571"},
            "杭州市": {"adcode": "330100", "citycode": "0571"},
            "成都": {"adcode": "510100", "citycode": "028"},
            "成都市": {"adcode": "510100", "citycode": "028"},
            "重庆": {"adcode": "500000", "citycode": "023"},
            "重庆市": {"adcode": "500000", "citycode": "023"},
            "天津": {"adcode": "120000", "citycode": "022"},
            "天津市": {"adcode": "120000", "citycode": "022"},
            "西安": {"adcode": "610100", "citycode": "029"},
            "西安市": {"adcode": "610100", "citycode": "029"},
            "南京": {"adcode": "320100", "citycode": "025"},
            "南京市": {"adcode": "320100", "citycode": "025"},
            "武汉": {"adcode": "420100", "citycode": "027"},
            "武汉市": {"adcode": "420100", "citycode": "027"},
        }
        self.province_codes = ["110000", "310000", "500000", "120000"]
        self.city_codes = ["440100", "440300", "330100", "510100", "610100", "320100", "420100"]

    def _get_administrative_level(self, adcode: str) -> str:
        """判断行政区划等级"""
        if str(adcode).endswith('0000'):
            return AdministrativeLevel.PROVINCE
        elif str(adcode).endswith('00'):
            return AdministrativeLevel.CITY
        else:
            return AdministrativeLevel.DISTRICT

    def _get_adcode(self, address: str) -> Tuple[Optional[str], str, str]:
        """
        获取地址的行政区划代码
        """
        try:
            address = address.strip()

            clean_address = address.replace('市', '').replace('区', '').replace('县', '')

            if address in self.region_lookup:
                adcode = self.region_lookup[address]['adcode']
                return adcode, address, self._get_administrative_level(adcode)

            if address + "市" in self.region_lookup:
                full_name = address + "市"
                adcode = self.region_lookup[full_name]['adcode']
                return adcode, full_name, self._get_administrative_level(adcode)
            
            for region_name, info in self.region_lookup.items():
                if clean_address in region_name.replace('市', ''):
                    if info['adcode'].endswith('0000'):
                        return info['adcode'], region_name, AdministrativeLevel.PROVINCE
                    elif info['adcode'].endswith('00'):
                        return info['adcode'], region_name, AdministrativeLevel.CITY

            if len(address) > 2:
                for region_name, info in self.region_lookup.items():
                    if (not info['adcode'].endswith('00') and
                            clean_address in region_name):
                        return info['adcode'], region_name, AdministrativeLevel.DISTRICT

            return None, "", ""

        except Exception as e:
            print(f"区域编码查询错误：{str(e)}")
            return None, "", ""

    async def fetch_weather(self, location: str) -> dict[str, Any] | None:
        """
        从高德天气API获取天气信息
        """
        adcode, matched_name, level = self._get_adcode(location)
        if not adcode:
            return {"error": f"未找到 {location} 的区域编码"}

        params = {
            "city": adcode,
            "key": self.api_key,
            "extensions": "base"
        }

        headers = {"User-Agent": USER_AGENT}

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(self.base_url, params=params,
                                            headers=headers, timeout=self.timeout)
                response.raise_for_status()
                data = response.json()

                if data["status"] == "1" and data["info"] == "OK" and data["lives"]:
                    data["matched_region"] = matched_name
                    data["administrative_level"] = level
                    return data
                else:
                    return {"error": f"API返回错误: {data.get('info', '未知错误')}"}

            except httpx.HTTPStatusError as e:
                return {"error": f"HTTP 错误: {e.response.status_code}"}
            except Exception as e:
                return {"error": f"请求失败: {str(e)}"}

    def _format_weather_display(self, weather_data: dict) -> str:
        """
        格式化天气信息
        """
        lives = weather_data.get("lives", [{}])[0]
        city = lives.get("city", "未知")
        weather = lives.get("weather", "未知")
        temperature = f"{lives.get('temperature', '未知')}℃"
        winddirection = lives.get("winddirection", "未知")
        windpower = lives.get("windpower", "未知")
        humidity = f"{lives.get('humidity', '未知')}%"
        reporttime = lives.get("reporttime", "未知")
        def format_line(icon: str, label: str, value: str) -> str:
            """格式化单行内容"""
            content = f"{icon} {label}: {value}"
            return content

        return f"{city}天气信息,天气{weather},温度:{temperature},风向:{winddirection},风力:{windpower},湿度:{humidity},发布时间:{reporttime}"

    def format_weather(self, data: dict[str, Any] | str) -> str:
        """
        将天气数据格式化为易读文本
        """
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except Exception as e:
                return f"无法解析天气数据: {e}"

        if "error" in data:
            return f"⚠️ {data['error']}"

        return self._format_weather_display(data)


async def serve(api_key: str = None):
    server = Server("WeatherServer")
    weather_server = WeatherServer(api_key=api_key)

    @server.list_resources()
    async def handle_list_resources():
        """列出可用的天气资源"""
        # 示例资源列表
        return [
            {
                "uri": "weather://china/current",
                "name": "中国天气",
                "description": "获取中国各地的当前天气信息",
                "mimeType": "application/json",
            }
        ]

    @server.read_resource()
    async def handle_read_resource(uri: str) -> str:
        """读取指定的天气资源"""
        if uri.startswith("weather://"):
            # 简单的资源处理
            return json.dumps({"message": "此功能暂未实现"}, ensure_ascii=False)
        raise ValueError(f"不支持的URI: {uri}")

    @server.list_tools()
    async def list_tools() -> List[Tool]:
        """列出可用的天气工具"""
        return [
            Tool(
                name="get_weather",
                description="查询指定城市的天气信息,返回的内容是格式化后的结果",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "city": {
                            "type": "string",
                            "description": "城市名称（支持中文，如“北京”）",
                        }
                    },
                    "required": ["city"],
                },
            ),
            Tool(
                name="get_multi_city_weather",
                description="同时查询多个城市的天气信息",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "cities": {
                            "type": "array",
                            "items": {
                                "type": "string"
                            },
                            "description": "城市名称列表（支持中文，如['北京', '上海', '广州']）,返回的内容是格式化后的结果",
                        }
                    },
                    "required": ["cities"],
                },
            )
        ]

    @server.call_tool()
    async def call_tool(
            name: str, arguments: Dict[str, Any]
    ) -> Sequence[TextContent | ImageContent | EmbeddedResource]:
        """处理工具调用请求"""
        try:
            if name == "get_weather":
                city = arguments.get("city")
                if not city:
                    raise ValueError("缺少必要参数: city")

                weather_data = await weather_server.fetch_weather(city)
                weather_text = weather_server.format_weather(weather_data)

                return [TextContent(type="text", text=weather_text)]

            elif name == "get_multi_city_weather":
                cities = arguments.get("cities")
                if not cities or not isinstance(cities, list):
                    raise ValueError("缺少必要参数: cities，或参数格式不正确")

                if len(cities) > 10:
                    raise ValueError("一次最多查询10个城市的天气")
                
                if ',' in cities or '，' in cities:
                    cities = [c.strip() for c in cities.replace('，', ',').split(',') if c.strip()]

                weather_results = []
                for city in cities:
                    weather_data = await weather_server.fetch_weather(city)
                    weather_text = weather_server.format_weather(weather_data)
                    weather_results.append(f"\n{weather_text}")

                combined_result = f"多城市天气查询结果\n" + "\n".join(weather_results)

                return [TextContent(type="text", text=combined_result)]

            else:
                raise ValueError(f"未知工具: {name}")

        except Exception as e:
            print(f"工具调用出错: {str(e)}")
            error = ErrorData(message=f"天气服务错误: {str(e)}", code=-32603)
            raise McpError(error)

    # 运行服务器
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )