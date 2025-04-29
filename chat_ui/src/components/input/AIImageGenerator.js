import React, { useState, useEffect } from 'react';
import './AIImageGenerator.css';
import {FILE_API} from "../../constants";

const AIImageGenerator = ({ onClose, onSendRequest, userId }) => {
  const [mainTab, setMainTab] = useState('generate');
  const [subTab, setSubTab] = useState('style');
  const [uploadedImage, setUploadedImage] = useState(null);
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState('1:1');

  const [selectedOptions, setSelectedOptions] = useState({
    camera: null,
    lighting: null,
    scene: null,
    portrait: null
  });

  const [expandDirection, setExpandDirection] = useState(null);
  const [customSize, setCustomSize] = useState('512');
  const [enhanceOption, setEnhanceOption] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const canSend = () => {
    if (isUploading) return false;

    if (mainTab === 'generate') {
      return selectedStyle || Object.values(selectedOptions).some(val => val !== null);
    } else if (mainTab === 'expand') {
      if (expandDirection === 'increase') {
        return uploadedImage && expandDirection && customSize;
      }
      return uploadedImage && expandDirection;
    } else if (mainTab === 'enhance') {
      return uploadedImage && enhanceOption;
    }
    return false;
  };

  const styleOptions = [
    { id: 'realistic', name: '写实风格', imageUrl: 'https://images.unsplash.com/photo-1575936123452-b67c3203c357?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3' },
    { id: 'illustration', name: '插画', imageUrl: 'https://images.unsplash.com/photo-1618005198919-d3d4b5a92ead?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.0.3' },
    { id: 'cartoon', name: '卡通', imageUrl: 'https://images.unsplash.com/photo-1633886038251-66742db492a1?q=80&w=1932&auto=format&fit=crop&ixlib=rb-4.0.3' },
    { id: 'watercolor', name: '水墨', imageUrl: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=2145&auto=format&fit=crop&ixlib=rb-4.0.3' },
    { id: '3d', name: '3D渲染', imageUrl: 'https://images.unsplash.com/photo-1618172193622-ae2d025f4032?q=80&w=2064&auto=format&fit=crop&ixlib=rb-4.0.3' },
    { id: 'anime', name: '动漫', imageUrl: 'https://images.unsplash.com/photo-1580477667995-2b94f01c9516?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3' }
  ];

  const aspectRatioOptions = [
    { id: '1:1', name: '1:1 方形' },
    { id: '4:3', name: '4:3 横向' },
    { id: '3:4', name: '3:4 纵向' },
    { id: '16:9', name: '16:9 宽屏' },
    { id: '9:16', name: '9:16 手机' }
  ];

  const cameraOptions = [
    { id: 'wide', name: '广角镜头', description: '广阔视野，适合风景' },
    { id: 'telephoto', name: '长焦镜头', description: '压缩视角，突出主体' },
    { id: 'macro', name: '微距镜头', description: '细节特写，近距离拍摄' },
    { id: 'fisheye', name: '鱼眼镜头', description: '超广角，球面失真效果' },
    { id: 'aerial', name: '航拍视角', description: '俯视角度，鸟瞰效果' },
    { id: 'firstperson', name: '第一人称', description: '主观视角，身临其境' }
  ];

  const lightingOptions = [
    { id: 'natural', name: '自然光', description: '柔和均匀的日光' },
    { id: 'golden', name: '黄金时刻', description: '日出日落的温暖光线' },
    { id: 'dramatic', name: '戏剧光', description: '强烈的明暗对比' },
    { id: 'studio', name: '棚光', description: '专业摄影棚的均匀照明' },
    { id: 'neon', name: '霓虹光', description: '彩色霓虹灯的炫丽效果' },
    { id: 'backlight', name: '逆光', description: '主体背向光源的轮廓效果' }
  ];

  const sceneOptions = [
    { id: 'nature', name: '自然主义', description: '真实自然风光' },
    { id: 'surreal', name: '超现实主义', description: '梦幻抽象的场景' },
    { id: 'urban', name: '城市景观', description: '现代都市建筑场景' },
    { id: 'fantasy', name: '奇幻', description: '魔法和奇幻元素' },
    { id: 'scifi', name: '科幻', description: '未来科技场景' },
    { id: 'minimalist', name: '极简主义', description: '简洁干净的构图' }
  ];

  const portraitOptions = [
    { id: 'portrait', name: '肖像精细', description: '细致的人物肖像' },
    { id: 'emotional', name: '情绪人像', description: '表现力强的情感表达' },
    { id: 'artistic', name: '艺术肖像', description: '艺术风格的人像表现' },
    { id: 'fashion', name: '时尚人像', description: '时尚杂志风格' }
  ];

  const expandOptions = [
    { id: 'horizontal', name: '左右扩展' },
    { id: 'vertical', name: '上下扩展' },
    { id: 'increase', name: '增加尺寸' }
  ];

  const enhanceOptions = [
    { id: 'face', name: '人像修复' },
    { id: 'body', name: '肢体修复' },
    { id: 'hand', name: '手部修复' },
    { id: 'foot', name: '脚部修复' },
    { id: 'overall', name: '清晰度增强' }
  ];

  useEffect(() => {
    if (mainTab === 'generate') {
      let promptParts = [];

      if (selectedStyle) {
        const style = styleOptions.find(s => s.id === selectedStyle);
        if (style) promptParts.push(style.name);
      }

      if (selectedOptions.camera) {
        const camera = cameraOptions.find(c => c.id === selectedOptions.camera);
        if (camera) promptParts.push(camera.name);
      }

      if (selectedOptions.lighting) {
        const lighting = lightingOptions.find(l => l.id === selectedOptions.lighting);
        if (lighting) promptParts.push(lighting.name);
      }

      if (selectedOptions.scene) {
        const scene = sceneOptions.find(s => s.id === selectedOptions.scene);
        if (scene) promptParts.push(scene.name);
      }

      if (selectedOptions.portrait) {
        const portrait = portraitOptions.find(p => p.id === selectedOptions.portrait);
        if (portrait) promptParts.push(portrait.name);
      }

      setPrompt(promptParts.join('，'));
    }
  }, [selectedStyle, selectedOptions, mainTab]);

  const handleCustomSizeChange = (e) => {
    const value = e.target.value;
    if (/^\d*$/.test(value)) {
      setCustomSize(value);
    }
  };

  const getFileTypeFromMimeType = (mimeType) => {
    const imageMapping = {
      'image/jpeg': 'jpeg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg'
    };
    return imageMapping[mimeType] || 'jpg';
  };

  const uploadImageToServer = async (file) => {
    setIsUploading(true);
    setUploadError(null);

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
        setUploadedImage({
          dataUrl: URL.createObjectURL(file),
          file: file,
          url: result.fileUrl
        });
        setIsUploading(false);
        return true;
      } else {
        console.error('图像上传失败:', result.return_msg);
        setUploadError(result.return_msg || '未知错误');
        setIsUploading(false);
        return false;
      }
    } catch (error) {
      console.error('图像上传过程中出错:', error);
      setUploadError('图像上传过程中出错，请重试');
      setIsUploading(false);
      return false;
    }
  };

  const handleImageUpload = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      setUploadedImage({
        dataUrl: URL.createObjectURL(file),
        file: file,
        uploading: true
      });

      uploadImageToServer(file);
    }
  };

  const handleStyleSelect = (styleId) => {
    setSelectedStyle(styleId === selectedStyle ? null : styleId);
  };

  const handleAspectRatioSelect = (ratioId) => {
    setSelectedAspectRatio(ratioId);
  };

  const handleOptionSelect = (category, optionId) => {
    setSelectedOptions(prev => ({
      ...prev,
      [category]: prev[category] === optionId ? null : optionId
    }));
  };

  const handleExpandDirectionSelect = (directionId) => {
    setExpandDirection(directionId);
    if (directionId !== 'increase') {
      setCustomSize('512');
    }
  };

  const handleEnhanceOptionSelect = (optionId) => {
    setEnhanceOption(optionId);
  };

  const resetUploadedImage = () => {
    setUploadedImage(null);
    setExpandDirection(null);
    setEnhanceOption(null);
    setCustomSize('512');
    setUploadError(null);
  };

  const handleSend = () => {
    let messageContent = '';
    let imageFile = null;
  
    if (mainTab === 'generate') {
      const aspectRatioText = aspectRatioOptions.find(ratio => ratio.id === selectedAspectRatio)?.name || '1:1 方形';
      messageContent = `AI生图：${prompt}，宽高比：${aspectRatioText}`;
  
      onSendRequest({
        content: messageContent,
        type: 'text',
        aspectRatio: selectedAspectRatio
      });
    } else if (mainTab === 'expand' && uploadedImage) {
      if (expandDirection === 'horizontal') {
        messageContent = `AI生图：图像扩展，左右扩展`;
      } else if (expandDirection === 'vertical') {
        messageContent = `AI生图：图像扩展，上下扩展`;
      } else if (expandDirection === 'increase') {
        messageContent = `AI生图：图像扩展，增加尺寸：${customSize}px`;
      }
  
      imageFile = uploadedImage.file;
  
      onSendRequest({
        content: messageContent,
        type: 'image',
        image: imageFile,
        imageUrl: uploadedImage.url
      });
    } else if (mainTab === 'enhance' && uploadedImage && enhanceOption) {
      const option = enhanceOptions.find(o => o.id === enhanceOption);
      messageContent = `AI生图：提升清晰度，${option ? option.name : ''}`;
  
      imageFile = uploadedImage.file;
  
      onSendRequest({
        content: messageContent,
        type: 'image',
        image: imageFile,
        imageUrl: uploadedImage.url
      });
    }
  
    onClose();
  };

  const renderMainTabs = () => {
    return (
      <div className="main-tabs">
        <button
          className={`main-tab ${mainTab === 'generate' ? 'active' : ''}`}
          onClick={() => setMainTab('generate')}
        >
          生成图像
        </button>
        <button
          className={`main-tab ${mainTab === 'expand' ? 'active' : ''}`}
          onClick={() => {
            setMainTab('expand');
            setExpandDirection(null);
          }}
        >
          扩展图像
        </button>
        <button
          className={`main-tab ${mainTab === 'enhance' ? 'active' : ''}`}
          onClick={() => {
            setMainTab('enhance');
            setEnhanceOption(null);
          }}
        >
          提升清晰度
        </button>
      </div>
    );
  };

  const renderSubTabs = () => {
    if (mainTab === 'generate') {
      return (
        <div className="sub-tabs">
          <button
            className={`sub-tab ${subTab === 'style' ? 'active' : ''}`}
            onClick={() => setSubTab('style')}
          >
            <i className="icon-style"></i> 风格
          </button>
          <button
            className={`sub-tab ${subTab === 'camera' ? 'active' : ''}`}
            onClick={() => setSubTab('camera')}
          >
            <i className="icon-camera"></i> 镜头
          </button>
          <button
            className={`sub-tab ${subTab === 'lighting' ? 'active' : ''}`}
            onClick={() => setSubTab('lighting')}
          >
            <i className="icon-lighting"></i> 光线
          </button>
          <button
            className={`sub-tab ${subTab === 'scene' ? 'active' : ''}`}
            onClick={() => setSubTab('scene')}
          >
            <i className="icon-scene"></i> 场景
          </button>
        </div>
      );
    }
    return null;
  };

  const renderContent = () => {
    if (mainTab === 'generate') {
      if (subTab === 'style') {
        return (
          <div className="content-section">
            <h3 className="section-title">选择图像风格</h3>
            <div className="style-grid">
              {styleOptions.map(style => (
                <div
                  key={style.id}
                  className={`style-item ${selectedStyle === style.id ? 'selected' : ''}`}
                  onClick={() => handleStyleSelect(style.id)}
                >
                  <img src={style.imageUrl} alt={style.name} />
                  <div className="style-name">{style.name}</div>
                </div>
              ))}
            </div>
            <h3 className="section-title">选择宽高比</h3>
            <div className="aspect-ratio-options">
              {aspectRatioOptions.map(ratio => (
                <button
                  key={ratio.id}
                  className={`aspect-ratio-button ${selectedAspectRatio === ratio.id ? 'selected' : ''}`}
                  onClick={() => handleAspectRatioSelect(ratio.id)}
                >
                  {ratio.name}
                </button>
              ))}
            </div>
          </div>
        );
      }

      if (subTab === 'camera') {
        return (
          <div className="content-section">
            <h3 className="section-title">相机视角</h3>
            <div className="options-grid">
              {cameraOptions.map(option => (
                <div
                  key={option.id}
                  className={`option-item ${selectedOptions.camera === option.id ? 'selected' : ''}`}
                  onClick={() => handleOptionSelect('camera', option.id)}
                >
                  <div className="option-name">{option.name}</div>
                  <div className="option-description">{option.description}</div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      if (subTab === 'lighting') {
        return (
          <div className="content-section">
            <h3 className="section-title">光线效果</h3>
            <div className="options-grid">
              {lightingOptions.map(option => (
                <div
                  key={option.id}
                  className={`option-item ${selectedOptions.lighting === option.id ? 'selected' : ''}`}
                  onClick={() => handleOptionSelect('lighting', option.id)}
                >
                  <div className="option-name">{option.name}</div>
                  <div className="option-description">{option.description}</div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      if (subTab === 'scene') {
        return (
          <div className="content-section">
            <h3 className="section-title">场景风格</h3>
            <div className="options-grid">
              {sceneOptions.map(option => (
                <div
                  key={option.id}
                  className={`option-item ${selectedOptions.scene === option.id ? 'selected' : ''}`}
                  onClick={() => handleOptionSelect('scene', option.id)}
                >
                  <div className="option-name">{option.name}</div>
                  <div className="option-description">{option.description}</div>
                </div>
              ))}
            </div>

            <h3 className="section-title">人像风格</h3>
            <div className="options-grid">
              {portraitOptions.map(option => (
                <div
                  key={option.id}
                  className={`option-item ${selectedOptions.portrait === option.id ? 'selected' : ''}`}
                  onClick={() => handleOptionSelect('portrait', option.id)}
                >
                  <div className="option-name">{option.name}</div>
                  <div className="option-description">{option.description}</div>
                </div>
              ))}
            </div>
          </div>
        );
      }
    }

    if (mainTab === 'expand') {
      return (
        <div className="content-section">
          {!uploadedImage ? (
            <label className="upload-area">
              <div className="upload-placeholder">
                <div className="upload-icon"></div>
                <div className="upload-text">点击上传图片</div>
                <div className="upload-hint">支持JPG、PNG格式</div>
              </div>
              <input
                type="file"
                className="hidden-input"
                accept="image/*"
                onChange={handleImageUpload}
              />
            </label>
          ) : (
            <div className="image-processing-container">
              <div className="uploaded-image-container">
                {isUploading ? (
                  <div className="image-loading">
                    <div className="spinner"></div>
                    <span>图像上传中...</span>
                  </div>
                ) : (
                  <>
                    <img
                      src={uploadedImage.dataUrl}
                      alt="已上传图片"
                      className="uploaded-image"
                    />
                    <button
                      className="remove-image-button"
                      onClick={resetUploadedImage}
                    >
                      ×
                    </button>
                  </>
                )}

                {uploadError && (
                  <div className="upload-error">
                    上传失败: {uploadError}
                  </div>
                )}
              </div>

              {!isUploading && !uploadError && (
                <>
                  <div className="image-options">
                    {expandOptions.map(option => (
                      <button
                        key={option.id}
                        className={`image-option-button ${expandDirection === option.id ? 'selected' : ''}`}
                        onClick={() => handleExpandDirectionSelect(option.id)}
                      >
                        {option.name}
                      </button>
                    ))}
                  </div>

                  {/* 如果选择了"增加尺寸"，显示尺寸输入框 */}
                  {expandDirection === 'increase' && (
                    <div className="size-input-container">
                      <h3 className="section-title">输入目标尺寸</h3>
                      <div className="size-input-wrapper">
                        <input
                          type="text"
                          className="size-input"
                          value={customSize}
                          onChange={handleCustomSizeChange}
                          placeholder="输入尺寸大小"
                        />
                        <span className="size-unit">px</span>
                      </div>
                      <div className="size-hint">建议尺寸: 512px - 2048px</div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      );
    }

    if (mainTab === 'enhance') {
      return (
        <div className="content-section">
          {!uploadedImage ? (
            <label className="upload-area">
              <div className="upload-placeholder">
                <div className="upload-icon"></div>
                <div className="upload-text">点击上传图片</div>
                <div className="upload-hint">支持JPG、PNG格式</div>
              </div>
              <input
                type="file"
                className="hidden-input"
                accept="image/*"
                onChange={handleImageUpload}
              />
            </label>
          ) : (
            <div className="image-processing-container">
              <div className="uploaded-image-container">
                {isUploading ? (
                  <div className="image-loading">
                    <div className="spinner"></div>
                    <span>图像上传中...</span>
                  </div>
                ) : (
                  <>
                    <img
                      src={uploadedImage.dataUrl}
                      alt="已上传图片"
                      className="uploaded-image"
                    />
                    <button
                      className="remove-image-button"
                      onClick={resetUploadedImage}
                    >
                      ×
                    </button>
                  </>
                )}

                {uploadError && (
                  <div className="upload-error">
                    上传失败: {uploadError}
                  </div>
                )}
              </div>

              {!isUploading && !uploadError && (
                <div className="image-options">
                  {enhanceOptions.map(option => (
                    <button
                      key={option.id}
                      className={`image-option-button ${enhanceOption === option.id ? 'selected' : ''}`}
                      onClick={() => handleEnhanceOptionSelect(option.id)}
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const renderPromptArea = () => {
    return (
      <div className="prompt-area">
        <h3 className="prompt-title">生成提示词</h3>
        <div className="prompt-content">
          {prompt ? prompt : '选择选项后这里会显示生成提示词'}
        </div>
      </div>
    );
  };

  return (
    <div className="ai-image-modal">
      <div className="ai-image-container">
        <div className="ai-image-header">
          <h2 className="ai-image-title">AI 生图</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {renderMainTabs()}
        {renderSubTabs()}
        {renderContent()}

        {mainTab === 'generate' && renderPromptArea()}

        <div className="action-buttons">
          <button className="cancel-button" onClick={onClose}>
            取消
          </button>
          <button
            className={canSend() ? "send-button-active" : "send-button"}
            onClick={handleSend}
            disabled={!canSend()}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIImageGenerator;