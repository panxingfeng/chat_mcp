import React, {useEffect, useRef, useState} from 'react';
import ReactDOM from 'react-dom';
import './ImageGallery.css';

function ImageGallery({ content, onSendEditMessage }) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [activePanelImage, setActivePanelImage] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const editPanelRef = useRef(null);
  const modalContentRef = useRef(null);
  const galleryRef = useRef(null);

  const processContent = () => {
    if (!content) return { type: 'images', images: [] };

    if (typeof content === 'string') {
      if (content.includes(',')) {
        const splitUrls = content.split(',')
          .map(url => url.trim())
          .filter(url => url.length > 0);
        return { type: 'images', images: splitUrls };
      }
      return { type: 'images', images: [content.trim()] };
    }

    if (Array.isArray(content)) {
      if (content.length === 0) {
        return { type: 'images', images: [] };
      }

      if (typeof content[0] === 'string') {
        if (content.length === 1 && content[0].includes(',')) {
          const splitUrls = content[0].split(',')
            .map(url => url.trim())
            .filter(url => url.length > 0);
          return { type: 'images', images: splitUrls };
        }

        const validImages = content
          .filter(item => typeof item === 'string' && item.trim().length > 0)
          .map(url => url.trim());

        return { type: 'images', images: validImages };
      }

      if (typeof content[0] === 'object') {
        const images = [];

        content.forEach(item => {
          if (item && typeof item === 'object') {
            if (item.type === 'image' && typeof item.url === 'string') {
              images.push(item.url.trim());
            } else if (item.type === 'images' && Array.isArray(item.urls)) {
              const validUrls = item.urls
                .filter(url => typeof url === 'string')
                .map(url => url.trim());
              images.push(...validUrls);
            }
          }
        });

        if (images.length > 0) {
          return { type: 'structured', images, structuredContent: content };
        }
      }
    }

    return { type: 'images', images: [] };
  };

  const contentData = processContent();
  const images = contentData.images || [];

  useEffect(() => {
    if (galleryRef.current) {
      galleryRef.current.classList.remove('four-images', 'six-images');
      if (images && images.length === 4) {
        galleryRef.current.classList.add('four-images');
      } else if (images && images.length === 6) {
        galleryRef.current.classList.add('six-images');
      }
    }
  }, [images]);
  
  const formatErrorUrl = (url) => {
    if (url && typeof url === 'string' && url.includes(',')) {
      return '多图像链接 (逗号分隔的URL)';
    }
    return url;
  };

  const handleImageClick = (imageUrl) => {
    setSelectedImage(imageUrl);
  };

  const handleClosePreview = (e) => {
    if (e && e.target.className === 'image-preview-modal') {
      setSelectedImage(null);
      closeEditPanel();
    }
  };

  const handleCloseButtonClick = (e) => {
    e.stopPropagation();
    setSelectedImage(null);
    closeEditPanel();
  };

  const handleDownload = async (e, imageUrl) => {
    e.stopPropagation();

    try {
      const response = await fetch(imageUrl, {
        mode: 'cors',
        credentials: 'same-origin'
      });

      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = imageUrl.split('/').pop();
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
          document.body.removeChild(link);
        }, 100);
      } else {
        console.error('无法下载图片:', response.status);
        alert('下载失败，请尝试右键保存图片');
      }
    } catch (error) {
      console.error('下载过程出错:', error);
      alert('下载失败，请尝试右键保存图片');
    }
  };

  const handleEditButtonClick = (e, imageUrl) => {
    e.stopPropagation();
    setActivePanelImage(imageUrl);
    setShowEditPanel(true);
    setActiveCategory(null);
  };

  const closeEditPanel = () => {
    if (showEditPanel) {
      setShowEditPanel(false);
      setActivePanelImage(null);
      setActiveCategory(null);
    }
  };

  const handleCategoryClick = (category) => {
    setActiveCategory(category);
  };

  const handleSubOptionClick = (e, category, option, imageUrl) => {
    e.stopPropagation();
    const messageText = `图像${category}:${option}`;

    if (typeof onSendEditMessage === 'function') {
      onSendEditMessage(messageText, imageUrl);
    } else {
      console.log('发送编辑请求:', messageText, imageUrl);
      alert(messageText + " - 功能即将上线");
    }

    setShowEditPanel(false);
    if (selectedImage) {
      setSelectedImage(null);
    }

    closeEditPanel();
  };
  
  useEffect(() => {
    if (!showEditPanel) return;

    const handleClickOutside = (event) => {
      if (editPanelRef.current && !editPanelRef.current.contains(event.target)) {
        closeEditPanel();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEditPanel]);

  useEffect(() => {
    if (!selectedImage && !showEditPanel) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (selectedImage) {
          setSelectedImage(null);
        }
        if (showEditPanel) {
          closeEditPanel();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedImage, showEditPanel]);

  const editOptions = {
    '扩图': ['左右扩展', '上下扩展', '增加尺寸'],
    '修复': ['人像修复', '肢体修复', '手部修复', '脚部修复', '清晰度增强']
  };

  const renderEditPanel = (imageUrl) => {
    if (!showEditPanel || activePanelImage !== imageUrl) return null;

    return (
      <div className="edit-panel" ref={editPanelRef}>
        <div className="edit-panel-header">
          <h3>编辑图片</h3>
          <button className="panel-close-btn" onClick={closeEditPanel}>×</button>
        </div>
        <div className="edit-panel-content">
          <div className="edit-panel-image">
            <img
              src={imageUrl}
              alt="编辑预览"
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="edit-panel-options">
            <div className="edit-categories">
              {Object.keys(editOptions).map(category => (
                <button
                  key={category}
                  className={`category-btn ${activeCategory === category ? 'active' : ''}`}
                  onClick={() => handleCategoryClick(category)}
                >
                  {category}
                </button>
              ))}
            </div>

            {activeCategory && (
              <div className="sub-options">
                {editOptions[activeCategory].map(option => (
                  <button
                    key={option}
                    className="sub-option-btn"
                    onClick={(e) => handleSubOptionClick(e, activeCategory, option, imageUrl)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };
  
  const renderStructuredContent = () => {
    if (contentData.type !== 'structured' || !contentData.structuredContent) {
      return null;
    }

    return (
      <div className="structured-content">
        {contentData.structuredContent.map((item, index) => {
          if (item.type === 'text') {
            return (
              <div key={`text-${index}`} className="structured-text">
                {item.content.split('\n').map((paragraph, pIndex) => (
                  <p key={pIndex}>{paragraph}</p>
                ))}
              </div>
            );
          } else if (item.type === 'image') {
            const imageUrl = item.url;
            return (
              <div
                key={`image-${index}`}
                className="structured-image"
              >
                <div
                  className="gallery-image-wrapper"
                  onClick={() => handleImageClick(imageUrl)}
                >
                  <img
                    src={imageUrl}
                    alt={`图片 ${index+1}`}
                    className="gallery-image"
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      console.error('Image failed to load:', e.target.src);
                      if (e.target.hasAttribute('crossorigin')) {
                        e.target.removeAttribute('crossorigin');
                        e.target.src = imageUrl;
                      } else {
                        e.target.onerror = null;
                        e.target.style.display = 'none';
                        e.target.parentNode.classList.add('image-error');
                        e.target.parentNode.innerHTML = `
                          <div class="image-error-message">
                            <span>⚠️ 图像加载失败</span>
                            <span class="error-url">${formatErrorUrl(imageUrl)}</span>
                          </div>
                        `;
                      }
                    }}
                  />
                </div>
                {item.caption && (
                  <div className="image-caption">{item.caption}</div>
                )}
              </div>
            );
          } else if (item.type === 'images') {
            return (
              <div key={`images-${index}`} className="structured-images">
                <div 
                  className="image-gallery"
                  ref={galleryRef}
                >
                  {item.urls.map((imageUrl, imgIndex) => (
                    <div
                      key={imgIndex}
                      className="gallery-image-wrapper"
                      onClick={() => handleImageClick(imageUrl)}
                    >
                      <img
                        src={imageUrl}
                        alt={`图片 ${imgIndex+1}`}
                        className="gallery-image"
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          console.error('Image failed to load:', e.target.src);
                          if (e.target.hasAttribute('crossorigin')) {
                            e.target.removeAttribute('crossorigin');
                            e.target.src = imageUrl;
                          } else {
                            e.target.onerror = null;
                            e.target.style.display = 'none';
                            e.target.parentNode.classList.add('image-error');
                            e.target.parentNode.innerHTML = `
                              <div class="image-error-message">
                                <span>⚠️ 图像加载失败</span>
                                <span class="error-url">${formatErrorUrl(imageUrl)}</span>
                              </div>
                            `;
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  };
  
  const renderPreviewModal = () => {
    if (!selectedImage) return null;

    return ReactDOM.createPortal(
      <div
        className="image-preview-modal"
        onClick={handleClosePreview}
        onMouseMove={(e) => e.stopPropagation()}
      >
        <div
          className="modal-content"
          onClick={(e) => e.stopPropagation()}
          ref={modalContentRef}
        >
          <button className="close-button" onClick={handleCloseButtonClick}>×</button>
          <img
            src={selectedImage}
            alt="预览"
            className="preview-image"
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
          />
          <div className="preview-actions">
            <button className="preview-action-btn" onClick={(e) => handleDownload(e, selectedImage)}>
              下载图片
            </button>
            <button className="preview-action-btn" onClick={(e) => handleEditButtonClick(e, selectedImage)}>
              编辑图片
            </button>
          </div>
        </div>
        {renderEditPanel(selectedImage)}
      </div>,
      document.body
    );
  };

  if (contentData.type === 'structured') {
    return (
      <div className="structured-content-container">
        {renderStructuredContent()}
        {renderPreviewModal()}
      </div>
    );
  }

  if (!images || images.length === 0) {
    return <div className="empty-gallery">无图片内容</div>;
  }

  if (images.length === 1) {
    const imageUrl = images[0];
    return (
      <div className="single-image-container gallery-image-wrapper">
        <div
          className="image-with-actions"
          onClick={() => handleImageClick(imageUrl)}
        >
          <img
            src={imageUrl}
            alt="图片"
            className="gallery-image"
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onError={(e) => {
              console.error('Image failed to load:', e.target.src);
              if (e.target.hasAttribute('crossorigin')) {
                e.target.removeAttribute('crossorigin');
                e.target.src = imageUrl;
              } else {
                e.target.onerror = null;
                e.target.style.display = 'none';
                e.target.parentNode.classList.add('image-error');
                e.target.parentNode.innerHTML = `
                  <div class="image-error-message">
                    <span>⚠️ 图像加载失败</span>
                    <span class="error-url">${formatErrorUrl(imageUrl)}</span>
                  </div>
                `;
              }
            }}
          />
        </div>
        {renderPreviewModal()}
      </div>
    );
  }

  return (
    <div className="image-gallery-container">
      <div 
        className="image-gallery"
        ref={galleryRef}
      >
        {images.map((imageUrl, index) => (
          <div
            key={index}
            className="gallery-image-wrapper"
            onClick={() => handleImageClick(imageUrl)}
          >
            <img
              src={imageUrl}
              alt={`图片 ${index+1}`}
              className="gallery-image"
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              onError={(e) => {
                console.error('Image failed to load:', e.target.src);
                if (e.target.hasAttribute('crossorigin')) {
                  e.target.removeAttribute('crossorigin');
                  e.target.src = imageUrl;
                } else {
                  e.target.onerror = null;
                  e.target.style.display = 'none';
                  e.target.parentNode.classList.add('image-error');
                  e.target.parentNode.innerHTML = `
                    <div class="image-error-message">
                      <span>⚠️ 图像加载失败</span>
                      <span class="error-url">${formatErrorUrl(imageUrl)}</span>
                    </div>
                  `;
                }
              }}
            />
          </div>
        ))}
      </div>

      {renderPreviewModal()}
    </div>
  );
}

export default ImageGallery;