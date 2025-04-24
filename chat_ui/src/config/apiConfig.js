import axios from 'axios';

export const modelsCache = {
  data: {},  
  timestamp: {}, 
  set: function(providerId, models) {
    this.data[providerId] = models;
    this.timestamp[providerId] = Date.now();
  },
  get: function(providerId) {
    return this.data[providerId] || [];
  },
  isStale: function(providerId, maxAge = 300000) { 
    const timestamp = this.timestamp[providerId] || 0;
    return Date.now() - timestamp > maxAge;
  }
};

export const defaultCommonSettings = {
  maxTokens: 20,    
  temperature: 0.7          
};

export const apiProviders = [
  {
    id: 'openai',
    name: 'OpenAI API',
    baseUrl: 'https://api.openai.com',
    requiresKey: true,
    keyPlaceholder: 'sk-...',
    defaultModel: 'none',
    models: [
      { id: 'none', name: 'none' },
    ]
  },
  {
    id: 'gemini',
    name: 'Google Gemini API',
    baseUrl: 'https://generativelanguage.googleapis.com',
    requiresKey: true,
    keyPlaceholder: 'AIza...',
    defaultModel: 'none',
    models: [
      { id: 'none', name: 'none' },
    ]
  },
  {
    id: 'ollama',
    name: 'Ollama API',
    baseUrl: 'http://127.0.0.1:11434',
    requiresKey: false,
    defaultModel: 'none',
    models: [
      { id: 'none', name: 'none' },
    ]
  },
  {
    id: 'lmstudio',
    name: 'LM Studio API',
    baseUrl: 'http://127.0.0.1:1234/v1',
    requiresKey: true,
    defaultModel: 'none',
    models: [
      { id: 'none', name: 'none' },
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek API',
    baseUrl: 'https://api.deepseek.com',
    requiresKey: true,
    keyPlaceholder: 'sk-...',
    defaultModel: 'none',
    models: [
      { id: 'none', name: 'none' },
    ]
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow API',
    baseUrl: 'https://api.ap.siliconflow.com/v1',
    requiresKey: true,
    keyPlaceholder: 'sk-...',
    defaultModel: 'none',
    models: [
      { id: 'none', name: 'none' },
    ]
  },
];

export const getProviderById = (providerId) => {
  return apiProviders.find(provider => provider.id === providerId) || null;
};

export const getProviderModels = (providerId) => {
  const cachedModels = modelsCache.get(providerId);
  if (cachedModels && cachedModels.length > 0) {
    return cachedModels;
  }
  const provider = getProviderById(providerId);
  return provider ? provider.models : [];
};

export const getDefaultChatSettings = () => {
  const defaultProvider = apiProviders[3]; 
  return {
    name: '聊天机器人',
    systemPrompt: '你是一个助人为乐的助手',
    apiProvider: defaultProvider.id,
    apiEndpoint: defaultProvider.baseUrl,
    apiKey: '',
    model: defaultProvider.defaultModel,
    ...defaultCommonSettings,
  };
};

export const checkOllamaService = async (baseUrl = 'http://127.0.0.1:11434', timeout = 2000) => {
  try {
    await axios({
      method: 'head',
      url: `${baseUrl}/api/version`,
      timeout: timeout
    });
    return true;
  } catch (error) {
    console.warn('Ollama服务检测失败:', error.message);
    return false;
  }
};

export const checkLMStudioService = async (baseUrl = 'http://127.0.0.1:1234/v1', timeout = 2000) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    await fetch(`${baseUrl}/models`, {
      method: 'GET',
      mode: 'no-cors',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log('LM Studio服务可能在线（无法确认响应内容）');
    return true;
  } catch (error) {
    console.warn('LM Studio服务检测失败:', error.message);
    return false;
  }
};

export const fetchAvailableModels = async (providerId, apiKey, baseUrl, forceRefresh = false) => {
  const provider = getProviderById(providerId);

  if (!provider) {
    console.warn(`未知的API提供商: ${providerId}`);
    return [];
  }

  const apiBaseUrl = baseUrl || provider.baseUrl;

  if (!forceRefresh && !modelsCache.isStale(providerId) && modelsCache.get(providerId).length > 0) {
    return modelsCache.get(providerId);
  }

  if (provider.requiresKey && !apiKey) {
    console.warn(`${provider.name}需要API密钥，返回默认模型列表`);
    return provider.models;
  }

  try {
    if (providerId === 'ollama') {
      const isAvailable = await checkOllamaService(apiBaseUrl, 3000);
      if (!isAvailable) {
        console.warn('Ollama服务不可用，返回默认模型列表');
        return provider.models;
      }
    } else if (providerId === 'lmstudio') {
      const isAvailable = await checkLMStudioService(apiBaseUrl, 3000);
      if (!isAvailable) {
        console.warn('LM Studio服务不可用，返回默认模型列表');
        return provider.models;
      }

      const lmStudioModels = await fetchLMStudioModels(apiBaseUrl);
      modelsCache.set(providerId, lmStudioModels);
      return lmStudioModels;
    }

    let models = [];
    switch (providerId) {
      case 'openai':
        models = await fetchOpenAIModels(apiBaseUrl, apiKey);
        break;
      case 'ollama':
        models = await fetchOllamaModels(apiBaseUrl);
        break;
      case 'claude':
        models = await fetchClaudeModels(apiBaseUrl, apiKey);
        break;
      case 'gemini':
        models = await fetchGeminiModels(apiBaseUrl, apiKey);
        break;
      case 'deepseek':
        models = await fetchDeepSeekModels(apiBaseUrl, apiKey);
        break;
      case 'siliconflow':
        models = await fetchSiliconFlowModels(apiBaseUrl, apiKey);
        break;
      default:
        models = provider.models;
    }

    if (models && models.length > 0) {
      modelsCache.set(providerId, models);
    }

    return models;
  } catch (error) {
    console.error(`获取${provider.name}模型列表失败:`, error);
    return provider.models;
  }
};

const fetchOpenAIModels = async (baseUrl, apiKey) => {
  try {
    const response = await axios.get(`${baseUrl}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 10000
    });

    if (!response.data || !response.data.data) {
      console.warn('OpenAI API返回了意外的数据格式');
      return [];
    }

    const nonChatKeywords = [
      'dall-e', 'whisper', 'tts', 'embedding', 'moderation',
      'search', 'instruct', 'ada', 'babbage', 'davinci', 'curie'
    ];

    return response.data.data
        .filter(model => {
          const modelId = model.id.toLowerCase();

          if (!modelId.includes('gpt')) {
            return false;
          }

          for (const keyword of nonChatKeywords) {
            if (modelId.includes(keyword)) {
              return false;
            }
          }

          return true;
        })
        .map(model => ({
          id: model.id,
          name: model.id.replace(/-/g, ' ').replace(/gpt/i, 'GPT'),
        }));
  } catch (error) {
    console.error('获取OpenAI聊天模型失败:', error);
    return [];
  }
};


const fetchOllamaModels = async (baseUrl) => {
  try {
    const response = await axios.get(`${baseUrl}/api/tags`, {
      timeout: 5000
    });

    if (response.data && response.data.models) {
      return response.data.models.map(model => {
        return {
          id: model.name, 
          name: model.name 
        };
      });
    } else {
      console.warn('Ollama API返回了意外的数据格式');
      return [];
    }
  } catch (error) {
    console.warn('获取Ollama模型失败:', error);
    return [];
  }
};


const fetchLMStudioModels = async (baseUrl) => {
  try {
    const response = await axios.get(`${baseUrl}/models`, {
      timeout: 5000
    });

    if (response.data && response.data.data && Array.isArray(response.data.data)) {
      return response.data.data.map(model => {
        const modelId = model.id;
        return {
          id: modelId,
          name: modelId
        };
      });
    } else {
      console.warn('无效的LM Studio API响应格式:', response.data);
    }
  } catch (error) {
    console.error('获取LM Studio模型失败:', error.message);
  }
};


const fetchClaudeModels = async (baseUrl, apiKey) => {
  try {
    const response = await axios.get(`${baseUrl}/v1/models`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      timeout: 10000
    });

    if (!response.data || !response.data.data) {
      console.warn('Claude API返回了意外的数据格式');
      return [];
    }

    return response.data.data.map(model => ({
      id: model.id,
      name: model.id
    }));
  } catch (error) {
    console.error('获取Claude模型失败:', error);
    return [];
  }
};


const fetchDeepSeekModels = async (baseUrl, apiKey) => {
  try {
    const response = await axios.get(`${baseUrl}/models`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 10000
    });

    if (!response.data || !response.data.data || !Array.isArray(response.data.data)) {
      console.warn('DeepSeek API返回了意外的数据格式');
      return [];
    }

    return response.data.data.map(model => ({
      id: model.id,
      name: model.id
    }));
  } catch (error) {
    console.error('获取DeepSeek模型失败:', error);
    return [];
  }
};


const fetchGeminiModels = async (baseUrl, apiKey) => {
  try {
    const response = await axios.get(`${baseUrl}/v1beta/openai/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 10000
    });

    if (!response.data || !response.data.data) {
      console.warn('Gemini API返回了意外的数据格式');
      return [];
    }

    return response.data.data.map(model => ({
      id: model.id,
      name: model.id.replace('gemini-', 'Gemini ').replace('-', ' ')
    }));
  } catch (error) {
    console.error('获取Gemini模型失败:', error);
    return [];
  }
};


const fetchSiliconFlowModels = async (baseUrl, apiKey) => {
  try {
    const url = `${baseUrl}/models`;

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    if (!response.data || !response.data.data || !Array.isArray(response.data.data)) {
      console.warn('SiliconFlow API返回了意外的数据格式');
      return [];
    }

    return response.data.data.map(model => {
      const modelId = model.id;

      return {
        id: modelId,
        name: modelId
      };
    });
  } catch (error) {
    console.error('获取SiliconFlow模型失败:', error);
  }
};