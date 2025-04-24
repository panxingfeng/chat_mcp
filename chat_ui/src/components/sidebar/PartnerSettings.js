import React, { useState, useEffect, useRef } from 'react';
import './PartnerSettings.css';
import { systemPartners, loadUserPartners, addUserPartner, deleteUserPartner, getAllPartners } from '../../config/partnersConfig';

function PartnerSettings({ onClose, onSelect }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [userPartners, setUserPartners] = useState([]);
  const [newPartner, setNewPartner] = useState({
    name: '',
    systemPrompt: '',
    icon: '👤'
  });

  const modalRef = useRef(null);

  useEffect(() => {
    setUserPartners(loadUserPartners());
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        if (showCreateForm && (newPartner.name.trim() || newPartner.systemPrompt.trim())) {
          if (window.confirm('您有未完成的搭档创建，确定要离开吗？')) {
            onClose();
          }
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, showCreateForm, newPartner]);

  const filteredPartners = getAllPartners()
    .filter(partner => partner.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const handleCreatePartner = () => {
    if (newPartner.name.trim() && newPartner.systemPrompt.trim()) {
      const createdPartner = addUserPartner(newPartner);

      if (createdPartner) {
        setUserPartners([...userPartners, createdPartner]);

        setShowCreateForm(false);
        setNewPartner({
          name: '',
          systemPrompt: '',
          icon: '👤'
        });
      }
    }
  };

  const handleDeletePartner = (e, partnerId) => {
    e.stopPropagation();

    if (window.confirm('确定要删除这个搭档吗？此操作不可撤销。')) {
      const success = deleteUserPartner(partnerId);
      if (success) {
        setUserPartners(userPartners.filter(p => p.id !== partnerId));
      }
    }
  };

  const handleSelectPartner = (partner) => {
    onSelect(partner);
    onClose();
  };

  const handleCancelCreate = () => {
    if (newPartner.name.trim() || newPartner.systemPrompt.trim()) {
      if (window.confirm('您有未保存的内容，确定要取消吗？')) {
        setShowCreateForm(false);
        setNewPartner({
          name: '',
          systemPrompt: '',
          icon: '👤'
        });
      }
    } else {
      setShowCreateForm(false);
    }
  };

  return (
    <div className="partner-settings-modal">
      <div className="partner-settings-container" ref={modalRef}>
        {!showCreateForm ? (
          <>
            <div className="partner-settings-header">
              <div className="header-left">
                <button className="back-button" onClick={onClose}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                  </svg>
                </button>
                <h2>选择搭档</h2>
              </div>
              <button className="close-button" onClick={onClose}>×</button>
            </div>

            <div className="search-bar">
              <input
                type="text"
                placeholder="搜索搭档..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button
                className="create-partner-btn"
                onClick={() => setShowCreateForm(true)}
              >
                <span className="plus-icon">+</span> 创建新的搭档
              </button>
            </div>

            {userPartners.length > 0 && !searchTerm && (
              <div className="partner-section">
                <h3 className="section-title">我的搭档</h3>
                <div className="partners-grid">
                  {userPartners.map(partner => (
                    <div key={partner.id} className="partner-card" onClick={() => handleSelectPartner(partner)}>
                      <div className="partner-icon">{partner.icon}</div>
                      <div className="partner-name">{partner.name}</div>
                      <button
                        className="delete-partner-btn"
                        onClick={(e) => handleDeletePartner(e, partner.id)}
                        title="删除搭档"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="partner-section">
              {userPartners.length > 0 && !searchTerm ? <h3 className="section-title">系统内置</h3> : null}
              <div className="partners-grid">
                {(searchTerm ? filteredPartners : systemPartners).map(partner => (
                  <div key={partner.id} className="partner-card" onClick={() => handleSelectPartner(partner)}>
                    <div className="partner-icon">{partner.icon}</div>
                    <div className="partner-name">{partner.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="partner-settings-header">
              <h2>创建新搭档</h2>
              <button className="close-button" onClick={handleCancelCreate}>×</button>
            </div>

            <div className="create-partner-form">
              <div className="form-group">
                <label>搭档名称</label>
                <input
                  type="text"
                  value={newPartner.name}
                  onChange={(e) => setNewPartner({...newPartner, name: e.target.value})}
                  placeholder="搭档名称"
                />
              </div>

              <div className="form-group">
                <label>人物设定 (Prompt)</label>
                <textarea
                  value={newPartner.systemPrompt}
                  onChange={(e) => setNewPartner({...newPartner, systemPrompt: e.target.value})}
                  placeholder="输入对AI助手的角色定义和行为指导..."
                  rows={6}
                />
              </div>

              <div className="form-group">
                <label>选择图标</label>
                <div className="icon-selector">
                  {['👤', '🤖', '📊', '💻', '📝', '🔤', '📱', '✨', '🌍', '🎓', '💼', '🎨'].map(icon => (
                    <button
                      key={icon}
                      className={`icon-option ${newPartner.icon === icon ? 'selected' : ''}`}
                      onClick={() => setNewPartner({...newPartner, icon})}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="cancel-btn"
                  onClick={handleCancelCreate}
                >
                  取消
                </button>
                {newPartner.name.trim() && newPartner.systemPrompt.trim() ? (
                  <button
                    className="save-btn"
                    onClick={handleCreatePartner}
                  >
                    保存
                  </button>
                ) : (
                  <button
                    className="save-btn-disabled"
                    disabled
                  >
                    保存
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PartnerSettings;