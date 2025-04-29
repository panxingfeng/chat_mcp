import React, { useState, useEffect, useRef } from 'react';
import './ToolsPanel.css';
import { API_CONFIG } from "../../constants";
import { SmartContentRenderer } from './MCPToolResultRenderer';
import './MCPToolResultRenderer.css';

function ToolsPanel({ onClose, onSelectTool }) {
  const [toolGroups, setToolGroups] = useState([]);
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTool, setSelectedTool] = useState(null);
  const [argValues, setArgValues] = useState({});
  const [activeGroup, setActiveGroup] = useState(null);

  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [executionError, setExecutionError] = useState(null);

  const [showSettings, setShowSettings] = useState(false);
  const [toolsPerRow, setToolsPerRow] = useState(3);
  const [viewMode, setViewMode] = useState('groups');

  const panelRef = useRef(null);

  useEffect(() => {
    document.documentElement.style.setProperty('--tools-per-row', toolsPerRow);
  }, [toolsPerRow]);

  const handleOverlayClick = (e) => {
    if (panelRef.current && !panelRef.current.contains(e.target)) {
      onClose();
    }
  };

  useEffect(() => {
    const fetchTools = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_CONFIG.base}${API_CONFIG.endpoints.tools}`);

        if (!response.ok) {
          throw new Error(`服务器响应错误: ${response.status}`);
        }

        const data = await response.json();

        if (data.return_code === 0) {
          if (data.groups && Array.isArray(data.groups)) {
            setToolGroups(data.groups);
            if (data.groups.length > 0 && !activeGroup) {
              setActiveGroup(data.groups[0].name);
            }
          } else {
            setToolGroups([]);
          }

          const allTools = [];
          if (data.groups && Array.isArray(data.groups)) {
            data.groups.forEach(group => {
              if (group.tools && Array.isArray(group.tools)) {
                group.tools.forEach(tool => {
                  allTools.push({
                    ...tool,
                    server: group.name
                  });
                });
              }
            });
            setTools(allTools);
          } else if (data.tools && Array.isArray(data.tools)) {
            setTools(data.tools);
          } else {
            setTools([]);
          }
        } else {
          throw new Error(data.return_msg || '获取工具列表失败');
        }
      } catch (err) {
        console.error('获取工具列表出错:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTools();
  }, []);

  const handleSelectTool = (tool) => {  
    setSelectedTool(tool);
    const initialArgs = {};
    if (tool.args && Array.isArray(tool.args)) {
      tool.args.forEach(arg => {
        initialArgs[arg.name] = '';
      });
    }
    setArgValues(initialArgs);
    setExecutionResult(null);
    setExecutionError(null);
    setShowSettings(false);
  };

  const handleSelectGroup = (groupName) => {
    setActiveGroup(groupName);
  };

  const toggleViewMode = () => {
    setViewMode(viewMode === 'groups' ? 'all' : 'groups');
  };

  const handleArgChange = (argName, value) => {
    setArgValues(prev => ({
      ...prev,
      [argName]: value
    }));
  };

  const testTool = async () => {
    if (!selectedTool || !selectedTool.args) {
      setExecutionError("无法获取工具参数信息");
      return;
    }

    const missingRequiredArgs = selectedTool.args
      .filter(arg => arg.required && (!argValues[arg.name] || !argValues[arg.name].trim()));

    if (missingRequiredArgs.length > 0) {
      alert(`请填写所有必填参数: ${missingRequiredArgs.map(arg => arg.name).join(', ')}`);
      return;
    }

    setExecuting(true);
    setExecutionResult(null);
    setExecutionError(null);

    try {
      const response = await fetch(`${API_CONFIG.base}${API_CONFIG.endpoints.tools}/test/${selectedTool.name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(argValues),
      });

      const data = await response.json();

      if (data.return_code === 0) {
        setExecutionResult(data.result);
      } else {
        setExecutionError(data.return_msg || '执行失败');
      }
    } catch (error) {
      console.error('测试工具时出错:', error);
      setExecutionError(`请求失败: ${error.message}`);
    } finally {
      setExecuting(false);
    }
  };

  const toggleSettings = () => {
    setShowSettings(prev => !prev);
  };

  const setGridColumns = (columns) => {
    setToolsPerRow(columns);
  };

  const getToolIcon = (toolName, serverName) => {
    const toolIcons = {
      weather: '🌤️',
      audio: '🔊',
      image: '🖼️',
      summary: '📄',
      web_search: '🔍',
      screenshot: '📸',
      get_scheduled_tasks: '📅',
      add_scheduled_task: '⏰',
      delete_scheduled_task: '🗑️',
    };

    const serverIcons = {
      playwright: '🌐',
      firecrawl: '🕸️',
      speech: '🎤',
      weather: '☁️',
      time: '⏰',
      fetch: '📡',
      github: '🐙',
      scheduler: '📅',
    };

    if (toolName && toolName in toolIcons) {
      return toolIcons[toolName];
    }

    if (serverName && serverName in serverIcons) {
      return serverIcons[serverName];
    }

    return '🔧';
  };

  const renderGroupSelector = () => {
    if (!Array.isArray(toolGroups) || toolGroups.length === 0) return null;

    return (
      <div className="group-selector">
        <div className="group-tabs">
          {toolGroups.map(group => (
            <button
              key={group.name}
              className={`group-tab ${activeGroup === group.name ? 'active' : ''}`}
              onClick={() => handleSelectGroup(group.name)}
            >
              {group.display_name || group.name}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderGroupTools = () => {
    if (!activeGroup || !Array.isArray(toolGroups)) return null;

    const currentGroup = toolGroups.find(group => group.name === activeGroup);
    if (!currentGroup) return <div className="no-tools">未找到此分组</div>;

    const groupTools = Array.isArray(currentGroup.tools) ? currentGroup.tools : [];

    return (
      <div className="group-tools">
        <h3 className="group-title">
          {getToolIcon(null, currentGroup.name)} {currentGroup.display_name || currentGroup.name}
        </h3>
        {groupTools.length === 0 ? (
          <div className="no-tools">此分组没有可用的工具</div>
        ) : (
          <ul className="tools-grid">
            {groupTools.map(tool => (
              <li key={tool.name} onClick={() => handleSelectTool(tool)} className="tool-item">
                <div className="tool-icon">{getToolIcon(tool.name, currentGroup.name)}</div>
                <div className="tool-name">{tool.name}</div>
                <div className="tool-description">{tool.description}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const renderAllTools = () => {
    if (!Array.isArray(tools) || tools.length === 0) {
      return (
        <div className="all-tools">
          <h3 className="tools-title">所有工具</h3>
          <div className="no-tools">没有可用的工具</div>
        </div>
      );
    }

    return (
      <div className="all-tools">
        <h3 className="tools-title">所有工具</h3>
        <ul className="tools-grid">
          {tools.map(tool => (
            <li key={tool.name} onClick={() => handleSelectTool(tool)} className="tool-item">
              <div className="tool-icon">{getToolIcon(tool.name, tool.server)}</div>
              <div className="tool-name">{tool.name}</div>
              <div className="tool-description">{tool.description}</div>
              {tool.server && <div className="tool-server">{tool.server}</div>}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="tools-loading">
          <div className="loading-spinner"></div>
          <span>正在加载工具列表...</span>
        </div>
      );
    }

    if (error) {
      return <div className="tools-error">加载出错: {error}</div>;
    }

    if (selectedTool) {
      return (
        <div className="tool-args-form">
          <div className="tool-header">
            <button className="back-button" onClick={() => setSelectedTool(null)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <h3>{selectedTool.name}</h3>
          </div>
          <div className="tool-description">{selectedTool.description}</div>

          <div className="args-list">
            <h4>参数:</h4>
            {Array.isArray(selectedTool.args) ? selectedTool.args.map(arg => (
              <div key={arg.name} className="arg-item">
                <label htmlFor={`arg-${arg.name}`}>
                  {arg.name}: {arg.description}
                  {arg.required && <span className="required-mark">*</span>}
                </label>
                <input
                  id={`arg-${arg.name}`}
                  type="text"
                  value={argValues[arg.name] || ''}
                  onChange={(e) => handleArgChange(arg.name, e.target.value)}
                  placeholder={`请输入${arg.name}`}
                  className="arg-input"
                />
              </div>
            )) : (
              <div className="no-args">该工具没有参数</div>
            )}
          </div>

          {(executionResult || executionError) && (
            <div className="execution-result">
              <h4>执行结果:</h4>
              {executionResult && (
                <div className="smart-result-container">
                  <SmartContentRenderer content={executionResult} />
                </div>
              )}
              {executionError && (
                <div className="error-content">{executionError}</div>
              )}
            </div>
          )}

          <div className="tools-actions">
            <button onClick={onClose} className="cancel-button">取消</button>
            <button
              onClick={testTool}
              className="test-button"
              disabled={executing}
            >
              {executing ? '执行中...' : '测试'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="tools-list">
        {showSettings && (
          <div className="layout-settings">
            <h4>布局设置</h4>
            <div className="grid-options">
              <button
                className={`grid-option ${toolsPerRow === 1 ? 'active' : ''}`}
                onClick={() => setGridColumns(1)}
                title="每行显示1个工具"
              >
                1
              </button>
              <button
                className={`grid-option ${toolsPerRow === 2 ? 'active' : ''}`}
                onClick={() => setGridColumns(2)}
                title="每行显示2个工具"
              >
                2
              </button>
              <button
                className={`grid-option ${toolsPerRow === 3 ? 'active' : ''}`}
                onClick={() => setGridColumns(3)}
                title="每行显示3个工具"
              >
                3
              </button>
            </div>

            <div className="view-options">
              <button
                className={`view-option ${viewMode === 'groups' ? 'active' : ''}`}
                onClick={() => setViewMode('groups')}
                title="按分组显示"
              >
                分组视图
              </button>
              <button
                className={`view-option ${viewMode === 'all' ? 'active' : ''}`}
                onClick={() => setViewMode('all')}
                title="显示所有工具"
              >
                全部视图
              </button>
            </div>
          </div>
        )}

        {viewMode === 'groups' && renderGroupSelector()}

        {viewMode === 'groups' ? renderGroupTools() : renderAllTools()}
      </div>
    );
  };

  return (
    <div className="tools-panel-overlay" onClick={handleOverlayClick}>
      <div className="tools-panel" ref={panelRef}>
        <div className="tools-panel-header">
          <h2>{"工具箱"}</h2>
          <div className="header-actions">
            {!selectedTool && (
              <button onClick={toggleSettings} className="settings-button" title="布局设置">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 00 1-2 2 2-2 0 1 2h.09a1.65 1.65 0 0 0 1.51 1z"></path>
                </svg>
              </button>
            )}
            {!selectedTool && viewMode === 'groups' && (
              <button onClick={toggleViewMode} className="view-toggle-button" title="切换到全部视图">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
              </button>
            )}
            {!selectedTool && viewMode === 'all' && (
              <button onClick={toggleViewMode} className="view-toggle-button" title="切换到分组视图">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="tools-panel-content">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

export default ToolsPanel;