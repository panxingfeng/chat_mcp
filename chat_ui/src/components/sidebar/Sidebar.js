import React, { useState, useEffect } from 'react';
import './Sidebar.css';

function Sidebar({
  conversations,
  currentConversation,
  onSelectConversation,
  onNewConversation,
  onOpenSettings,
  onOpenPartnerSettings,
  onDeleteConversation,
  onRenameConversation,
  onToggleStarred,
  isVisible,
  onToggleVisibility,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [menuVisibleForId, setMenuVisibleForId] = useState(null);

  const getConversationIcon = (title) => {
    if (title.includes('Translator')) return '🌐';
    if (title.includes('Software Developer')) return '💻';
    if (title.includes('Social Media')) return '📱';
    if (title.includes('Travel')) return '🌍';
    if (title.includes('Markdown')) return '📝';
    return '💬';
  };

  const getLastMessageTime = (conversation) => {
    if (!conversation.messages || conversation.messages.length === 0) {
      return null;
    }
    
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (!lastMessage || !lastMessage.timestamp) {
      return null;
    }
    
    try {
      const date = new Date(lastMessage.timestamp);
      
      if (isNaN(date.getTime())) {
        return null;
      }
      
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
      console.error('时间格式化错误:', error);
      return null;
    }
  };

  const handleRenameStart = (conversation, e) => {
    e.stopPropagation();
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
    setMenuVisibleForId(null);
  };

  const handleRenameSubmit = (conversationId, e) => {
    e.preventDefault();
    if (editingTitle.trim()) {
      onRenameConversation(conversationId, editingTitle.trim());
      setEditingId(null);
    }
  };

  const handleDelete = (conversationId, e) => {
    e.stopPropagation();
    if (window.confirm('确定要删除这个会话吗？此操作不可撤销。')) {
      onDeleteConversation(conversationId);
    }
    setMenuVisibleForId(null);
  };

  const handleToggleStar = (conversationId, isStarred, e) => {
    e.stopPropagation();
    onToggleStarred(conversationId, !isStarred);
    setMenuVisibleForId(null);
  };

  const toggleMenu = (conversationId, e) => {
    e.stopPropagation();
    
    document.querySelectorAll('.conversation-item').forEach(item => {
      item.classList.remove('menu-open');
    });
    
    if (menuVisibleForId === conversationId) {
      setMenuVisibleForId(null);
    } else {
      setMenuVisibleForId(conversationId);
      
      setTimeout(() => {
        const currentItem = document.querySelector(`.conversation-item[data-id="${conversationId}"]`);
        if (currentItem) {
          currentItem.classList.add('menu-open');
        }
      }, 0);
    }
  };

  const openPartnerSettings = () => {
    onOpenPartnerSettings();
  };

  const handleConversationClick = (id) => {
    onSelectConversation(id);
    onToggleVisibility();
    setMenuVisibleForId(null);
  };

  const handleOutsideClick = () => {
    if (menuVisibleForId !== null) {
      document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('menu-open');
      });
      setMenuVisibleForId(null);
    }
  };

  const sortedStarredConversations = conversations
    .filter(conv => conv.starred)
    .sort((a, b) => {
      const aTime = a.messages && a.messages.length > 0 ? new Date(a.messages[a.messages.length - 1].timestamp) : new Date(0);
      const bTime = b.messages && b.messages.length > 0 ? new Date(b.messages[b.messages.length - 1].timestamp) : new Date(0);
      return bTime - aTime;
    });

  const sortedUnstarredConversations = conversations
    .filter(conv => !conv.starred)
    .sort((a, b) => {
      if (a.title === '新对话' && (!a.messages || a.messages.length === 0)) return -1;
      if (b.title === '新对话' && (!b.messages || b.messages.length === 0)) return 1;
      
      const aTime = a.messages && a.messages.length > 0 ? new Date(a.messages[a.messages.length - 1].timestamp) : new Date(0);
      const bTime = b.messages && b.messages.length > 0 ? new Date(b.messages[b.messages.length - 1].timestamp) : new Date(0);
      return bTime - aTime;
    });

  useEffect(() => {
    document.addEventListener('click', handleOutsideClick);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  const renderConversationItem = (conversation) => {
    return (
      <div
        key={conversation.id}
        data-id={conversation.id}
        className={`conversation-item ${conversation.id === currentConversation ? 'active' : ''}`}
        onClick={() => handleConversationClick(conversation.id)}
      >
        {editingId === conversation.id ? (
          <form onSubmit={(e) => handleRenameSubmit(conversation.id, e)} className="conversation-edit">
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              autoFocus
              onBlur={() => setEditingId(null)}
              onClick={(e) => e.stopPropagation()}
            />
            <button type="submit" className="save-btn">✓</button>
          </form>
        ) : (
          <>
            <div className="conversation-content">
              <span className="conversation-icon">
                {getConversationIcon(conversation.title)}
              </span>
              <div className="conversation-info">
                <span className="conversation-title">{conversation.title}</span>
                {getLastMessageTime(conversation) && (
                  <span className="conversation-time">
                    {conversation.starred ? '最后消息时间: ' : ''}{getLastMessageTime(conversation)}
                  </span>
                )}
              </div>
            </div>
            <div className="conversation-actions">
              <button
                className="action-btn menu-toggle-btn"
                onClick={(e) => toggleMenu(conversation.id, e)}
                title="操作菜单"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="6" r="1.5"></circle>
                  <circle cx="12" cy="12" r="1.5"></circle>
                  <circle cx="12" cy="18" r="1.5"></circle>
                </svg>
              </button>
              
              {menuVisibleForId === conversation.id && (
                <div className="actions-dropdown" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`action-btn star-btn ${conversation.starred ? 'active' : ''}`}
                    onClick={(e) => handleToggleStar(conversation.id, conversation.starred, e)}
                    title={conversation.starred ? "取消星标" : "设为星标"}
                  >
                    {conversation.starred ? '⭐' : '☆'}
                  </button>
                  <button
                    className="action-btn rename-btn"
                    onClick={(e) => handleRenameStart(conversation, e)}
                    title="重命名"
                  >
                    ✏️
                  </button>
                  <button
                    className="action-btn delete-btn"
                    onClick={(e) => handleDelete(conversation.id, e)}
                    title="删除会话"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className={`sidebar ${!isVisible ? 'hidden' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          ChatMcp
        </div>
        <button
          className="sidebar-toggle-btn"
          onClick={onToggleVisibility}
          title="隐藏侧边栏"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
      </div>

      <div className="conversations-list">
        {sortedStarredConversations.length > 0 && (
          <div className="conversation-group">
            <div className="group-header">⭐ 星标会话</div>
            {sortedStarredConversations.map(renderConversationItem)}
          </div>
        )}

        <div className="conversation-group">
          {sortedStarredConversations.length > 0 && <div className="group-header">所有会话</div>}
          {sortedUnstarredConversations.map(renderConversationItem)}
        </div>
      </div>

      <button
        className="new-chat-button"
        onClick={() => {
          onNewConversation();
          onToggleVisibility();
        }}
      >
        <span>+</span> 新对话
      </button>

      <div className="sidebar-footer">
        <div className="sidebar-actions">
          <div
            className="sidebar-action"
            onClick={openPartnerSettings}
          >
            <span className="action-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </span>
            我的搭档
          </div>
          <div
            className="sidebar-action"
            onClick={onOpenSettings}
          >
            <span className="action-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </span>
            系统设置
          </div>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;