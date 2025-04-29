import React, { useState, useRef, useEffect, useCallback } from 'react';
import './ChatApp.css';
import MessageList from './components/message/MessageList';
import ChatInput from './components/input/ChatInput';
import Sidebar from './components/sidebar/Sidebar';
import Header from './components/header/Header';
import SettingsModal from './components/sidebar/SettingsModal';
import ChatSettings from './components/input/ChatSettings';
import { getDefaultChatSettings } from './config/apiConfig';
import useLocalStorage from './hooks/useLocalStorage';
import PartnerSettings from "./components/sidebar/PartnerSettings";
import {applyPartnerToChat} from "./config/partnersConfig";
import {API_CONFIG} from "./constants";

function ChatApp() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState([
    { id: 1, title: '新对话', messages: [] }
  ]);
  const [currentConversation, setCurrentConversation] = useState("default-conversation");
  const [userId] = useState("d5a93772-b9d8-44fd-9168-28cf03d246cb");
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const messageEndRef = useRef(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showPartnerSettings, setShowPartnerSettings] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [settings, setSettings] = useState(getDefaultChatSettings());
  const defaultGlobalSettings = {
    providerSettings: {
      openai: { apiEndpoint: 'https://api.openai.com', apiKey: '' },
      gemini: { apiEndpoint: 'https://generativelanguage.googleapis.com', apiKey: '' },
      ollama: { apiEndpoint: 'http://127.0.0.1:11434', apiKey: '' },
      lmstudio: { apiEndpoint: 'http://127.0.0.1:1234/v1', apiKey: '' },
      deepseek: { apiEndpoint: 'https://api.deepseek.com', apiKey: '' },
      siliconflow: { apiEndpoint: 'https://api.siliconflow.cn/v1/chat/completions', apiKey: '' },
    }
  };

  const [globalSettings, setGlobalSettings] = useState(defaultGlobalSettings);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const prevAppDataRef = useRef(null);
  const updateInProgressRef = useRef(false);

  const cleanupDuplicateEmptyChats = useCallback(() => {
    const emptyNewChats = conversations.filter(conv =>
      conv.title === '新对话' && (!conv.messages || conv.messages.length === 0)
    );

    if (emptyNewChats.length > 1) {
      const toKeep = emptyNewChats[0].id;
      const toDelete = emptyNewChats.slice(1).map(conv => conv.id);

      const cleanedConversations = conversations.filter(
        conv => !toDelete.includes(conv.id)
      );

      setConversations(cleanedConversations);

      if (toDelete.includes(currentConversation)) {
        switchConversation(toKeep);
      }
    }
  }, [conversations, currentConversation]);

  const deleteMessage = useCallback((messageId) => {
    setMessages(prevMessages => {
      const updatedMessages = prevMessages.filter(msg => msg.id !== messageId);

      if (updatedMessages.length === 0) {
        const emptyNewChats = conversations.filter(conv => {
          if (conv.id === currentConversation) {
            return updatedMessages.length === 0 && conv.title === '新对话';
          }
          return conv.title === '新对话' && (!conv.messages || conv.messages.length === 0);
        });

        if (emptyNewChats.length > 1 || conversations.length > 1) {
          setTimeout(() => deleteConversation(currentConversation), 0);
          return updatedMessages;
        }
      }

      setTimeout(() => updateConversation(updatedMessages), 0);
      return updatedMessages;
    });
  }, [conversations, currentConversation]);

  const {
    saveDataToLocalStorage,
    loadDataFromLocalStorage,
    saveSetting,
    loadSetting,
    isDataLoaded,
    exportData,
    importData
  } = useLocalStorage();

  const [theme, setTheme] = useState(localStorage.getItem('app-theme') || 'light');

  useEffect(() => {
    document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-auto');
    document.documentElement.classList.add(`theme-${theme}`);
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
    const themeChangeEvent = new CustomEvent('themechange', { detail: { theme } });
    document.dispatchEvent(themeChangeEvent);
  }, [theme]);

  const updateTheme = (newTheme) => {
    setTheme(newTheme);
  };
  
  

  useEffect(() => {
    const appData = loadDataFromLocalStorage();
  
    if (appData) {
      console.log("加载到本地数据:", appData);
  
      if (appData.conversations && appData.conversations.length > 0) {
        setConversations(appData.conversations);
        
        if (appData.currentConversation) {
          setCurrentConversation(appData.currentConversation);
          
          const conversation = appData.conversations.find(
            conv => conv.id === appData.currentConversation
          );
          if (conversation && conversation.messages) {
            setMessages(conversation.messages);
          } else {
            setMessages([]);
          }
        } else {
          const firstConversation = appData.conversations[0];
          setCurrentConversation(firstConversation.id);
          setMessages(firstConversation.messages || []);
        }
      }
  
      if (appData.settings) {
        setSettings(appData.settings);
      }
  
      if (appData.globalSettings) {
        setGlobalSettings(appData.globalSettings);
      }
    } else {
      const savedGlobalSettings = loadSetting('globalApiSettings', {});
      if (Object.keys(savedGlobalSettings).length > 0) {
        setGlobalSettings(savedGlobalSettings);
      }
  
      const savedSettings = loadSetting('chatSettings', getDefaultChatSettings());
      if (Object.keys(savedSettings).length > 0) {
        setSettings(savedSettings);
      }
    }
  }, [loadDataFromLocalStorage, loadSetting]);

  useEffect(() => {
    if (!isDataLoaded) return;
    if (updateInProgressRef.current) return;

    cleanupDuplicateEmptyChats();
    const appData = {
      conversations,
      currentConversation,
      settings,
      globalSettings
    };
    const prevAppData = prevAppDataRef.current;
    const hasChanges = !prevAppData ||
      JSON.stringify(prevAppData.conversations) !== JSON.stringify(appData.conversations) ||
      prevAppData.currentConversation !== appData.currentConversation ||
      JSON.stringify(prevAppData.settings) !== JSON.stringify(appData.settings) ||
      JSON.stringify(prevAppData.globalSettings) !== JSON.stringify(appData.globalSettings);

    if (hasChanges) {
      prevAppDataRef.current = { ...appData };
      saveDataToLocalStorage(appData);
    }
  }, [conversations, currentConversation, settings, globalSettings, isDataLoaded, saveDataToLocalStorage, cleanupDuplicateEmptyChats]);

  const updateConversation = useCallback((updatedMessages) => {
    if (updateInProgressRef.current) return;

    updateInProgressRef.current = true;

    setConversations(prevConversations => {
      const updatedConversations = prevConversations.map(conv => {
        if (conv.id === currentConversation) {
          let title = '新对话';
          const firstUserMessage = updatedMessages.find(msg => msg.role === 'user');
          if (firstUserMessage) {
            title = firstUserMessage.content.substring(0, 20);
            if (firstUserMessage.content.length > 20) {
              title += '...';
            }
          }

          return {
            ...conv,
            title,
            messages: updatedMessages,
          };
        }
        return conv;
      });

      setTimeout(() => {
        updateInProgressRef.current = false;
      }, 0);

      return updatedConversations;
    });
  }, [currentConversation]);

  const sendMessage = useCallback(async (messageObject, isConnected = true, chatSettings = settings, apiGlobalSettings = globalSettings) => {
    if (!messageObject.content.trim()) return;

    const providerConfig = apiGlobalSettings.providerSettings[messageObject.model.provider] || {};
    const apiKey = providerConfig.apiKey || '';

    const userMessage = {
      id: messageObject.id,
      role: 'user',
      content: messageObject.content,
      timestamp: messageObject.timestamp,
      userId: messageObject.userId,
      conversationId: messageObject.conversationId,
      model: messageObject.model
    };

    setMessages(prevMessages => {
      const updatedMessages = [...prevMessages, userMessage];
      setTimeout(() => updateConversation(updatedMessages), 0);
      return updatedMessages;
    });

    const streamingMessageId = `stream-${Date.now()}`;
    const streamingMessage = {
      id: streamingMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      userId: messageObject.userId,
      conversationId: messageObject.conversationId,
      model: messageObject.model
    };

    setMessages(prevMessages => [...prevMessages, streamingMessage]);
    setStreamingMessageId(streamingMessageId);
    setLoading(true);

    try {
      let contextMessages = [];
      if (messages.length > 0) {
        const contextLimit = chatSettings.maxTokens || 20;

        const messagesForContext = messages.slice(-contextLimit);

        contextMessages = messagesForContext.map(msg => ({
          role: msg.role,
          content: msg.content,
          id: msg.id
        }));
      }

      const response = await fetch(`${API_CONFIG.base}${API_CONFIG.endpoints.chat}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageObject.content,
          model: messageObject.model.name,
          provider: messageObject.model.provider,
          userId: messageObject.userId,
          messageId: messageObject.id,
          conversationId: messageObject.conversationId,
          historyMessage: contextMessages,
          settings: {
            temperature: chatSettings.temperature,
            maxTokens: chatSettings.maxTokens,
            systemPrompt: chatSettings.systemPrompt
          },
          apiKey: apiKey,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const content = line.substring(6);
              const parsedData = JSON.parse(content);

              if (parsedData.type === 'error') {
                console.error('流式输出错误:', parsedData.content);
                continue;
              }

              let parsedContent = parsedData.content;

              if (typeof parsedContent === 'object' && parsedContent !== null) {
                parsedContent = parsedContent.content || parsedContent.text || JSON.stringify(parsedContent);
              }

              fullContent += parsedContent;

              setMessages(currentMessages => {
                return currentMessages.map(msg => {
                  if (msg.id === streamingMessageId) {
                    return {
                      ...msg,
                      content: fullContent
                    };
                  }
                  return msg;
                });
              });
            } catch (error) {
              console.error('解析数据块时出错:', error, line.substring(6));
            }
          }
        }
      }

      const aiResponse = {
        id: Date.now().toString(),
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString(),
        userId: messageObject.userId,
        conversationId: messageObject.conversationId,
        model: messageObject.model
      };

      setMessages(currentMessages => {
        const messagesWithoutStreaming = currentMessages.filter(
          msg => msg.id !== streamingMessageId
        );
        const finalMessages = [...messagesWithoutStreaming, aiResponse];

        setTimeout(() => {
          const userMsgIndex = messagesWithoutStreaming.findIndex(
            msg => msg.id === messageObject.id
          );

          if (userMsgIndex !== -1) {
            const contextMessages = [...messagesWithoutStreaming, aiResponse];
            updateConversation(contextMessages);
          } else {
            updateConversation(finalMessages);
          }
        }, 0);

        return finalMessages;
      });

    } catch (error) {
      console.error('获取AI响应时出错:', error);
      const errorMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `发生错误: ${error.message}. 请稍后再试.`,
        timestamp: new Date().toISOString(),
        userId: messageObject.userId,
        conversationId: messageObject.conversationId,
        model: messageObject.model,
        isError: true
      };

      setMessages(currentMessages => {
        const messagesWithoutStreaming = currentMessages.filter(
          msg => msg.id !== streamingMessageId
        );
        const finalMessages = [...messagesWithoutStreaming, errorMessage];

        setTimeout(() => {
          const userMsgIndex = messagesWithoutStreaming.findIndex(
            msg => msg.id === messageObject.id
          );

          if (userMsgIndex !== -1) {
            const contextMessages = [...messagesWithoutStreaming, errorMessage];
            updateConversation(contextMessages);
          } else {
            updateConversation(finalMessages);
          }
        }, 0);

        return finalMessages;
      });
    } finally {
      setLoading(false);
      setStreamingMessageId(null);
    }
  }, [settings, globalSettings, updateConversation, messages]);

  useEffect(() => {
    const handleImageEditRequest = (event) => {
      const { messageText, imageUrl } = event.detail;
      
      if (messageText && imageUrl) {
        const fullMessage = `${messageText}\n![图片](${imageUrl})`;
        
        const messageObject = {
          id: Date.now().toString(),
          content: fullMessage,
          userId: userId,
          conversationId: currentConversation,
          timestamp: new Date().toISOString(),
          model: {
            name: settings.model,
            provider: settings.apiProvider
          }
        };
        
        sendMessage(messageObject, false, settings);
      }
    };
    
    document.addEventListener('image-edit-request', handleImageEditRequest);
    
    return () => {
      document.removeEventListener('image-edit-request', handleImageEditRequest);
    };
  }, [userId, currentConversation, settings, sendMessage]);

  const switchConversation = useCallback((id) => {
    setCurrentConversation(id);
    const conversation = conversations.find(conv => conv.id === id);
    setMessages(conversation ? conversation.messages : []);
  }, [conversations]);

  const createNewConversation = useCallback(() => {
    const emptyNewChat = conversations.find(
      conv => conv.title === '新对话' && (!conv.messages || conv.messages.length === 0)
    );
  
    if (emptyNewChat) {
      switchConversation(emptyNewChat.id);
      return;
    }
  
    const newId = Date.now();
    const newConversation = {
      id: newId,
      title: '新对话',
      messages: [],
    };
  
    setConversations(prevConversations => [newConversation, ...prevConversations]);
    setCurrentConversation(newId);
    setMessages([]);
  }, [conversations, switchConversation]);

  const deleteConversation = useCallback((id) => {
    const updatedConversations = conversations.filter(conv => conv.id !== id);
    if (id === currentConversation) {
      const newId = Date.now();
      const newConversation = {
        id: newId,
        title: '新对话',
        messages: []
      };

      const finalConversations = [newConversation, ...updatedConversations];

      setConversations(finalConversations);

      setCurrentConversation(newId);
      setMessages([]);
    } else {
      setConversations(updatedConversations);
    }
  }, [conversations, currentConversation]);

  const exportChatHistory = useCallback(() => {
    const currentConv = conversations.find(conv => conv.id === currentConversation);
    if (!currentConv || !currentConv.messages || currentConv.messages.length === 0) {
      alert('没有可导出的聊天记录');
      return;
    }

    let exportContent = `# ${currentConv.title}\n\n`;
    currentConv.messages.forEach(msg => {
      const role = msg.role === 'user' ? '用户' : 'AI助手';
      const time = new Date(msg.timestamp).toLocaleString();
      exportContent += `## ${role} (${time})\n\n${msg.content}\n\n---\n\n`;
    });

    const blob = new Blob([exportContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentConv.title}-聊天记录.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [conversations, currentConversation]);

  const handleExportAllData = useCallback(() => {
    if (exportData()) {
      alert('所有聊天数据已成功导出');
    } else {
      alert('导出聊天数据失败');
    }
  }, [exportData]);

  const handleImportData = useCallback((file) => {
    importData(file)
      .then(() => {
        alert('数据导入成功，页面将重新加载');
        window.location.reload();
      })
      .catch(error => {
        alert(`导入失败: ${error.message}`);
      });
  }, [importData]);

  const renameConversation = useCallback((id, newTitle) => {
    setConversations(prevConversations => 
      prevConversations.map(conv =>
        conv.id === id ? {...conv, title: newTitle} : conv
      )
    );
  }, []);

  const toggleStarred = useCallback((id, isStarred) => {
    setConversations(prevConversations => 
      prevConversations.map(conv =>
        conv.id === id ? {...conv, starred: isStarred} : conv
      )
    );
  }, []);

  const getCurrentConversationTitle = useCallback(() => {
    const conversation = conversations.find(conv => conv.id === currentConversation);
    return conversation ? conversation.title : 'Chat';
  }, [conversations, currentConversation]);

  const openSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const openChatSettings = useCallback(() => {
    setShowChatSettings(true);
  }, []);

  const saveSettings = useCallback((newSettings) => {
    setSettings(newSettings);
    saveSetting('chatSettings', newSettings);
  }, [saveSetting]);

  const saveGlobalSettings = useCallback((newGlobalSettings) => {
    if (newGlobalSettings.theme && newGlobalSettings.theme !== theme) {
      updateTheme(newGlobalSettings.theme);
    }
    setGlobalSettings(newGlobalSettings);
    saveSetting('globalApiSettings', newGlobalSettings);
  }, [saveSetting, theme]);

  const toggleSidebar = useCallback(() => {
    setSidebarVisible(prev => !prev);
  }, []);

  const handleExampleClick = useCallback((exampleText) => {
    const messageObject = {
      id: Date.now().toString(),
      content: exampleText,
      userId: 'default-user',
      conversationId: currentConversation,
      timestamp: new Date().toISOString(),
      model: {
        name: settings.model,
        provider: settings.apiProvider
      }
    };

    sendMessage(messageObject, true, settings);
  }, [currentConversation, sendMessage, settings]);

  const handleSelectPartner = (partner) => {
    if (settings) {
      const updatedSettings = applyPartnerToChat(partner.id, settings);
      saveSettings(updatedSettings);
    }

    setShowPartnerSettings(false);
    setSidebarVisible(false);
  };

  return (
    <div className={`chat-app ${!sidebarVisible ? 'sidebar-hidden' : ''}`}>
      <div
        className="sidebar-backdrop"
        onClick={() => setSidebarVisible(false)}
      ></div>
        <Sidebar
          conversations={conversations}
          currentConversation={currentConversation}
          onSelectConversation={switchConversation}
          onNewConversation={createNewConversation}
          onOpenSettings={openSettings}
          onOpenPartnerSettings={() => setShowPartnerSettings(true)}
          onDeleteConversation={deleteConversation}
          onRenameConversation={renameConversation}
          onToggleStarred={toggleStarred}
          isVisible={sidebarVisible}
          onToggleVisibility={toggleSidebar}
          currentSettings={settings}
          onUpdateSettings={saveSettings}
          onExportAllData={handleExportAllData}
          onImportData={handleImportData}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          initialSettings={{...settings, theme}}
          onSave={saveSettings}
          globalSettings={{...globalSettings, theme}}
          onSaveGlobalSettings={saveGlobalSettings}
        />
      <div className="chat-container">
        <Header
          title={getCurrentConversationTitle()}
          onExportChat={exportChatHistory}
          onDeleteConversation={deleteConversation}
          currentConversationId={currentConversation}
          sidebarVisible={sidebarVisible}
          onToggleSidebar={toggleSidebar}
        />
        <div className="messages-container">
          <MessageList
            messages={messages}
            loading={loading}
            onExampleClick={handleExampleClick}
            onHideSidebar={() => setSidebarVisible(false)}
            onSendMessage={sendMessage}
            onDeleteMessage={deleteMessage}
            streamingMessageId={streamingMessageId}
          />
          <div ref={messageEndRef} />
        </div>
        <ChatInput
          onSendMessage={sendMessage}
          disabled={loading}
          openChatSettings={openChatSettings}
          settings={settings}
          conversationId={currentConversation}
          userId={userId}
        />
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        initialSettings={settings}
        onSave={saveSettings}
        globalSettings={globalSettings}
        onSaveGlobalSettings={saveGlobalSettings}
      />

      {showPartnerSettings && (
        <PartnerSettings
          onClose={() => setShowPartnerSettings(false)}
          onSelect={handleSelectPartner}
        />
      )}

      <ChatSettings
        isOpen={showChatSettings}
        onClose={() => setShowChatSettings(false)}
        initialSettings={settings}
        onSave={saveSettings}
        globalSettings={globalSettings}
      />
    </div>
  );
}

export default ChatApp;