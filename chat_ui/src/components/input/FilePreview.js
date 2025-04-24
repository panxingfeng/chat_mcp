import React, { useState, useEffect } from 'react';
import './FilePreview.css';

const FilePreview = ({ fileUrl, fileName, fileType }) => {
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFullContent, setShowFullContent] = useState(false);
  const [fullContent, setFullContent] = useState('');

  const formatFileName = (name) => {
    if (!name) return '未知文件';
    if (name.length <= 25) return name;
    const lastDot = name.lastIndexOf('.');
    const ext = lastDot !== -1 ? name.substring(lastDot) : '';
    const frontLength = 15;
    const endLength = Math.min(10, ext.length + 5);
    return `${name.substring(0, frontLength)}...${name.substring(name.length - endLength)}`;
  };

  useEffect(() => {
    const fetchFilePreview = async () => {
      if (!fileUrl) {
        setError('文件URL不存在');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(fileUrl);

        if (!response.ok) {
          throw new Error(`获取文件失败: ${response.statusText}`);
        }

        const content = await response.text();

        const lines = content.split('\n');
        const previewContent = lines.slice(0, 3).join('\n');

        setPreview(previewContent);
        setFullContent(content);
        setLoading(false);
      } catch (err) {
        console.error('文件获取失败:', err);
        setError(`文件加载失败: ${err.message}`);
        setLoading(false);
      }
    };

    fetchFilePreview();
  }, [fileUrl]);

  const toggleFullContent = () => {
    setShowFullContent(!showFullContent);
  };

  const closeFullContent = (e) => {
    if (e.target === e.currentTarget) {
      setShowFullContent(false);
    }
  };

  const getFileIcon = () => {
    if (!fileType) return '📄';

    const iconMap = {
      'txt': '📝',
      'pdf': '📕',
      'doc': '📘',
      'docx': '📘',
      'xls': '📊',
      'xlsx': '📊',
      'ppt': '📊',
      'pptx': '📊',
      'csv': '📊',
      'json': '📋',
      'xml': '📋',
      'html': '📄',
      'css': '📄',
      'js': '📄',
      'jsx': '📄',
      'py': '📄',
      'java': '📄',
      'md': '📝',
    };

    return iconMap[fileType.toLowerCase()] || '📄';
  };

  if (loading) {
    return (
      <div className="file-preview-container loading">
        <div className="file-preview-header">
          <span className="file-icon">📄</span>
          <span className="file-name">{formatFileName(fileName)}</span>
        </div>
        <div className="file-preview-content">
          <div className="loading-spinner"></div>
          <span>文件加载中...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="file-preview-container error">
        <div className="file-preview-header">
          <span className="file-icon">⚠️</span>
          <span className="file-name">{formatFileName(fileName)}</span>
        </div>
        <div className="file-preview-content">
          <span className="error-message">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="file-preview-container" onClick={toggleFullContent}>
        <div className="file-preview-header">
          <span className="file-icon">{getFileIcon()}</span>
          <span className="file-name">{formatFileName(fileName)}</span>
        </div>
        <div className="file-preview-content">
          <pre className="file-preview-text">{preview}</pre>
        </div>
      </div>

      {showFullContent && (
        <div className="file-modal-overlay" onClick={closeFullContent}>
          <div className="file-modal-container">
            <div className="file-modal-header">
              <span className="file-icon">{getFileIcon()}</span>
              <span className="file-name">{fileName}</span>
              <button className="close-button" onClick={toggleFullContent}>×</button>
            </div>
            <div className="file-modal-content">
              <pre className="file-content-full">{fullContent}</pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FilePreview;