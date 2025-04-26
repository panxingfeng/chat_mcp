import React, {memo, useCallback, useEffect, useRef, useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import ImageGallery from './ImageGallery';
import './ToolExecutionRenderer.css';

const collapsedStatesCache = {};

const ToolExecutionRenderer = memo(function ToolExecutionRenderer({ content, markdownComponents }) {
  const [currentTheme, setCurrentTheme] = useState(() => {
    const dataTheme = document.documentElement.getAttribute('data-theme');
    if (dataTheme) return dataTheme;

    if (document.documentElement.classList.contains('theme-dark')) {
      return 'dark';
    }
    return 'light';
  });

  const [renderKey, setRenderKey] = useState(0);
  const isMountedRef = useRef(false);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const containerRef = useRef(null);

  const forceRerender = useCallback(() => {
    setRenderKey(prevKey => prevKey + 1);
  }, []);

  const getCollapsedState = useCallback((resultId) => {
    return collapsedStatesCache[resultId] || false;
  }, []);

  const setCollapsedState = useCallback((resultId, isCollapsed) => {
    collapsedStatesCache[resultId] = isCollapsed;
    forceRerender();
  }, [forceRerender]);

  const toggleCollapse = useCallback((resultId, e) => {
    if (isScrollingRef.current) return;
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const currentState = getCollapsedState(resultId);
    setCollapsedState(resultId, !currentState);
  }, [getCollapsedState, setCollapsedState]);

  useEffect(() => {
    const handleScroll = () => {
      isScrollingRef.current = true;
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 300);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const updateTheme = () => {
      const dataTheme = document.documentElement.getAttribute('data-theme');
      if (dataTheme) {
        setCurrentTheme(dataTheme);
        return;
      }

      if (document.documentElement.classList.contains('theme-dark')) {
        setCurrentTheme('dark');
      } else {
        setCurrentTheme('light');
      }
    };

    const handleThemeChange = (e) => {
      setCurrentTheme(e.detail.theme);
    };

    const observer = new MutationObserver(() => {
      updateTheme();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });

    document.addEventListener('themechange', handleThemeChange);

    updateTheme();

    return () => {
      observer.disconnect();
      document.removeEventListener('themechange', handleThemeChange);
    };
  }, []);

  const safeString = (text) => {
    if (typeof text === 'string') return text;
    if (text === null || text === undefined) return '';
    return String(text);
  };

  const formatJsonString = (jsonStr) => {
    try {
      const jsonObj = JSON.parse(jsonStr);
      return JSON.stringify(jsonObj, null, 2);
    } catch (e) {
      return jsonStr;
    }
  };

  const extractTextContent = (content) => {
    if (!content || typeof content !== 'string') return content;

    const textContentRegex = /TextContent\(type='text',\s*text='([\s\S]*?)'(?:,\s*annotations=None)?\)/;
    const match = content.match(textContentRegex);

    if (match && match[1]) {
      return match[1]
          .replace(/\\n/g, '\n')
          .replace(/\\'/g, "'")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
    }

    const metaPattern = /meta=(?:None|null)\s+content=\[([\s\S]*?)\]\s+isError=(False|True)/i;
    const metaMatch = content.match(metaPattern);

    if (metaMatch) {
      const textContentPart = metaMatch[1];
      const innerMatch = textContentRegex.exec(textContentPart);

      if (innerMatch && innerMatch[1]) {
        return innerMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\'/g, "'")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
      }
    }

    return content;
  };

  const syntaxHighlightJson = (json) => {
    if (!json) return '';
    return json
      .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
      .replace(/"([^"]*)"/g, '<span class="json-string">"$1"</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="json-number">$1</span>')
      .replace(/\b(true|false)\b/g, '<span class="json-boolean">$1</span>')
      .replace(/\bnull\b/g, '<span class="json-null">null</span>');
  };

  const parseContent = (text) => {
    if (!text || typeof text !== 'string') return [{ type: 'text', content: '' }];

    const finalResponsePattern = /(?:最终回答|最终结果|生成回答)[:：]?\s*([\s\S]+)$/;
    const finalResponseMatch = text.match(finalResponsePattern);

    if (finalResponseMatch) {
      const contentBeforeResponse = text.substring(0, finalResponseMatch.index);
      const beforeParts = contentBeforeResponse.trim() ? parseContentParts(contentBeforeResponse) : [];

      beforeParts.push({
        type: 'final-response',
        content: finalResponseMatch[1].trim()
      });

      return beforeParts;
    }

    return parseContentParts(text);
  };

  const parseContentParts = (text) => {
    const parts = [];

    const assessmentPattern = /(?:\[结果评估\]|工具结果评估:)\s*(满足全部|满足|不满足|满足部分)(?:用户需求|执行预期|需求)?\s*\(置信度:\s*([\d.]+)\)(?:\s*\(工具执行成败：(True|False)\))?(?:\s*原因:\s*([\s\S]+?))?(?=是否需要执行其他工具:|$)/g;
    const finalDecisionPattern = /(?:已获得满足需求的结果|问题已解决)(?:\(置信度:\s*([\d.]+)\))?[，,]?\s*将生成最终回答/g;
    const toolExecPattern = /执行工具[:：]\s*([^\s,，\n]+)(?:\s|$)/g;

    const toolMatches = Array.from(text.matchAll(toolExecPattern));
    const assessmentMatches = Array.from(text.matchAll(assessmentPattern));
    const finalDecisionMatches = Array.from(text.matchAll(finalDecisionPattern));

    if (toolMatches.length === 0 && assessmentMatches.length === 0 && finalDecisionMatches.length === 0) {
      return [{ type: 'text', content: text }];
    }

    const allMatches = [
      ...toolMatches.map(match => ({ type: 'tool', match, index: match.index })),
      ...assessmentMatches.map(match => ({ type: 'assessment', match, index: match.index })),
      ...finalDecisionMatches.map(match => ({ type: 'decision', match, index: match.index }))
    ].sort((a, b) => a.index - b.index);

    let lastEndIndex = 0;

    for (let i = 0; i < allMatches.length; i++) {
      const current = allMatches[i];
      const next = (i + 1 < allMatches.length) ? allMatches[i + 1] : null;
      const currentIndex = current.index;
      const nextIndex = next ? next.index : text.length;

      if (currentIndex > lastEndIndex) {
        const textContent = text.substring(lastEndIndex, currentIndex).trim();
        if (textContent) {
          parts.push({
            type: 'text',
            content: textContent
          });
        }
      }

      if (current.type === 'assessment') {
        const match = current.match;
        const satisfiesIntent = match[1].includes('满足') && !match[1].includes('部分') && !match[1].includes('不满足');
        const partialSatisfies = match[1] === '满足部分' || match[1] === '部分满足';
        const confidence = parseFloat(match[2]);
        const toolExecutionSuccess = match[3] === 'True';
        const reason = match[4] ? match[4].trim() : '';
        
        parts.push({
          type: 'tool-assessment',
          satisfiesIntent,
          partialSatisfies,
          confidence,
          toolExecutionSuccess,
          reason
        });
      } else if (current.type === 'decision') {
        const match = current.match;
        const confidence = match[1] ? parseFloat(match[1]) : null;

        parts.push({
          type: 'final-decision',
          confidence
        });
      } else if (current.type === 'tool') {
        const match = current.match;
        const toolName = match[1].trim();

        parts.push({
          type: 'tool-execution',
          toolName,
          parameters: null
        });

        const currentSegment = text.substring(currentIndex, nextIndex);
        const metaPattern = /meta=(?:None|null)\s+content=\[([\s\S]*?)\]\s+isError=(False|True)/i;
        const metaMatch = currentSegment.match(metaPattern);

        if (metaMatch) {
          const fullMetaText = metaMatch[0];
          const metaStartIndex = currentSegment.indexOf(fullMetaText);
          const metaEndIndex = metaStartIndex + fullMetaText.length;
          const isError = metaMatch[2].toLowerCase() === 'true';

          let resultContent = extractTextContent(fullMetaText);

          const urlRegex = /(https?:\/\/[^\s]+\.(jpeg|jpg|png|gif|webp|svg))/gi;
          const imageUrls = resultContent ? resultContent.match(urlRegex) : null;

          parts.push({
            type: 'tool-result',
            content: resultContent,
            isJson: resultContent && typeof resultContent === 'string' && (resultContent.trim().startsWith('{') || resultContent.trim().startsWith('[')),
            isError,
            imageUrls: imageUrls || []
          });

          const afterMetaEndIndex = currentIndex + metaEndIndex;
          if (afterMetaEndIndex < nextIndex) {
            const afterMetaText = text.substring(afterMetaEndIndex, nextIndex).trim();

            if (afterMetaText) {
              parts.push({
                type: 'text',
                content: afterMetaText
              });
            }
          }
        } else {
          const afterCommandIndex = currentIndex + match[0].length;
          const resultText = text.substring(afterCommandIndex, nextIndex).trim();

          if (resultText) {
            const dataContentPattern = /data:\s*{"content":\s*"([^"}]*)"}(?:\n|$)/g;
            let dataMatches = Array.from(resultText.matchAll(dataContentPattern));

            if (dataMatches.length > 0) {
              let combinedContent = '';
              for (const dataMatch of dataMatches) {
                try {
                  const content = dataMatch[1]
                    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
                  combinedContent += content;
                } catch (e) {
                  combinedContent += dataMatch[1];
                }
              }

              if (combinedContent) {
                parts.push({
                  type: 'tool-result',
                  content: combinedContent,
                  isJson: false,
                  isError: false
                });
              }
            } else {
              parts.push({
                type: 'tool-result',
                content: resultText,
                isJson: resultText.trim().startsWith('{') || resultText.trim().startsWith('['),
                isError: false
              });
            }
          }
        }
      }

      lastEndIndex = nextIndex;
    }

    if (lastEndIndex < text.length) {
      const finalText = text.substring(lastEndIndex).trim();
      if (finalText) {
        parts.push({
          type: 'text',
          content: finalText
        });
      }
    }

    return parts;
  };

  const contentParts = parseContent(content);

  const renderJsonWithHighlight = (jsonStr) => {
    return (
      <pre className="json-formatted">
        <code
          className="language-json"
          dangerouslySetInnerHTML={{ __html: syntaxHighlightJson(jsonStr) }}
        />
      </pre>
    );
  };

  const darkThemeStyles = {
    "--tool-bg": "#2c3e50",
    "--tool-border": "#61dafb",
    "--tool-text": "#61dafb",
    "--tool-shadow": "rgba(0, 0, 0, 0.2)",
    "--tool-hover-shadow": "rgba(0, 0, 0, 0.25)",
    "--param-bg": "rgba(97, 218, 251, 0.1)",
    "--param-text": "rgba(255, 255, 255, 0.85)",
    "--param-label": "rgba(255, 255, 255, 0.6)",
    "--result-bg": "#1e2a38",
    "--result-border": "#61dafb",
    "--result-text": "rgba(255, 255, 255, 0.85)",
    "--result-shadow": "rgba(0, 0, 0, 0.15)",
    "--result-hover-shadow": "rgba(0, 0, 0, 0.2)",
    "--json-bg": "#172634",
    "--json-text": "rgba(255, 255, 255, 0.9)",
    "--json-key": "#61dafb",
    "--json-string": "#a5d6a7",
    "--json-number": "#ce93d8",
    "--json-boolean": "#ffcc80",
    "--json-null": "#ef9a9a",
    "--error-bg": "rgba(220, 53, 69, 0.1)",
    "--error-border": "#dc3545",
    "--collapse-icon-color": "#61dafb",
    "--collapse-icon-hover": "#7ee2ff",
    "--confidence-bg": "#333e4c",
    "--confidence-text": "#ffffff"
  };

  const lightThemeStyles = {
    "--tool-bg": "#f0f7ff",
    "--tool-border": "#1677ff",
    "--tool-text": "#1677ff",
    "--tool-shadow": "rgba(0, 0, 0, 0.08)",
    "--tool-hover-shadow": "rgba(0, 0, 0, 0.12)",
    "--param-bg": "rgba(22, 119, 255, 0.05)",
    "--param-text": "#333333",
    "--param-label": "#666666",
    "--result-bg": "#f8f9fa",
    "--result-border": "#1677ff",
    "--result-text": "#333333",
    "--result-shadow": "rgba(0, 0, 0, 0.08)",
    "--result-hover-shadow": "rgba(0, 0, 0, 0.12)",
    "--json-bg": "#f6f8fa",
    "--json-text": "#333333",
    "--json-key": "#1677ff",
    "--json-string": "#2e7d32",
    "--json-number": "#7b1fa2",
    "--json-boolean": "#e65100",
    "--json-null": "#d32f2f",
    "--error-bg": "rgba(244, 67, 54, 0.05)",
    "--error-border": "#f44336",
    "--collapse-icon-color": "#1677ff",
    "--collapse-icon-hover": "#4096ff",
    "--confidence-bg": "#eef5ff",
    "--confidence-text": "#1677ff"
  };

  const themeStyles = currentTheme === 'dark' ? darkThemeStyles : lightThemeStyles;

  const CollapsibleIcon = ({ isCollapsed, onClick }) => (
    <div
      className="collapsible-icon"
      onClick={(e) => {
        if (isScrollingRef.current) return;
        e.stopPropagation();
        e.preventDefault();
        onClick(e);
      }}
      onMouseEnter={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onMouseLeave={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      title={isCollapsed ? "展开" : "折叠"}
    >
      {isCollapsed ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );

  const ConfidenceBadge = ({ confidence }) => {
    return (
      <div className="confidence-badge">
        置信度: {confidence.toFixed(2)}
      </div>
    );
  };

  const processContent = (content) => {
    if (!content) return { type: 'text', content: '' };
    
    const extractImageUrls = (text) => {
      if (text && typeof text === 'string' && text.includes('http') && text.includes(',')) {
        const possibleUrls = text.split(',');
        if (possibleUrls.length > 1 && possibleUrls.every(url => url.trim().match(/^https?:\/\//i))) {
          return possibleUrls.map(url => url.trim());
        }
      }

      const urlRegex = /(https?:\/\/[^\s]+\.(jpeg|jpg|png|gif|webp|svg))/gi;
      return text && typeof text === 'string' ? (text.match(urlRegex) || []) : [];
    };
    
    const removeImageUrls = (text, imageUrls) => {
      if (!text || !imageUrls || imageUrls.length === 0) return text;
      
      let cleanText = text;
      imageUrls.forEach(url => {
        cleanText = cleanText.replace(url, '');
      });
      
      return cleanText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n')
        .replace(/,\s*,/g, ',')
        .replace(/^\s*,\s*|\s*,\s*$/g, '');
    };
    
    const imageUrls = typeof content === 'string' ? extractImageUrls(content) : [];
    
    let structuredContent = null;
    if (typeof content === 'string') {
      try {
        const possibleJson = content.trim();
        if ((possibleJson.startsWith('{') && possibleJson.endsWith('}')) || 
            (possibleJson.startsWith('[') && possibleJson.endsWith(']'))) {
          structuredContent = JSON.parse(possibleJson);
        }
      } catch (e) {}
    }
    
    if (structuredContent) {
      if (Array.isArray(structuredContent)) {
        const hasText = structuredContent.some(item => item && item.type === 'text');
        const hasImage = structuredContent.some(item => 
          (item && item.type === 'image') || 
          (item && item.type === 'images' && Array.isArray(item.urls) && item.urls.length > 0)
        );
        
        if (hasText || hasImage) {
          return { type: 'structured', content: structuredContent };
        }
      } else if (structuredContent.type === 'image' && structuredContent.url) {
        return { type: 'single-image', url: structuredContent.url };
      } else if (structuredContent.type === 'images' && Array.isArray(structuredContent.urls) && structuredContent.urls.length > 0) {
        return { type: 'multi-image', urls: structuredContent.urls };
      }
    }
    
    if (imageUrls.length > 0) {
      const isOnlyUrls = content && typeof content === 'string' && 
        imageUrls.join(',').trim() === content.replace(/\s+/g, '').trim();
      
      if (imageUrls.length === 1 && imageUrls[0] === content.trim()) {
        return { type: 'single-image', url: imageUrls[0] };
      }
      
      if (isOnlyUrls && imageUrls.length > 1) {
        return { type: 'multi-image', urls: imageUrls };
      }
      
      const textContent = removeImageUrls(content, imageUrls);
      return { 
        type: 'text-with-images', 
        content: textContent.trim().length > 0 ? textContent : null, 
        imageUrls 
      };
    }
    
    return { type: 'text', content };
  };

  return (
    <div
      ref={containerRef}
      className={`tool-execution-renderer theme-${currentTheme}`}
      data-theme={currentTheme}
      style={themeStyles}
      onMouseEnter={(e) => e.stopPropagation()}
      onMouseLeave={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      key={`tool-execution-${renderKey}`}
    >
      {contentParts.map((part, index) => {
        if (part.type === 'text') {
          return (
            <div key={`text-${index}`} className="llm-response">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, [remarkMath, {singleDollar: true}]]}
                rehypePlugins={[rehypeKatex]}
                components={markdownComponents}
                skipHtml={false}
              >
                {safeString(part.content)}
              </ReactMarkdown>
            </div>
          );
        } else if (part.type === 'tool-execution') {
          return (
            <div
              key={`tool-execution-${index}`}
              className="tool-execution-wrapper"
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={(e) => e.stopPropagation()}
              onMouseLeave={(e) => e.stopPropagation()}
            >
              <div className="tool-execution-block">
                <div className="tool-execution-header">
                  <span className="tool-name">执行工具: {part.toolName}</span>
                </div>
              </div>
            </div>
          );
        } else if (part.type === 'tool-result') {
          const resultId = `tool-result-${index}`;
          const isCollapsed = getCollapsedState(resultId);

          let confidence = null;
          let nextIndex = index + 1;
          if (nextIndex < contentParts.length && contentParts[nextIndex].type === 'tool-assessment') {
            confidence = contentParts[nextIndex].confidence;
          }
        
          const urlRegex = /(https?:\/\/[^\s]+\.(jpeg|jpg|png|gif|webp|svg))/gi;
          const content = safeString(part.content);
          const imageUrls = content ? content.match(urlRegex) : null;

          let textContent = content;
          if (imageUrls && imageUrls.length > 0) {
            textContent = content.split('\n').filter(line => {
              return !imageUrls.some(url => line.includes(url));
            }).join('\n');
          }
        
          return (
            <div
              key={resultId}
              className="tool-result-wrapper"
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={(e) => e.stopPropagation()}
              onMouseLeave={(e) => e.stopPropagation()}
              data-result-id={resultId}
            >
              <div
                className={`tool-result-content ${part.isError ? 'has-error' : ''} ${isCollapsed ? 'is-collapsed' : ''}`}
                onClick={(e) => {
                  if (isScrollingRef.current) return;
        
                  if (isCollapsed && !e.target.closest('.collapsible-icon')) {
                    toggleCollapse(resultId, e);
                  }
                  e.stopPropagation();
                }}
              >
                <div className="tool-result-header">
                  {confidence !== null && (
                    <ConfidenceBadge confidence={confidence} />
                  )}
                  <div className="collapsible-icon-container">
                    <CollapsibleIcon
                      isCollapsed={isCollapsed}
                      onClick={(e) => toggleCollapse(resultId, e)}
                    />
                  </div>
                </div>
        
                <div className="tool-result-inner">
                  {part.isJson ? (
                    renderJsonWithHighlight(formatJsonString(part.content))
                  ) : (
                    <>
                      {textContent && textContent.trim() !== '' && (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, [remarkMath, {singleDollar: true}]]}
                          rehypePlugins={[rehypeKatex]}
                          components={markdownComponents}
                          skipHtml={false}
                        >
                          {textContent}
                        </ReactMarkdown>
                      )}
                      
                      {imageUrls && imageUrls.length > 0 && (
                        <div className="tool-result-images">
                          <ImageGallery 
                            content={imageUrls}
                            isUrlList={true}
                            onSendEditMessage={(messageText, imageUrl) => {
                              if (!messageText || !imageUrl) {
                                console.error('编辑图片参数不完整:', { messageText, imageUrl });
                                return;
                              }
                              
                              const editEvent = new CustomEvent('image-edit-request', {
                                bubbles: true,
                                detail: { 
                                  messageText, 
                                  imageUrl
                                }
                              });
                              document.dispatchEvent(editEvent);
                            }} 
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        } else if (part.type === 'final-response') {
          const contentData = processContent(part.content);
          
          return (
            <div key={`final-response-${index}`} className="final-response-wrapper">
              <div className="final-response-content">
                {contentData.type === 'text' && (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, [remarkMath, {singleDollar: true}]]}
                    rehypePlugins={[rehypeKatex]}
                    components={markdownComponents}
                    skipHtml={false}
                  >
                    {safeString(contentData.content)}
                  </ReactMarkdown>
                )}
                
                {contentData.type === 'single-image' && (
                  <div className="final-response-image">
                    <ImageGallery 
                      content={contentData.url} 
                      isUrlList={false}
                      onSendEditMessage={(messageText, imageUrl) => {
                        if (!messageText || !imageUrl) {
                          console.error('编辑图片参数不完整:', { messageText, imageUrl });
                          return;
                        }
                        
                        const editEvent = new CustomEvent('image-edit-request', {
                          bubbles: true,
                          detail: { 
                            messageText, 
                            imageUrl
                          }
                        });
                        document.dispatchEvent(editEvent);
                      }} 
                    />
                  </div>
                )}
          
                {contentData.type === 'multi-image' && (
                  <div className="final-response-images">
                    <ImageGallery 
                      content={contentData.urls}
                      isUrlList={true}  
                      onSendEditMessage={(messageText, imageUrl) => {
                        if (!messageText || !imageUrl) {
                          console.error('编辑图片参数不完整:', { messageText, imageUrl });
                          return;
                        }
                        
                        const editEvent = new CustomEvent('image-edit-request', {
                          bubbles: true,
                          detail: { 
                            messageText, 
                            imageUrl
                          }
                        });
                        document.dispatchEvent(editEvent);
                      }} 
                    />
                  </div>
                )}
          
                {contentData.type === 'text-with-images' && (
                  <>
                    {contentData.content && (
                      <div className="final-response-text">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, [remarkMath, {singleDollar: true}]]}
                          rehypePlugins={[rehypeKatex]}
                          components={markdownComponents}
                          skipHtml={false}
                        >
                          {safeString(contentData.content)}
                        </ReactMarkdown>
                      </div>
                    )}
                    
                    <div className="final-response-images">
                      <ImageGallery 
                        content={contentData.imageUrls}
                        isUrlList={true} 
                        onSendEditMessage={(messageText, imageUrl) => {
                          if (!messageText || !imageUrl) {
                            console.error('编辑图片参数不完整:', { messageText, imageUrl });
                            return;
                          }
                          
                          const editEvent = new CustomEvent('image-edit-request', {
                            bubbles: true,
                            detail: { 
                              messageText, 
                              imageUrl
                            }
                          });
                          document.dispatchEvent(editEvent);
                        }} 
                      />
                    </div>
                  </>
                )}
          
                {contentData.type === 'structured' && (
                  <div className="final-response-structured">
                    <ImageGallery 
                      content={contentData.content}
                      isUrlList={false} 
                      onSendEditMessage={(messageText, imageUrl) => {
                        if (!messageText || !imageUrl) {
                          console.error('编辑图片参数不完整:', { messageText, imageUrl });
                          return;
                        }
                        
                        const editEvent = new CustomEvent('image-edit-request', {
                          bubbles: true,
                          detail: { 
                            messageText, 
                            imageUrl
                          }
                        });
                        document.dispatchEvent(editEvent);
                      }} 
                    />
                  </div>
                )}
              </div>
            </div>
          );
        // } else if (part.type === 'tool-assessment') {
        //   return (
        //     <div key={`assessment-${index}`} className="tool-assessment-wrapper">
        //       <div className={`tool-assessment-content ${part.satisfiesIntent ? 'satisfies' : (part.partialSatisfies ? 'partial' : 'not-satisfies')}`}>
        //         <div className="assessment-header">
        //           <div className="assessment-result">
        //             {part.satisfiesIntent ? '满足需求' : (part.partialSatisfies ? '满足部分需求' : '不满足需求')}
        //             {part.confidence && <ConfidenceBadge confidence={part.confidence} />}
        //           </div>
        //         </div>
        //         {part.reason && (
        //           <div className="assessment-reason">
        //             <strong>原因:</strong> {part.reason}
        //           </div>
        //         )}
        //       </div>
        //     </div>
        //   );
        }
        return null;
      })}
    </div>
  );
});

export default ToolExecutionRenderer;