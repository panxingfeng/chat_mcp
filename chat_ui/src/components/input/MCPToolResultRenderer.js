import React from 'react';
import './MCPToolResultRenderer.css';
import MarkdownRenderer, {isMarkdownContent} from "./isMarkdownContent";

/**
 * 解析MCP响应文本内容
 * @param {string} responseText MCP响应文本
 * @returns {string} 提取的纯文本内容
 */
export function extractTextContent(responseText) {
  if (!responseText) return '';

  // 处理特定格式 meta=None content=TextContent(...)
  const metaContentMatch = responseText.match(/meta=None\s+content=TextContent\(type='text',\s+text='([\s\S]+?)(?:',\s+annotations=None\)|'\))/);
  if (metaContentMatch && metaContentMatch[1]) {
    return metaContentMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"');
  }

  // 处理content=[TextContent(...)]格式
  const contentMatch = responseText.match(/content=\[TextContent\(type='text',\s+text='([\s\S]+?)(?:',\s+annotations=None\)|'\))\]/);
  if (contentMatch && contentMatch[1]) {
    return contentMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"');
  }

  // 处理仅包含TextContent(...)的格式
  const simpleMatch = responseText.match(/TextContent\(type='text',\s+text='([\s\S]+?)(?:',\s+annotations=None\)|'\))/);
  if (simpleMatch && simpleMatch[1]) {
    return simpleMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"');
  }

  // 如果上述格式都不匹配，返回原始文本
  return responseText;
}

/**
 * 检测并识别内容类型
 * @param {string} content 要检测的内容
 * @returns {string} 内容类型
 */
export function detectContentType(content) {
  const text = extractTextContent(content);

  // 首先检测是否为Markdown格式文档
  if (isMarkdownContent(text)) {
    return 'markdown';
  }

  // 检测URL链接
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  if (text.match(urlRegex)) {
    // 提取URL以便检查
    const urls = text.match(urlRegex) || [];
    const url = urls[0];  // 使用第一个URL进行检测

    // 网页URL特殊检测 - 新增的网页检测逻辑
    if (url.includes('.html') ||
      url.includes('www.') ||
      url.includes('/web/') ||
      url.includes('index') ||
      text.toLowerCase().includes('网页') ||
      text.toLowerCase().includes('网站') ||
      text.toLowerCase().includes('webpage') ||
      text.toLowerCase().includes('website')) {
      return 'url-sandbox';  // 改为 url-sandbox
    }

    // 音乐URL特殊检测
    if (url.match(/\.(mp3|wav|ogg|flac|m4a|aac)(\?|$)/i) ||
        text.toLowerCase().includes('音乐') ||
        text.toLowerCase().includes('歌曲') ||
        text.toLowerCase().includes('音频') ||
        text.toLowerCase().includes('music') ||
        text.toLowerCase().includes('song') ||
        text.toLowerCase().includes('audio')) {
      return 'url-audio';
    }

    // 图片URL特殊检测
    if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i) ||
        text.toLowerCase().includes('图片') ||
        text.toLowerCase().includes('照片') ||
        text.toLowerCase().includes('image') ||
        text.toLowerCase().includes('picture')) {
      return 'url-image';
    }

    // 视频URL特殊检测 - 修改为更严格的检测条件
    if ((url.match(/\.(mp4|webm|mov|avi|mkv)(\?|$)/i)) ||
        ((text.toLowerCase().includes('视频') ||
          text.toLowerCase().includes('影片') ||
          text.toLowerCase().includes('video')) &&
         !url.includes('.html') && !url.includes('www.runoob.com'))) {
      return 'url-video';
    }

    // 文件URL特殊检测
    if (url.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)(\?|$)/i) ||
        text.toLowerCase().includes('文件') ||
        text.toLowerCase().includes('下载') ||
        text.toLowerCase().includes('document') ||
        text.toLowerCase().includes('file')) {
      return 'url-file';
    }

    // 通用URL检测
    return 'url-link';
  }

  // 天气信息检测
  if (text.includes('🌤') && text.includes('天气:') && text.includes('温度:')) {
    return 'weather';
  }

  // 微信消息历史记录检测
  if (text.includes('获取到') && text.includes('条与') && text.includes('聊天记录') &&
      text.includes('发送者:') && text.includes('时间:') && text.includes('消息:')) {
    return 'chat-history';
  }

  // 搜索结果检测
  if (text.match(/\[\d+\]/g) &&
      (text.includes('days ago') || text.includes('小时前') || text.includes('天前')) &&
      text.includes('MCP')) {
    return 'search-results';
  }

  // 消息发送成功结果检测
  if ((text.includes('"status": "success"') || text.includes("'status': 'success'")) &&
      text.includes('message') &&
      (text.includes('发送') || text.includes('消息'))) {
    return 'message-sent';
  }

  // 如果没有匹配到特定类型，则返回通用类型
  return 'generic';
}

/**
 * 天气信息渲染器 - 支持多城市显示
 * @param {string} content 天气信息内容
 */
export function WeatherRenderer({ content }) {
  const text = extractTextContent(content);
  
  // 检查是否是多城市查询结果
  const isMultiCity = text.includes('多城市天气查询结果') || text.includes('(共') || text.includes('个城市)');
  
  if (isMultiCity) {
    // 解析多城市天气数据
    const headerMatch = text.match(/📊 多城市天气查询结果 \(共(\d+)个城市\)/);
    const totalCities = headerMatch ? parseInt(headerMatch[1]) : 0;
    
    // 分割每个城市的天气信息
    const cityWeatherBlocks = text.split('------------------------------')
      .filter(block => block.includes('天气信息') && block.includes('📍 位置:'))
      .map(block => block.trim());
    
    // 解析每个城市的天气数据
    const weatherData = cityWeatherBlocks.map(block => {
      const lines = block.split('\n');
      return {
        location: lines.find(line => line.includes('📍'))?.replace('📍 位置:', '').trim() || '',
        weather: lines.find(line => line.includes('🌤'))?.replace('🌤 天气:', '').trim() || '',
        temperature: lines.find(line => line.includes('🌡'))?.replace('🌡 温度:', '').trim() || '',
        windDirection: lines.find(line => line.includes('💨'))?.replace('💨 风向:', '').trim() || '',
        windForce: lines.find(line => line.includes('💪'))?.replace('💪 风力:', '').trim() || '',
        humidity: lines.find(line => line.includes('💧'))?.replace('💧 湿度:', '').trim() || '',
        publishTime: lines.find(line => line.includes('🕒'))?.replace('🕒 发布时间:', '').trim() || ''
      };
    });
    
    return (
      <div className="weather-multi-city-container">
        <div className="weather-multi-city-header">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <line x1="10" y1="9" x2="8" y2="9"></line>
          </svg>
          <span>多城市天气查询结果</span>
          <span className="city-count">共 {totalCities} 个城市</span>
        </div>
        
        <div className="weather-city-grid">
          {weatherData.map((cityData, idx) => (
            <WeatherCard key={idx} data={cityData} />
          ))}
        </div>
      </div>
    );
  } else {
    // 单城市天气显示逻辑（保持原样）
    const lines = text.split('\n');
    const data = {
      location: lines.find(line => line.includes('📍'))?.replace('📍 位置:', '').trim() || '',
      weather: lines.find(line => line.includes('🌤'))?.replace('🌤 天气:', '').trim() || '',
      temperature: lines.find(line => line.includes('🌡'))?.replace('🌡 温度:', '').trim() || '',
      windDirection: lines.find(line => line.includes('💨'))?.replace('💨 风向:', '').trim() || '',
      windForce: lines.find(line => line.includes('💪'))?.replace('💪 风力:', '').trim() || '',
      humidity: lines.find(line => line.includes('💧'))?.replace('💧 湿度:', '').trim() || '',
      publishTime: lines.find(line => line.includes('🕒'))?.replace('🕒 发布时间:', '').trim() || ''
    };
    
    return <WeatherCard data={data} />;
  }
}

/**
 * 单个天气卡片组件
 * @param {Object} data 天气数据
 */
function WeatherCard({ data }) {
  const { location, weather, temperature, windDirection, windForce, humidity, publishTime } = data;
  
  // 根据天气状况选择背景色
  let bgClass = 'weather-sunny';
  if (weather.includes('雨')) {
    bgClass = 'weather-rainy';
  } else if (weather.includes('云') || weather.includes('阴')) {
    bgClass = 'weather-cloudy';
  } else if (weather.includes('雪')) {
    bgClass = 'weather-snowy';
  } else if (weather.includes('雾') || weather.includes('霾')) {
    bgClass = 'weather-foggy';
  }

  return (
    <div className={`weather-card ${bgClass}`}>
      <div className="weather-header">
        <div className="weather-location">{location}</div>
        <div className="weather-publish-time">{publishTime}</div>
      </div>

      <div className="weather-main">
        <div className="weather-condition">
          <span className="weather-icon">
            {weather.includes('晴') ? '☀️' :
             weather.includes('云') ? '⛅' :
             weather.includes('阴') ? '☁️' :
             weather.includes('雨') ? '🌧️' :
             weather.includes('雪') ? '❄️' :
             weather.includes('雾') || weather.includes('霾') ? '🌫️' : '🌤️'}
          </span>
          <span className="weather-text">{weather}</span>
        </div>
        <div className="weather-temperature">{temperature}</div>
      </div>

      <div className="weather-details">
        <div className="weather-detail-item">
          <span className="detail-label">风向:</span>
          <span className="detail-value">{windDirection}</span>
        </div>
        <div className="weather-detail-item">
          <span className="detail-label">风力:</span>
          <span className="detail-value">{windForce}</span>
        </div>
        <div className="weather-detail-item">
          <span className="detail-label">湿度:</span>
          <span className="detail-value">{humidity}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * 搜索结果渲染器
 * @param {string} content 搜索结果内容
 */
export function SearchResultsRenderer({ content }) {
  const text = extractTextContent(content);
  // 分割每条搜索结果
  const resultPattern = /\[(\d+)\](.*?)(?=\[\d+\]|$)/gs;
  const matches = [...text.matchAll(resultPattern)];

  const results = matches.map(match => {
    const index = match[1];
    const resultText = match[2].trim();

    // 尝试提取更多详细信息
    const timeMatch = resultText.match(/(\d+)\s*(days?|天前|hours?|小时前)/);
    const time = timeMatch ? timeMatch[0] : '';

    return { index, text: resultText, time };
  });

  return (
    <div className="search-results-container">
      <div className="search-results-header">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span>搜索结果</span>
        <span className="result-count">找到 {results.length} 条结果</span>
      </div>

      <div className="search-results-list">
        {results.map((result, idx) => (
          <div key={idx} className="search-result-item">
            <div className="result-index">[{result.index}]</div>
            <div className="result-content">
              <div className="result-text">{result.text}</div>
              {result.time && (
                <div className="result-time">{result.time}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 微信聊天历史记录渲染器
 * @param {string} content 聊天历史记录内容
 */
export function ChatHistoryRenderer({ content }) {
  const text = extractTextContent(content);
  const lines = text.split('\n');

  // 提取标题信息
  const titleLine = lines[0];
  const messagesCount = titleLine.match(/获取到\s*(\d+)\s*条/)?.[1] || '0';
  const chatWith = titleLine.match(/与\s*(.+?)\s*在/)?.[1] || '';
  const chatDate = titleLine.match(/在\s*(.+?)\s*的/)?.[1] || '';

  // 分割消息
  const messages = [];
  let currentMessage = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('发送者:')) {
      if (currentMessage) {
        messages.push(currentMessage);
      }

      currentMessage = {
        sender: line.replace('发送者:', '').trim(),
        time: '',
        message: ''
      };
    } else if (line.startsWith('时间:') && currentMessage) {
      currentMessage.time = line.replace('时间:', '').trim();
    } else if (line.startsWith('消息:') && currentMessage) {
      currentMessage.message = line.replace('消息:', '').trim();
    } else if (line === '------------------------------') {
      if (currentMessage) {
        messages.push(currentMessage);
        currentMessage = null;
      }
    } else if (currentMessage && currentMessage.message) {
      // 为多行消息添加内容
      currentMessage.message += '\n' + line;
    }
  }

  // 添加最后一条消息
  if (currentMessage) {
    messages.push(currentMessage);
  }

  return (
    <div className="chat-history-container">
      <div className="chat-history-header">
        <div className="chat-history-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>聊天记录</span>
        </div>
        <div className="chat-history-info">
          <span className="chat-with">{chatWith}</span>
          <span className="chat-date">{chatDate}</span>
          <span className="message-count">{messagesCount}条消息</span>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-message ${msg.sender.toLowerCase() === 'pan' ? 'sent' : 'received'}`}>
            <div className="message-header">
              <span className="message-sender">{msg.sender}</span>
              <span className="message-time">{msg.time}</span>
            </div>
            <div className="message-body">
              {msg.message.split('\n').map((line, lineIdx) => (
                <p key={lineIdx}>{line}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 消息发送结果渲染器
 * @param {string} content 消息发送结果内容
 */
export function MessageSentRenderer({ content }) {
  const text = extractTextContent(content);

  // 尝试解析 JSON
  let jsonData = null;
  try {
    // 寻找 JSON 格式的文本
    const jsonMatch = text.match(/({[\s\S]*})/);
    if (jsonMatch) {
      jsonData = JSON.parse(jsonMatch[1]);
    }
  } catch (e) {
    console.warn('无法解析消息发送结果为JSON:', e);
  }

  // 提取消息和状态
  const status = jsonData?.status ||
    (text.includes('success') ? 'success' : 'unknown');
  const message = jsonData?.message || text;

  // 提取接收者信息
  let recipient = '';
  if (message.includes('发送给')) {
    recipient = message.match(/发送给\s*(.+?)($|\s|,|，)/)?.[1] || '';
  } else if (message.includes('向')) {
    recipient = message.match(/向\s*(.+?)\s*发送/)?.[1] || '';
  }

  // 提取消息数量
  const messageCount = message.match(/(\d+)\s*条消息/)?.[1] || '1';

  return (
    <div className={`message-sent-container ${status === 'success' ? 'success' : 'error'}`}>
      <div className="message-sent-icon">
        {status === 'success' ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        )}
      </div>

      <div className="message-sent-content">
        <div className="message-sent-status">
          {status === 'success' ? '发送成功' : '发送失败'}
        </div>

        <div className="message-sent-details">
          {recipient && (
            <div className="message-recipient">
              <span className="detail-label">接收者:</span>
              <span className="detail-value">{recipient}</span>
            </div>
          )}

          <div className="message-count">
            <span className="detail-label">消息数量:</span>
            <span className="detail-value">{messageCount}条</span>
          </div>

          <div className="message-text">
            <span className="detail-value">{message}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 沙箱网页渲染器 - 在安全的iframe中渲染网页
 * @param {string} content 包含URL的内容文本
 */
export function SandboxRenderer({ content }) {
  const text = extractTextContent(content);
  
  // 提取URL
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex) || [];
  
  if (urls.length === 0) {
    return <GenericRenderer content={content} />;
  }
  
  // 获取第一个URL
  const url = urls[0];
  
  // 提取标题
  let title = '';
  const titleMatch = text.match(new RegExp(`([^\\n.]+)\\s*${escapeRegExp(url)}`));
  if (titleMatch) {
    title = titleMatch[1].trim();
  } else {
    title = '网页预览';
  }
  
  // 沙箱属性
  const sandboxAttributes = [
    'allow-same-origin',
    'allow-scripts',
    'allow-popups',
    'allow-forms',
    'allow-modals',
  ].join(' ');
  
  return (
    <div className="sandbox-container">
      <div className="sandbox-header">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h7.5"/>
          <path d="M16 2v4"/>
          <path d="M8 2v4"/>
          <path d="M3 10h18"/>
          <path d="M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6v0z"/>
          <path d="m22 22-1.5-1.5"/>
        </svg>
        <span className="sandbox-title">{title}</span>
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="sandbox-open-button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          在新标签页打开
        </a>
      </div>
      
      <div className="sandbox-iframe-container">
        <iframe
          src={url}
          sandbox={sandboxAttributes}
          className="sandbox-iframe"
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
      
      <div className="sandbox-footer">
        <span className="sandbox-url">{url}</span>
      </div>
    </div>
  );
}

/**
 * URL信息渲染器 - 检测URL类型并提供相应的渲染方式
 * @param {string} content 包含URL的内容文本
 */
export function UrlInfoRenderer({ content }) {
  const text = extractTextContent(content);

  // 提取URL
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex) || [];

  if (urls.length === 0) {
    return <GenericRenderer content={content} />;
  }

  // 识别URL类型并存储信息
  const urlInfos = urls.map(url => {
    let type = 'link'; // 默认类型
    let title = '';

    // 从文本中提取可能的标题信息
    const titleMatch = text.match(new RegExp(`([^\\n.]+)\\s*${escapeRegExp(url)}`));
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    // 网页URL检测 - 新增
    if (url.includes('.html') ||
        url.includes('www.') ||
        url.includes('/web/') ||
        url.includes('index') ||
        text.toLowerCase().includes('网页') ||
        text.toLowerCase().includes('网站') ||
        text.toLowerCase().includes('webpage') ||
        text.toLowerCase().includes('website')) {
      type = 'url-sandbox';
    }
    // 音频检测
    else if (/\.(mp3|wav|ogg|flac|m4a|aac)(\?|$)/i.test(url)) {
      type = 'audio';
    }
    // 图片检测
    else if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url)) {
      type = 'image';
    }
    // 视频检测 - 更严格的条件
    else if (/\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url)) {
      type = 'video';
    }
    // 文档检测
    else if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)(\?|$)/i.test(url)) {
      type = 'file';
    }
    // 基于内容的推断 - 降低优先级
    else if (url.includes('music') || url.includes('song') || url.includes('audio') ||
             text.toLowerCase().includes('音乐') || text.toLowerCase().includes('歌曲') ||
             text.toLowerCase().includes('音频')) {
      type = 'audio';
    } else if (text.toLowerCase().includes('图片') || text.toLowerCase().includes('照片') ||
               text.toLowerCase().includes('image') || text.toLowerCase().includes('picture')) {
      type = 'image';
    } else if ((text.toLowerCase().includes('视频') || text.toLowerCase().includes('影片') ||
               text.toLowerCase().includes('video')) &&
               !url.includes('.html') && !url.includes('www.runoob.com')) {
      type = 'video';
    } else if (text.toLowerCase().includes('文件') || text.toLowerCase().includes('下载') ||
               text.toLowerCase().includes('document') || text.toLowerCase().includes('file')) {
      type = 'file';
    }

    // 如果没有从文本中提取到标题，尝试从URL中提取一个简单标题
    if (!title) {
      const urlParts = url.split('/');
      const lastPart = urlParts[urlParts.length - 1].split('?')[0];

      if (lastPart) {
        // 尝试转换为更易读的格式
        title = lastPart
          .replace(/[-_+]/g, ' ')
          .replace(/\.[^.]+$/, '') // 移除文件扩展名
          .trim();

        // 将首字母大写
        if (title.length > 0) {
          title = title.charAt(0).toUpperCase() + title.slice(1);
        }
      } else {
        title = '未命名资源';
      }
    }

    return { url, type, title };
  });

  return (
    <div className="url-info-container">
      <div className="url-info-header">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
        <span>链接资源</span>
        <span className="url-count">共 {urlInfos.length} 个资源</span>
      </div>

      <div className="url-items">
        {urlInfos.map((info, idx) => (
          <div key={idx} className={`url-item url-type-${info.type}`}>
            <div className="url-item-icon">
              {info.type === 'audio' && <span className="url-icon">🎵</span>}
              {info.type === 'image' && <span className="url-icon">🖼️</span>}
              {info.type === 'video' && <span className="url-icon">🎬</span>}
              {info.type === 'file' && <span className="url-icon">📄</span>}
              {info.type === 'link' && <span className="url-icon">🔗</span>}
              {info.type === 'webpage' && <span className="url-icon">🌐</span>}
            </div>

            <div className="url-item-content">
              <div className="url-item-title">{info.title}</div>

              <div className="url-item-preview">
                {info.type === 'image' && (
                  <div className="image-preview">
                    <img src={info.url} alt={info.title} />
                  </div>
                )}

                {info.type === 'audio' && (
                  <div className="audio-preview">
                    <audio controls>
                      <source src={info.url} />
                      您的浏览器不支持音频播放
                    </audio>
                  </div>
                )}

                {info.type === 'video' && (
                  <div className="video-preview">
                    <video controls>
                      <source src={info.url} />
                      您的浏览器不支持视频播放
                    </video>
                  </div>
                )}

                {info.type === 'file' && (
                  <div className="file-preview">
                    <a href={info.url} target="_blank" rel="noopener noreferrer" className="file-download-button">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      下载文件
                    </a>
                  </div>
                )}

                {(info.type === 'link' || info.type === 'webpage') && (
                  <div className="link-preview">
                    <a href={info.url} target="_blank" rel="noopener noreferrer" className="link-button">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                      {info.type === 'webpage' ? '访问网页' : '打开链接'}
                    </a>
                  </div>
                )}
              </div>

              {/*<div className="url-item-link">*/}
              {/*  <a href={info.url} target="_blank" rel="noopener noreferrer" className="url-text">{info.url}</a>*/}
              {/*</div>*/}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 辅助函数：转义正则表达式中的特殊字符
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 通用内容渲染器
 * @param {string} content 任意内容
 */
export function GenericRenderer({ content }) {
  const text = extractTextContent(content);

  return (
    <div className="generic-content">
      <pre>{text}</pre>
    </div>
  );
}

/**
 * 智能内容渲染器 - 根据内容类型自动选择合适的渲染器
 * @param {string} content 要渲染的内容
 */
export function SmartContentRenderer({ content }) {
  const contentType = detectContentType(content);

  switch (contentType) {
    case 'markdown':
      // 首先提取文本内容
      const markdownContent = extractTextContent(content);
      // 然后渲染提取的内容
      return <MarkdownRenderer content={markdownContent} />;
    case 'weather':
      return <WeatherRenderer content={content} />;
    case 'search-results':
      return <SearchResultsRenderer content={content} />;
    case 'chat-history':
      return <ChatHistoryRenderer content={content} />;
    case 'message-sent':
      return <MessageSentRenderer content={content} />;
    case 'url-sandbox':
      return <SandboxRenderer content={content} />;
    // URL相关类型
    case 'url-audio':
    case 'url-image':
    case 'url-video':
    case 'url-file':
    case 'url-link':
      return <UrlInfoRenderer content={content} />;
    case 'generic':
    default:
      return <GenericRenderer content={content} />;
  }
}

export default SmartContentRenderer;