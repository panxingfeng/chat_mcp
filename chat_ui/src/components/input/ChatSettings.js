import React, { useState, useEffect, useRef } from 'react';
import {
  apiProviders,
  getProviderById,
  getDefaultChatSettings,
  fetchAvailableModels, modelsCache
} from '../../config/apiConfig';
import './ChatSettings.css';

function ChatSettings({ isOpen, onClose, onSave, initialSettings, globalSettings }) {
  const defaultSettings = getDefaultChatSettings();

  const [settings, setSettings] = useState({
    ...defaultSettings,
    ...initialSettings,
    providerSettings: initialSettings?.providerSettings || {
      openai: { apiEndpoint: 'https://api.openai.com', apiKey: initialSettings?.apiKey || '' },
      gemini: { apiEndpoint: 'https://generativelanguage.googleapis.com', apiKey: '' },
      ollama: { apiEndpoint: 'http://127.0.0.1:11434', apiKey: '' },
      lmstudio: { apiEndpoint: 'http://127.0.0.1:1234/v1', apiKey: '' },
      deepseek: { apiEndpoint: 'https://api.deepseek.com', apiKey: '' },
      siliconflow: { apiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions', apiKey: '' },
    },
    showModelSettings: true
  });

  useEffect(() => {
    if (isOpen && initialSettings) {
      const providerConfig = initialSettings.providerSettings?.[initialSettings.apiProvider] || {};

      setSettings({
        ...defaultSettings,
        ...initialSettings,
        apiEndpoint: providerConfig.apiEndpoint || (initialSettings.apiEndpoint || defaultSettings.apiEndpoint),
        apiKey: providerConfig.apiKey || (initialSettings.apiKey || ''),
        providerSettings: initialSettings.providerSettings || defaultSettings.providerSettings
      });

      setHasChanges(false);
    }
  }, [isOpen]);

  const [hasChanges, setHasChanges] = useState(false);

  const [showProviderDropdown, setShowProviderDropdown] = useState(false);

  const providerDropdownRef = useRef(null);
  const providerButtonRef = useRef(null);
  const modalContentRef = useRef(null);

  const currentProvider = getProviderById(settings.apiProvider) || apiProviders[0];

  const [availableModels, setAvailableModels] = useState([]);

  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    if (initialSettings) {
      const providerConfig = initialSettings.providerSettings?.[initialSettings.apiProvider] || {};

      setSettings(prev => ({
        ...prev,
        ...initialSettings,
        apiEndpoint: providerConfig.apiEndpoint || (initialSettings.apiEndpoint || prev.apiEndpoint),
        apiKey: providerConfig.apiKey || (initialSettings.apiKey || prev.apiKey),
        providerSettings: initialSettings.providerSettings || prev.providerSettings
      }));

      if (initialSettings.apiProvider) {
        const provider = getProviderById(initialSettings.apiProvider);
        if (provider) {
          setAvailableModels(provider.models);

          const apiKey = providerConfig.apiKey || initialSettings.apiKey;
          const apiEndpoint = providerConfig.apiEndpoint || initialSettings.apiEndpoint;

          fetchModelsForProvider(
            initialSettings.apiProvider,
            apiKey,
            apiEndpoint
          );
        }
      }
    }
    setHasChanges(false);
  }, [initialSettings]);

  useEffect(() => {
    const provider = getProviderById(settings.apiProvider);
    if (provider) {
      setAvailableModels(provider.models);

      const providerConfig = settings.providerSettings?.[settings.apiProvider] || {};

      const apiKey = providerConfig.apiKey || '';
      let apiEndpoint = providerConfig.apiEndpoint;

      if (!provider.requiresCustomEndpoint || !apiEndpoint) {
        apiEndpoint = (globalSettings && globalSettings[provider.id] && globalSettings[provider.id].endpoint)
          ? globalSettings[provider.id].endpoint
          : provider.baseUrl;
      }

      setSettings(prev => ({
        ...prev,
        apiKey: provider.requiresKey ? apiKey : '',
        apiEndpoint: apiEndpoint,
      }));

      fetchModelsForProvider(
        settings.apiProvider,
        apiKey,
        apiEndpoint
      );

      const modelExists = provider.models.some(m => m.id === settings.model);
      if (!modelExists) {
        setSettings(prev => ({
          ...prev,
          model: provider.defaultModel
        }));
      }
    }
  }, [settings.apiProvider, globalSettings]);

  useEffect(() => {
    if (currentProvider.requiresKey && settings.apiKey) {
      fetchModelsForProvider(
        settings.apiProvider,
        settings.apiKey,
        settings.apiEndpoint
      );
    }
  }, [settings.apiKey]);

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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showProviderDropdown &&
          providerDropdownRef.current &&
          !providerDropdownRef.current.contains(event.target) &&
          providerButtonRef.current &&
          !providerButtonRef.current.contains(event.target)) {
        setShowProviderDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProviderDropdown]);

  const handleBackdropClick = (event) => {
    if (event.target.className === 'chat-settings-modal') {
      handleClose();
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      if (window.confirm('您有未保存的更改，确定要离开吗？')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleSettingChange = (e) => {
    const { name, value } = e.target;

    setHasChanges(true);

    if (name === 'apiEndpoint' || name === 'apiKey') {
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

  const selectProvider = (providerId) => {
    setHasChanges(true);
    const provider = getProviderById(providerId);
    const providerConfig = settings.providerSettings?.[providerId] || {};

    let apiEndpoint = providerConfig.apiEndpoint;
    const apiKey = providerConfig.apiKey || '';

    setSettings(prev => ({
      ...prev,
      apiProvider: providerId,
      apiEndpoint: apiEndpoint,
      apiKey: provider.requiresKey ? apiKey : ''
    }));

    setShowProviderDropdown(false);
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
    onClose();
  };

  const toggleModelSettings = () => {
    setHasChanges(true);
    setSettings(prev => ({
      ...prev,
      showModelSettings: !prev.showModelSettings
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="chat-settings-modal" onClick={handleBackdropClick}>
      <div className="chat-settings-container" ref={modalContentRef}>
        <div className="chat-settings-header">
          <h2>对话设置</h2>
          <button className="close-button" onClick={handleClose}>×</button>
        </div>

        <div className="chat-settings-content">
          <div className="avatar-section">
            <div className="avatar-circle">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" className="robot-icon">
                <rect x="50" y="40" width="100" height="90" rx="15" ry="15" fill="none" stroke="#000000" strokeWidth="5" />
                <rect x="60" y="55" width="80" height="60" rx="10" ry="10" fill="none" stroke="#000000" strokeWidth="3" />
                <circle cx="80" cy="80" r="8" fill="#000000" />
                <circle cx="120" cy="80" r="8" fill="#000000" />
                <path d="M85 100 Q100 115 115 100" stroke="#000000" strokeWidth="4" fill="none" />
                <line x1="75" y1="40" x2="70" y2="20" stroke="#000000" strokeWidth="4" />
                <circle cx="70" cy="18" r="5" fill="#000000" />
                <line x1="125" y1="40" x2="130" y2="20" stroke="#000000" strokeWidth="4" />
                <circle cx="130" cy="18" r="5" fill="#000000" />
                <rect x="65" y="130" width="70" height="50" rx="10" ry="10" fill="none" stroke="#000000" strokeWidth="5" />
                <circle cx="100" cy="145" r="6" fill="#000000" />
                <circle cx="100" cy="165" r="6" fill="#000000" />
                <rect x="30" y="140" width="35" height="12" rx="6" ry="6" fill="none" stroke="#000000" strokeWidth="4" />
                <rect x="135" y="140" width="35" height="12" rx="6" ry="6" fill="none" stroke="#000000" strokeWidth="4" />
              </svg>
            </div>
          </div>

          <div className="setting-group">
            <label className="setting-label">名称</label>
            <input
              type="text"
              name="name"
              value={settings.name}
              onChange={handleSettingChange}
              placeholder="输入对话名称"
              className="setting-input"
            />
          </div>

          <div className="setting-group">
            <label className="setting-label">系统提示（角色设定）</label>
            <textarea
              name="systemPrompt"
              value={settings.systemPrompt}
              onChange={handleSettingChange}
              placeholder="输入系统提示词来设定AI的角色"
              className="setting-textarea"
              rows={4}
            />
          </div>

          <div className="collapsible-panel">
            <div
              className="collapsible-header"
              onClick={toggleModelSettings}
            >
              <span>特定模型设置</span>
              <span className={`arrow-icon ${settings.showModelSettings ? 'open' : ''}`}>
                ▼
              </span>
            </div>

            {settings.showModelSettings && (
              <div className="collapsible-content">
                <div className="setting-group">
                  <label className="setting-label">模型服务商</label>
                  <div className="provider-selector">
                    <button
                      ref={providerButtonRef}
                      className="provider-button"
                      onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                    >
                      {currentProvider.name}
                      <span className="dropdown-arrow">▼</span>
                    </button>

                    {showProviderDropdown && (
                      <ul className="provider-dropdown" ref={providerDropdownRef}>
                        {apiProviders.map(provider => (
                          <li
                            key={provider.id}
                            className={`provider-option ${provider.id === settings.apiProvider ? 'active' : ''}`}
                            onClick={() => selectProvider(provider.id)}
                          >
                            <span className="provider-icon">●</span>
                            <span>{provider.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="setting-group">
                  <label className="setting-label">模型</label>
                  <div className="model-selector-container">
                    <select
                      name="model"
                      value={settings.model}
                      onChange={handleSettingChange}
                      className={`setting-select ${loadingModels ? 'loading' : ''}`}
                      disabled={loadingModels}
                    >
                      {loadingModels ? (
                        <option value="">加载中...</option>
                      ) : (
                        availableModels.map(model => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))
                      )}
                    </select>
                    {loadingModels && (
                      <div className="model-loading-indicator">
                        <span className="spinner"></span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="setting-group">
                  <label className="setting-label">上下文的消息数量上限</label>
                  <div className="slider-container">
                    <input
                      type="range"
                      name="maxTokens"
                      min="1"
                      max="50"
                      value={settings.maxTokens}
                      onChange={(e) => {
                        handleSettingChange(e);
                        e.target.style.setProperty('--slider-percent', `${(e.target.value - e.target.min) / (e.target.max - e.target.min) * 100}%`);
                      }}
                      className="slider"
                      style={{ '--slider-percent': `${(settings.maxTokens - 1) / 49 * 100}%` }}
                    />
                    <input
                      type="number"
                      name="maxTokens"
                      value={settings.maxTokens}
                      onChange={handleSettingChange}
                      className="slider-value-input"
                      min="1"
                      max="50"
                    />
                  </div>
                </div>

                <div className="setting-group">
                  <label className="setting-label">Temperature</label>
                  <div className="slider-container">
                    <input
                      type="range"
                      name="temperature"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.temperature}
                      onChange={(e) => {
                        handleSettingChange(e);
                        e.target.style.setProperty('--slider-percent', `${(e.target.value - e.target.min) / (e.target.max - e.target.min) * 100}%`);
                      }}
                      className="slider"
                      style={{ '--slider-percent': `${settings.temperature * 100}%` }}
                    />
                    <input
                      type="number"
                      name="temperature"
                      value={settings.temperature}
                      onChange={handleSettingChange}
                      className="slider-value-input"
                      min="0"
                      max="1"
                      step="0.1"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="chat-settings-footer">
          <button className="cancel-button" onClick={handleClose}>取消</button>
          <button className="save-button" onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  );
}

export default ChatSettings;