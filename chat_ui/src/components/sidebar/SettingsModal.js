import React, { useState, useEffect, useRef } from 'react';
import {
  apiProviders,
  getProviderById,
  getProviderModels,
  fetchAvailableModels, modelsCache
} from '../../config/apiConfig';
import './SettingsModal.css';

const codeThemes = [
  { id: 'atomDark', name: '暗黑' },
  { id: 'vsLight', name: '明亮' },
  { id: 'dracula', name: '德古拉' },
  { id: 'github', name: 'GitHub' },
  { id: 'monokai', name: 'Monokai' }
];

const fontOptions = [
  { id: 'default', name: '默认字体' },
  { id: 'noto-sans', name: '思源黑体' },
  { id: 'roboto', name: 'Roboto' },
  { id: 'serif', name: '衬线字体' },
  { id: 'mono', name: '等宽字体' }
];

const fontSizeOptions = [
  { id: 'small', name: '小' },
  { id: 'medium', name: '中' },
  { id: 'large', name: '大' },
  { id: 'xlarge', name: '超大' }
];

function SettingsModal({ isOpen, onClose, initialSettings, onSave, globalSettings, onSaveGlobalSettings }) {
  const defaultSettings = {
    apiProvider: 'ollama',
    apiEndpoint: 'http://127.0.0.1:11434',
    apiKey: '',
    model: 'qwen2.5:latest',
    maxTokens: 10,
    temperature: 0.7,
    theme: 'light',
    codeTheme: 'atomDark',
    font: 'default',
    fontSize: 'medium'
  };

  const [settings, setSettings] = useState({
    ...defaultSettings,
    ...initialSettings,
    providerSettings: initialSettings?.providerSettings || {
      openai: { apiEndpoint: 'https://api.openai.com', apiKey: initialSettings?.apiKey || '' },
      claude: { apiEndpoint: 'https://api.anthropic.com', apiKey: '' },
      gemini: { apiEndpoint: 'https://generativelanguage.googleapis.com', apiKey: '' },
      ollama: { apiEndpoint: 'http://127.0.0.1:11434', apiKey: '' },
      lmstudio: { apiEndpoint: 'http://127.0.0.1:1234/v1', apiKey: '' },
      deepseek: { apiEndpoint: 'https://api.deepseek.com', apiKey: '' },
      siliconflow: { apiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions', apiKey: '' },
    }
  });

  const [activeTab, setActiveTab] = useState('model');

  const [hasChanges, setHasChanges] = useState(false);

  const [currentProvider, setCurrentProvider] = useState(
    getProviderById(settings.apiProvider) || apiProviders[3]
  );

  const [availableModels, setAvailableModels] = useState(
    getProviderModels(settings.apiProvider)
  );

  const [loadingModels, setLoadingModels] = useState(false);

  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen && initialSettings) {
      setSettings({
        ...defaultSettings,
        ...initialSettings,
        providerSettings: initialSettings.providerSettings || {
          openai: { apiEndpoint: 'https://api.openai.com', apiKey: initialSettings?.apiKey || '' },
          claude: { apiEndpoint: 'https://api.anthropic.com', apiKey: '' },
          gemini: { apiEndpoint: 'https://generativelanguage.googleapis.com', apiKey: '' },
          ollama: { apiEndpoint: 'http://127.0.0.1:11434', apiKey: '' },
          lmstudio: { apiEndpoint: 'http://127.0.0.1:1234/v1', apiKey: '' },
          deepseek: { apiEndpoint: 'https://api.deepseek.com', apiKey: '' },
          siliconflow: { apiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions', apiKey: '' },
        }
      });

      setHasChanges(false);

      if (initialSettings.apiProvider) {
        const provider = getProviderById(initialSettings.apiProvider);
        if (provider) {
          setCurrentProvider(provider);
          setAvailableModels(getProviderModels(initialSettings.apiProvider));
          fetchModelsForProvider(initialSettings.apiProvider, initialSettings.apiKey);
        }
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialSettings && isOpen) {
      setSettings(prev => ({
        ...prev,
        ...initialSettings
      }));

      if (initialSettings.apiProvider) {
        const provider = getProviderById(initialSettings.apiProvider);
        if (provider) {
          setCurrentProvider(provider);
          setAvailableModels(getProviderModels(initialSettings.apiProvider));
          fetchModelsForProvider(initialSettings.apiProvider, initialSettings.apiKey);
        }
      }
    }
  }, [initialSettings]);

  useEffect(() => {
    if (settings.apiProvider) {
      const provider = getProviderById(settings.apiProvider);
      if (provider) {
        setCurrentProvider(provider);
        setAvailableModels(getProviderModels(settings.apiProvider));
        const providerConfig = settings.providerSettings[settings.apiProvider] || {};
        setSettings(prev => ({
          ...prev,
          apiEndpoint: providerConfig.apiEndpoint || provider.baseUrl,
          apiKey: providerConfig.apiKey || ''
        }));

        fetchModelsForProvider(
          settings.apiProvider,
          providerConfig.apiKey || '',
          providerConfig.apiEndpoint || provider.baseUrl
        );

        const models = getProviderModels(settings.apiProvider);
        const modelExists = models.some(m => m.id === settings.model);
        if (!modelExists) {
          setSettings(prev => ({
            ...prev,
            model: provider.defaultModel
          }));
        }
      }
    }
  }, [settings.apiProvider]);

  useEffect(() => {
    if (currentProvider.requiresKey && settings.apiKey) {
      fetchModelsForProvider(settings.apiProvider, settings.apiKey);
    }
  }, [settings.apiKey]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, hasChanges]);

  useEffect(() => {
    if (settings.theme) {
      document.body.className = `theme-${settings.theme}`;

      if (settings.font) {
        document.documentElement.style.setProperty('--font-family', getFontFamily(settings.font));
      }

      if (settings.fontSize) {
        document.documentElement.style.setProperty('--font-size-base', getFontSize(settings.fontSize));
      }
    }
  }, [settings.theme, settings.font, settings.fontSize]);

  const getFontFamily = (fontId) => {
    switch(fontId) {
      case 'noto-sans':
        return "'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif";
      case 'roboto':
        return "'Roboto', -apple-system, BlinkMacSystemFont, sans-serif";
      case 'serif':
        return "'Noto Serif SC', Georgia, 'Times New Roman', serif";
      case 'mono':
        return "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace";
      default:
        return "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif";
    }
  };

  const getFontSize = (sizeId) => {
    switch(sizeId) {
      case 'small': return '14px';
      case 'large': return '16px';
      case 'xlarge': return '18px';
      default: return '15px';
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      if (window.confirm('您有未保存的更改，确定要离开吗？')) {
        setHasChanges(false);
        onClose();
      }
    } else {
      onClose();
    }
  };

  const fetchModelsForProvider = async (providerId, apiKey, apiEndpoint) => {
    const provider = getProviderById(providerId);

    const cachedModels = modelsCache.get(providerId);
    if (cachedModels && cachedModels.length > 0) {
      setAvailableModels(cachedModels);

      const modelExists = cachedModels.some(m => m.id === settings.model);
      if (!modelExists) {
        setSettings(prev => ({
          ...prev,
          model: provider.defaultModel
        }));
      }
    }

    if (provider && (!provider.requiresKey || (provider.requiresKey && apiKey))) {
      setLoadingModels(true);

      try {
        const models = await fetchAvailableModels(providerId, apiKey, apiEndpoint);

        if (models && models.length > 0) {
          setAvailableModels(models);

          const modelExists = models.some(m => m.id === settings.model);
          if (!modelExists) {
            setSettings(prev => ({
              ...prev,
              model: provider.defaultModel
            }));
          }
        }
      } catch (error) {
        console.error(`获取${provider.name}模型列表失败:`, error);
        setAvailableModels(provider.models);
      } finally {
        setLoadingModels(false);
      }
    }
  };

  const handleSettingChange = (e) => {
    const { name, value } = e.target;
    setHasChanges(true);

    if (['apiEndpoint', 'apiKey'].includes(name)) {
      setSettings(prev => ({
        ...prev,
        [name]: value, 
        providerSettings: {
          ...prev.providerSettings,
          [prev.apiProvider]: {
            ...prev.providerSettings[prev.apiProvider],
            [name]: value
          }
        }
      }));
    } else {
      setSettings(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleProviderChange = (e) => {
    setHasChanges(true);

    setSettings({
      ...settings,
      apiProvider: e.target.value
    });
  };

  const handleThemeChange = (e) => {
    const { value } = e.target;
    setHasChanges(true);
    setSettings(prev => ({
      ...prev,
      theme: value
    }));
  };

  const handleSave = () => {
    const updatedSettings = {
      ...settings,
      providerSettings: {
        ...settings.providerSettings,
        [settings.apiProvider]: {
          ...settings.providerSettings[settings.apiProvider],
          apiEndpoint: settings.apiEndpoint,
          apiKey: settings.apiKey
        }
      }
    };

    setHasChanges(false);

    onSave(updatedSettings);

    if (typeof onSaveGlobalSettings === 'function') {
      onSaveGlobalSettings({
        ...globalSettings,
        providerSettings: updatedSettings.providerSettings
      });
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="settings-modal-overlay" onClick={handleClose}>
      <div className="settings-modal-container" ref={modalRef} onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <div className="header-left">
            <button className="back-button" onClick={handleClose}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <h2>设置</h2>
          </div>
        </div>

        <div className="settings-tabs">
          <div
            className={`settings-tab ${activeTab === 'model' ? 'active' : ''}`}
            onClick={() => setActiveTab('model')}
          >
            模型设置
          </div>
          <div
            className={`settings-tab ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            全局样式
          </div>
        </div>

        <div className="settings-content">
          {activeTab === 'model' && (
            <div className="model-settings">
              <div className="settings-section">
                <div className="settings-label">模型提供方</div>
                <div className="settings-input">
                  <select
                    name="apiProvider"
                    value={settings.apiProvider}
                    onChange={handleProviderChange}
                    className="settings-select"
                  >
                    {apiProviders.map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-label">API 地址</div>
                <div className="settings-input endpoint-input">
                  <input
                    type="text"
                    name="apiEndpoint"
                    value={settings.apiEndpoint}
                    onChange={handleSettingChange}
                    className="settings-text-input"
                    placeholder={`${currentProvider.name} API地址`}
                  />
                </div>
              </div>

              {currentProvider.requiresKey && (
                <div className="settings-section">
                  <div className="settings-label">API密钥</div>
                  <div className="settings-input endpoint-input">
                    <input
                      type="password"
                      name="apiKey"
                      value={settings.apiKey}
                      onChange={handleSettingChange}
                      className="settings-text-input"
                      placeholder={currentProvider.keyPlaceholder || `输入${currentProvider.name}的API密钥`}
                    />
                  </div>
                </div>
              )}

              <div className="settings-section">
                <div className="settings-label">模型</div>
                <div className="settings-input">
                  <select
                    name="model"
                    value={settings.model}
                    onChange={handleSettingChange}
                    className="settings-select"
                    disabled={loadingModels}
                  >
                    {loadingModels ? (
                      <option value="">加载中...</option>
                    ) : (
                      availableModels.map(model => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))
                    )}
                  </select>
                  {loadingModels && (
                    <div className="loading-indicator">
                      <span className="loader"></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="appearance-settings">
              <div className="settings-section">
                <div className="settings-label">主题模式</div>
                <div className="settings-input theme-selector">
                  <label className={`theme-option ${settings.theme === 'light' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="theme"
                      value="light"
                      checked={settings.theme === 'light'}
                      onChange={handleThemeChange}
                    />
                    <span className="theme-icon light-icon">☀️</span>
                    <span className="theme-name">白天</span>
                  </label>
                  <label className={`theme-option ${settings.theme === 'dark' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="theme"
                      value="dark"
                      checked={settings.theme === 'dark'}
                      onChange={handleThemeChange}
                    />
                    <span className="theme-icon dark-icon">🌙</span>
                    <span className="theme-name">黑夜</span>
                  </label>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-label">字体</div>
                <div className="settings-input">
                  <select
                    name="font"
                    value={settings.font}
                    onChange={handleSettingChange}
                    className="settings-select"
                  >
                    {fontOptions.map(font => (
                      <option key={font.id} value={font.id}>
                        {font.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="settings-footer">
          <button className="cancel-button" onClick={handleClose}>取消</button>
          <button className="save-button" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;