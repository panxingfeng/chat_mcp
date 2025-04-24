import React, { useState, useEffect, useRef } from 'react';
import './ChatInput.css';
import { getDefaultChatSettings } from "../../config/apiConfig";
import ToolsPanel from './ToolsPanel';
import AIImageGenerator from './AIImageGenerator';
import {FILE_API} from "../../constants";

function ChatInput({ onSendMessage, disabled, openChatSettings, settings, conversationId, userId }) {
  const [message, setMessage] = useState('');
  const [, setWordCount] = useState(0);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrls, setLinkUrls] = useState('');
  const [showAIImageGenerator, setShowAIImageGenerator] = useState(false);
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [imageFiles, setImageFiles] = useState([]);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [chatSettings, setChatSettings] = useState(settings || getDefaultChatSettings());

  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  useEffect(() => {
    if (settings) {
      setChatSettings(settings);
    }
  }, [settings]);

  useEffect(() => {
    const words = message.trim() ? message.trim().split(/\s+/).length : 0;
    setWordCount(words);
  }, [message]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if ((message.trim() || imageFiles.length > 0 || attachedFiles.length > 0) && !disabled) {
      const allImagesProcessed = imageFiles.every(img => !img.processing);
      const allFilesProcessed = attachedFiles.every(file => !file.processing);

      if (!allImagesProcessed || !allFilesProcessed) {
        alert("请等待所有图像和文件处理完成");
        return;
      }

      let messageContent = message;

      if (imageFiles.length > 0) {
        imageFiles.forEach(img => {
          messageContent += `\n![${img.name}](${img.url})`;
        });
      }

      if (attachedFiles.length > 0) {
        attachedFiles.forEach(file => {
          messageContent += `\n![文件:${file.name}](${file.url})`;
        });
      }

      const messageId = Date.now().toString();

      const messageObject = {
        id: messageId,
        content: messageContent.trim(),
        userId: userId,
        conversationId: conversationId,
        timestamp: new Date().toISOString(),
        model: {
          name: chatSettings.model,
          provider: chatSettings.apiProvider
        }
      };

      onSendMessage(messageObject, false, chatSettings);  // 移除isConnected参数

      setMessage('');
      setImageFiles([]);
      setAttachedFiles([]);

      const textarea = document.querySelector('.chat-input');
      if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = '72px';
      }

      if (textarea) {
        textarea.focus();
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    }
  };

  const handleInput = (e) => {
    const textarea = e.target;
    textarea.style.height = '72px';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  };

  const handleImageUpload = () => {
    imageInputRef.current.click();
  };

  const onImageSelected = (e) => {
    const files = Array.from(e.target.files);
    if (files.length) {
      files.forEach(file => {
        const tempId = Date.now() + Math.random().toString(36).substring(2, 9);
        const reader = new FileReader();

        reader.onload = (event) => {
          const tempPreview = event.target.result;

          setImageFiles(prev => [...prev, {
            id: tempId,
            name: file.name,
            tempPreview: tempPreview,
            processing: true,
            type: file.type,
            size: file.size
          }]);

          uploadImageToServer(file, tempId).then();
        };

        reader.readAsDataURL(file);
      });

      e.target.value = '';
    }
  };

  const uploadImageToServer = async (file, imageId) => {
    try {
      const formData = new FormData();
      formData.append('user_id', userId);
      formData.append('file', file);
      formData.append('file_type', getFileTypeFromMimeType(file.type));

      const response = await fetch(`${FILE_API.base}${FILE_API.endpoints.uploadImage}`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.return_code === 0 && result.fileUrl) {
        setImageFiles(prev => prev.map(img =>
          img.id === imageId
            ? {
                ...img,
                processing: false,
                url: result.fileUrl,
              }
            : img
        ));
      } else {
        console.error('图像上传失败:', result.return_msg);
        setImageFiles(prev => prev.filter(img => img.id !== imageId));
        alert(`图像上传失败: ${result.return_msg || '未知错误'}`);
      }
    } catch (error) {
      console.error('图像上传过程中出错:', error);
      setImageFiles(prev => prev.filter(img => img.id !== imageId));
      alert('图像上传过程中出错，请重试');
    }
  };

  const getFileTypeFromMimeType = (mimeType, isFile = false) => {
    if (isFile) {
      const fileMapping = {
        'application/pdf': 'pdf',
        'text/plain': 'txt',
        'text/markdown': 'md',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
        'application/vnd.ms-excel': 'xls',
        'application/json': 'json',
        'text/csv': 'csv',
        'text/html': 'html'
      };
      return fileMapping[mimeType] || 'txt';
    } else {
      const imageMapping = {
        'image/jpeg': 'jpeg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg'
      };
      return imageMapping[mimeType] || 'jpg';
    }
  };

  const handleFileUpload = () => {
    fileInputRef.current.click();
  };

  const onFileSelected = (e) => {
    const files = Array.from(e.target.files);
    if (files.length) {
      files.forEach(file => {
        const tempId = Date.now() + Math.random().toString(36).substring(2, 9);

        setAttachedFiles(prev => [...prev, {
          id: tempId,
          name: file.name,
          type: file.type,
          size: file.size,
          processing: true
        }]);

        uploadFileToServer(file, tempId).then();
      });

      e.target.value = '';
    }
  };

  const uploadFileToServer = async (file, fileId) => {
    try {
      const formData = new FormData();
      formData.append('user_id', userId);
      formData.append('file', file);
      formData.append('file_type', getFileTypeFromMimeType(file.type, true));
      formData.append('max_token_len', 800);
      formData.append('cover_content', 100);
      formData.append('create_vector', true);

      const response = await fetch(`${FILE_API.base}${FILE_API.endpoints.uploadFile}`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.return_code === 0 && result.fileUrl) {
        setAttachedFiles(prev => prev.map(file =>
          file.id === fileId
            ? {
                ...file,
                processing: false,
                url: result.fileUrl,
                vectorID: result.vectorID || ""
              }
            : file
        ));
      } else {
        console.error('文件上传失败:', result.return_msg);
        setAttachedFiles(prev => prev.filter(file => file.id !== fileId));
        alert(`文件上传失败: ${result.return_msg || '未知错误'}`);
      }
    } catch (error) {
      console.error('文件上传过程中出错:', error);
      setAttachedFiles(prev => prev.filter(file => file.id !== fileId));
      alert('文件上传过程中出错，请重试');
    }
  };

  const removeImage = async (e, id) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const imageToDelete = imageFiles.find(img => img.id === id);

    if (imageToDelete && !imageToDelete.processing && imageToDelete.url) {
      try {
        const urlParts = imageToDelete.url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const fileId = fileName.split('.')[0];

        const response = await fetch(`${FILE_API.base}${FILE_API.endpoints.user}/${userId}/file/${fileId}`, {
          method: 'DELETE',
        });

        const result = await response.json();

        if (result.return_code !== 0) {
          console.error('删除图像失败:', result.return_msg);
          alert(`删除图像失败: ${result.return_msg || '未知错误'}`);
        }
      } catch (error) {
        console.error('删除图像过程中出错:', error);
      }
    }

    setImageFiles(prev => prev.filter(img => img.id !== id));
  };

  const removeFile = async (e, id) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const fileToDelete = attachedFiles.find(file => file.id === id);

    if (fileToDelete && !fileToDelete.processing && fileToDelete.url) {
      try {
        const urlParts = fileToDelete.url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const fileId = fileName.split('.')[0];

        const vectorId = fileToDelete.vectorID || null;

        let deleteUrl = `http://localhost:8008/file/user/${userId}/file/${fileId}`;
        if (vectorId) {
          deleteUrl += `?vectorId=${vectorId}`;
        }

        const response = await fetch(deleteUrl, {
          method: 'DELETE',
        });

        const result = await response.json();

        if (result.return_code !== 0) {
          console.error('删除文件失败:', result.return_msg);
          alert(`删除文件失败: ${result.return_msg || '未知错误'}`);
        }
      } catch (error) {
        console.error('删除文件过程中出错:', error);
      }
    }

    setAttachedFiles(prev => prev.filter(file => file.id !== id));
  };

  const handleLinkInput = () => {
    setLinkUrls('');
    setShowLinkModal(true);
  };

  const addLinksToMessage = () => {
    if (linkUrls.trim()) {
      const urls = linkUrls.trim().split('\n').filter(url => url.trim());
      if (urls.length > 0) {
        const linksText = urls.map(url => url.trim()).join('\n');
        setMessage(prev => (prev + (prev ? '\n\n' : '') + linksText));
        setLinkUrls('');
        setShowLinkModal(false);
      }
    }
  };

  // 处理任务执行
  const handleScheduleTask = (task) => {
    // 创建任务消息对象
    const messageObject = {
      id: Date.now().toString(),
      content: `【计划任务】${task.name || '无标题任务'}\n\n${task.content}`, // 添加【计划任务】前缀
      userId: userId,
      conversationId: conversationId,
      timestamp: new Date().toISOString(),
      model: {
        name: chatSettings.model,
        provider: chatSettings.apiProvider
      }
    };

    // 发送消息
    onSendMessage(messageObject, false, chatSettings);
  };

  const handleOpenSettings = () => {
    if (openChatSettings) {
      openChatSettings();
    }
  };

  const handleOpenAIImageGenerator = () => {
    setShowAIImageGenerator(true);
  };

  const handleAIImageRequest = (requestData) => {
    let messageContent = requestData.content;

    if (requestData.type === 'image' && requestData.imageUrl) {
      const imageName = requestData.image?.name || 'AI生成图像.jpg';
      messageContent += `\n![${imageName}](${requestData.imageUrl})`;
    }

    setTimeout(() => {
      const messageObject = {
        id: Date.now().toString(),
        content: messageContent,
        userId: userId,
        conversationId: conversationId,
        timestamp: new Date().toISOString(),
        model: {
          name: chatSettings.model,
          provider: chatSettings.apiProvider
        }
      };

      onSendMessage(messageObject, false, chatSettings);

      setMessage('');
      setImageFiles([]);
      setAttachedFiles([]);
    }, 500);
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const handleOpenToolsPanel = () => {
    setShowToolsPanel(true);
  };

  const handleCloseToolsPanel = () => {
    setShowToolsPanel(false);
  };

  const handleToolRequest = (toolRequest) => {
    const toolRequestStr = `tool: ${toolRequest.tool}\narguments:\n${Object.entries(toolRequest.arguments)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n')}`;

    setMessage(prev => {
      if (prev.trim()) {
        return `${prev}\n\n${toolRequestStr}`;
      }
      return toolRequestStr;
    });
  };

  return (
    <div className="chat-input-container">
      <form onSubmit={handleSubmit}>
        <div className="input-wrapper">
          <div className="toolbar">
            <button
              type="button"
              className="tool-button"
              onClick={handleImageUpload}
              title="上传图像"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={handleFileUpload}
              title="上传文件"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={handleLinkInput}
              title="添加链接"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={handleOpenToolsPanel}
              title="工具箱"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 22l10-10c1.1 0 2-.9 2-2V4l-8 8A2 2 0 0 1 4 14l-2 8z"></path>
                <path d="M12 14l8-8h2v2l-8 8-2 2v-4z"></path>
              </svg>
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={handleOpenAIImageGenerator}
              title="AI图像生成"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </button>
            <button
              type="button"
              className="tool-button"
              onClick={handleOpenSettings}
              title="设置"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
          <div className="input-area">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder="在这里输入你的问题..."
              disabled={false}
              rows={3}
              className="chat-input"
            />
            <button
              type="submit"
              className="send-button"
              disabled={(!message.trim() && imageFiles.length === 0 && attachedFiles.length === 0)}
            >
              <span>➤</span>
            </button>
          </div>

          {(imageFiles.length > 0 || attachedFiles.length > 0) && (
            <div className="preview-area">
              {imageFiles.length > 0 && (
                <div className="image-previews">
                  {imageFiles.map(img => (
                    <div className={`preview-item ${img.processing ? 'processing' : ''}`} key={img.id}>
                      <div className="preview-image-container">
                        {img.processing ? (
                          <div className="image-loading">
                            <div className="spinner"></div>
                            <span>图像处理中...</span>
                          </div>
                        ) : (
                          <img src={img.url || img.tempPreview} alt={img.name} />
                        )}
                        <button
                          className="remove-preview"
                          onClick={(e) => removeImage(e, img.id)}
                          title="移除图片"
                        >
                          ×
                        </button>
                      </div>
                      <div className="preview-info">
                        <span className="preview-name">{img.name.length > 20 ? img.name.substring(0, 17) + '...' : img.name}</span>
                        <span className="preview-size">{formatFileSize(img.size)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {attachedFiles.length > 0 && (
                <div className="file-previews">
                  {attachedFiles.map(file => (
                    <div className={`preview-item file-item ${file.processing ? 'processing' : ''}`} key={file.id}>
                      {file.processing ? (
                        <div className="file-loading">
                          <div className="spinner"></div>
                          <span>文件处理中...</span>
                        </div>
                      ) : (
                        <div className="file-icon">📄</div>
                      )}
                      <div className="preview-info">
                        <span className="preview-name">{file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name}</span>
                        <span className="preview-size">{formatFileSize(file.size)}</span>
                      </div>
                      <button
                        className="remove-preview"
                        onClick={(e) => removeFile(e, file.id)}
                        title="移除文件"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </form>

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={onFileSelected}
        multiple
      />

      <input
        type="file"
        ref={imageInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onImageSelected}
        multiple
      />

      {showLinkModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>添加链接</h3>
            <div className="form-group">
              <textarea
                value={linkUrls}
                onChange={(e) => setLinkUrls(e.target.value)}
                placeholder="https://example.com&#10;https://example.com/page"
                className="multi-url-input"
              />
              <small style={{ color: '#999', marginTop: '4px', display: 'block' }}>
                每行输入一个URL
              </small>
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowLinkModal(false)}>取消</button>
              <button onClick={addLinksToMessage} disabled={!linkUrls.trim()}>提交</button>
            </div>
          </div>
        </div>
      )}

      {showAIImageGenerator && (
        <AIImageGenerator
          onClose={() => setShowAIImageGenerator(false)}
          onSendRequest={handleAIImageRequest}
          userId={userId}
        />
      )}

      {showToolsPanel && (
        <ToolsPanel
          onClose={handleCloseToolsPanel}
          onSelectTool={handleToolRequest}
        />
      )}
    </div>
  );
}

export default ChatInput;