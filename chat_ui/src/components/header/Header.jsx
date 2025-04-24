import React, { useState } from 'react';
import './Header.css';

function Header({ title, onExportChat, onDeleteConversation, currentConversationId, sidebarVisible, onToggleSidebar }) {
  const [showMenu, setShowMenu] = useState(false);

  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };

  return (
    <div className="header">
      {!sidebarVisible && (
        <button
          className="header-action sidebar-toggle"
          onClick={onToggleSidebar}
          title="显示侧边栏"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h18M12 5l7 7-7 7"/>
          </svg>
        </button>
      )}
      <div className="header-content">
        <h1>{title}</h1>
      </div>
      <div className="header-actions">
        <button
          className="header-action more-options"
          onClick={toggleMenu}
          title="更多选项"
        >
          ⋮
        </button>

        {/* 下拉菜单 */}
        {showMenu && (
          <div className="dropdown-menu">
            <div className="dropdown-item" onClick={() => {
              onExportChat();
              setShowMenu(false);
            }}>
              <span className="dropdown-icon">📤</span>
              导出聊天记录
            </div>
            <div className="dropdown-item delete" onClick={() => {
              if (window.confirm('确定要删除这个会话吗？此操作不可撤销。')) {
                onDeleteConversation(currentConversationId);
                setShowMenu(false);
              }
            }}>
              <span className="dropdown-icon">🗑️</span>
              删除会话
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Header;