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
  const [executingTools, setExecutingTools] = useState({});
  const isMountedRef = useRef(false);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const containerRef = useRef(null);

  const forceRerender = useCallback(() => {
    setRenderKey(prevKey => prevKey + 1);
  }, []);

  const getCollapsedState = useCallback((resultId) => {
    return collapsedStatesCache[resultId] !== undefined ? collapsedStatesCache[resultId] : true;
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

  const filterPromptText = (text) => {
    if (!text || typeof text !== 'string') return text;

    return text.replace(/问题已完全解决，将生成.*?(?=\n|$)/g, '')
               .trim();
  };

  const isExecutionPlan = (text) => {
      if (!text || typeof text !== 'string') return false;
      
      const hasPlanTitle = text.includes("**执行计划:") || text.includes("执行计划:");
      
      const hasStepPattern = /\d+\.\s*(?:\[|【)(□|✓|✗)(?:\]|】)/.test(text);
      
      return hasPlanTitle && hasStepPattern;
  };

  const parseExecutionPlan = (content) => {
    if (!content || typeof content !== 'string') return null;
  
    const planTitleMatch = content.match(/\*\*执行计划:\s*(.*?)\*\*/);
    const planTitle = planTitleMatch ? planTitleMatch[1].trim() : "执行计划";
    
    const createTimeMatch = content.match(/\*\*创建时间:\s*(.*?)\*\*/);
    const createTime = createTimeMatch ? createTimeMatch[1].trim() : "";
    
    const stepRegex = /(\d+)\.\s*\[(□|✓|✗)\]\s*(.*?)\s*\(ID:\s*(.*?)\)\s*工具:\s*(.*?)\s*参数:\s*(\{.*?\})/g;
    const steps = [];
    let match;
    
    while ((match = stepRegex.exec(content)) !== null) {
      steps.push({
        number: match[1],
        status: match[2],
        description: match[3].trim(),
        id: match[4].trim(),
        tool: match[5].trim(),
        params: match[6].trim()
      });
    }
    
    const executionResults = [];
    const executionRegex = /执行步骤\s+(.*?)\s+\((.*?)\)\s+:\s+(成功|失败)\s+结果:\s+(.*?)(?=执行步骤|$)/gs;
  
    const finalOutputMatch = content.match(/最终结果[:：]\s*([\s\S]+?)$/);
    const finalOutput = finalOutputMatch ? finalOutputMatch[1].trim() : "";

    while ((match = executionRegex.exec(content)) !== null) {
      const stepId = match[1].trim();
      const toolName = match[2].trim();
      const status = match[3].trim();
      const resultContent = match[4].trim();
      
      const metaContentMatch = resultContent.match(/meta=(None|null)\s+content=\[([\s\S]*?)\]\s+isError=(False|True)/s);
      let resultText = resultContent;
      let isError = false;
      
      if (metaContentMatch) {
        const textContentMatch = metaContentMatch[2].match(/TextContent\(type='text',\s*text='([\s\S]*?)'/);
        if (textContentMatch) {
          resultText = textContentMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\'/g, "'")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
        }
        isError = metaContentMatch[3] === 'True';
      }
      
      const assessmentMatch = resultContent.match(/评估:\s+满足度:\s+(.*?)\s+\(置信度:\s+(.*?)\)\s+原因:\s+(.*?)(?=执行步骤|$)/s);
      let assessment = null;
      
      if (assessmentMatch) {
        assessment = {
          satisfaction: assessmentMatch[1].trim(),
          confidence: assessmentMatch[2].trim(),
          reason: assessmentMatch[3].trim()
        };
  
        if (assessment.reason && finalOutput && assessment.reason.includes(finalOutput)) {
          const escapedOutput = finalOutput.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`最终结果:\\s*${escapedOutput}`, 'g');
          assessment.reason = assessment.reason.replace(regex, '').trim();
        }
      }
  
      executionResults.push({
        stepId,
        toolName,
        status,
        content: resultText,
        isError,
        assessment
      });
    }
    
    return {
      title: planTitle,
      createTime,
      steps,
      executionResults,
      finalOutput 
    };
  };
  
  const renderExecutionPlan = (planData) => {
    return (
      <div className="execution-plan">
        <div className="execution-plan-header">
          <h3 className="execution-plan-title">{planData.title}</h3>
          {planData.createTime && <div className="execution-plan-time">{planData.createTime}</div>}
        </div>
        
        <div className="execution-plan-steps">
          {planData.steps.map((step, index) => {
            const result = planData.executionResults.find(r => r.stepId === step.id);
            const resultId = `step-${step.id}`;
            const isCollapsed = getCollapsedState(resultId);
            
            let statusIcon;
            let statusClass;
            
            if (result) {
              if (result.status === '成功') {
                statusIcon = (
                  <svg className="ep-icon success-icon" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                );
                statusClass = 'success';
              } else {
                statusIcon = (
                  <svg className="ep-icon error-icon" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                  </svg>
                );
                statusClass = 'error';
              }
            } else {
              statusIcon = (
                <svg className="ep-icon pending-icon" viewBox="0 0 24 24">
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z" />
                </svg>
              );
              statusClass = 'pending';
            }
            
            return (
              <div key={resultId} className={`execution-step ${statusClass}`}>
                <div 
                  className="execution-step-header"
                  onClick={(e) => toggleCollapse(resultId, e)}
                >
                  <div className="execution-step-status">{statusIcon}</div>
                  <div className="execution-step-info">
                    <div className="execution-step-title">{step.number}. {step.description}</div>
                    <div className="execution-step-tool">工具: {step.tool}</div>
                  </div>
                  <div className="execution-step-toggle">
                    <svg className={`toggle-icon ${isCollapsed ? '' : 'expanded'}`} viewBox="0 0 24 24">
                      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                    </svg>
                  </div>
                </div>
                
                {!isCollapsed && (
                  <div className="execution-step-details">
                    <div className="execution-params">
                      <div className="execution-section-title">参数:</div>
                      <pre className="execution-code">
                        <code 
                          className="language-json"
                          dangerouslySetInnerHTML={{ 
                            __html: syntaxHighlightJson(formatJsonString(step.params)) 
                          }}
                        />
                      </pre>
                    </div>
                    
                    {result && (
                      <div className="execution-result">
                        <div className="execution-section-title">
                          结果: <span className={`status-text ${statusClass}-text`}>{result.status}</span>
                        </div>
                        
                        <div className="execution-result-content">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, [remarkMath, {singleDollar: true}]]}
                            rehypePlugins={[rehypeKatex]}
                            components={markdownComponents}
                            skipHtml={false}
                          >
                            {safeString(result.content)}
                          </ReactMarkdown>
                        </div>
                        
                        {result.assessment && (
                          <div className="execution-assessment">
                            <div className="execution-section-title">评估结果</div>
                            <div className="assessment-item">
                              <span className="assessment-label">满足度:</span>
                              <span className={`assessment-value ${result.assessment.satisfaction.includes('满足') ? 'success-text' : 'error-text'}`}>
                                {result.assessment.satisfaction}
                              </span>
                            </div>
                            <div className="assessment-item">
                              <span className="assessment-label">置信度:</span>
                              <span className="assessment-value confidence-text">{result.assessment.confidence}</span>
                            </div>
                            <div className="assessment-item reason-item">
                              <span className="assessment-label">原因:</span>
                              <span className="assessment-value">{result.assessment.reason}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {planData.finalOutput && (
          <div className="execution-plan-final-output">
            <div className="execution-final-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, [remarkMath, {singleDollar: true}]]}
                rehypePlugins={[rehypeKatex]}
                components={markdownComponents}
                skipHtml={false}
              >
                {safeString(planData.finalOutput)}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    );
  };

  const parseContent = (text) => {
    if (!text || typeof text !== 'string') return [{ type: 'text', content: '' }];

    text = filterPromptText(text);

    if (isExecutionPlan(text)) {
      return [{ type: 'execution-plan', content: text }];
    }

    const finalResponsePattern = /(?:最终回答|最终结果|生成回答|最终总结)[:：]?\s*([\s\S]+)$/;
    const finalResponseMatch = text.match(finalResponsePattern);

    if (finalResponseMatch) {
      const contentBeforeResponse = text.substring(0, finalResponseMatch.index);
      const beforeParts = contentBeforeResponse.trim() ? parseContentParts(contentBeforeResponse) : [];

      beforeParts.push({
        type: 'final-response',
        content: filterPromptText(finalResponseMatch[1].trim())
      });

      return beforeParts;
    }

    return parseContentParts(text);
  };

  const parseContentParts = (text) => {
    const parts = [];

    text = filterPromptText(text);

    const toolExecPattern = /执行工具[:：]\s*([^\s,，\n]+)(?:\s|$)/g;
    
    const toolMatches = Array.from(text.matchAll(toolExecPattern));

    if (toolMatches.length === 0) {
      return [{ type: 'text', content: text }];
    }

    const allMatches = [
      ...toolMatches.map(match => ({ type: 'tool', match, index: match.index }))
    ].sort((a, b) => a.index - b.index);

    let lastEndIndex = 0;
    let currentToolName = null;

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
            content: filterPromptText(textContent)
          });
        }
      }

      if (current.type === 'tool') {
        const match = current.match;
        const toolName = match[1].trim();
        currentToolName = toolName;

        const currentSegment = text.substring(currentIndex, nextIndex);
        const metaPattern = /meta=(?:None|null)\s+content=\[([\s\S]*?)\]\s+isError=(False|True)/i;
        const metaMatch = currentSegment.match(metaPattern);

        if (metaMatch) {
          const fullMetaText = metaMatch[0];
          const metaStartIndex = currentSegment.indexOf(fullMetaText);
          const metaEndIndex = metaStartIndex + fullMetaText.length;
          const isError = metaMatch[2].toLowerCase() === 'true';

          let resultContent = extractTextContent(fullMetaText);
          resultContent = filterPromptText(resultContent);

          const urlRegex = /(https?:\/\/[^\s]+\.(jpeg|jpg|png|gif|webp|svg))/gi;
          const imageUrls = resultContent ? resultContent.match(urlRegex) : null;

          parts.push({
            type: 'tool-result',
            content: resultContent,
            isJson: resultContent && typeof resultContent === 'string' && (resultContent.trim().startsWith('{') || resultContent.trim().startsWith('[')),
            isError,
            imageUrls: imageUrls || [],
            toolName
          });

          const afterMetaEndIndex = currentIndex + metaEndIndex;
          if (afterMetaEndIndex < nextIndex) {
            const afterMetaText = text.substring(afterMetaEndIndex, nextIndex).trim();

            const cleanText = afterMetaText.replace(/工具结果评估.*?(是否需要执行其他工具:.*?)(?=\n|$)/gs, '');
            if (cleanText.trim()) {
              parts.push({
                type: 'text',
                content: filterPromptText(cleanText)
              });
            }
          }
        } else {
          const afterCommandIndex = currentIndex + match[0].length;
          const resultText = text.substring(afterCommandIndex, nextIndex).trim();

          if (resultText) {
            const cleanText = resultText.replace(/工具结果评估.*?(是否需要执行其他工具:.*?)(?=\n|$)/gs, '');
            
            if (cleanText.trim()) {
              const dataContentPattern = /data:\s*{"content":\s*"([^"}]*)"}(?:\n|$)/g;
              let dataMatches = Array.from(cleanText.matchAll(dataContentPattern));

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
                    content: filterPromptText(combinedContent),
                    isJson: false,
                    isError: false,
                    toolName
                  });
                }
              } else {
                parts.push({
                  type: 'tool-result',
                  content: filterPromptText(cleanText),
                  isJson: cleanText.trim().startsWith('{') || cleanText.trim().startsWith('['),
                  isError: false,
                  toolName
                });
              }
            }
          }
        }
      }

      lastEndIndex = nextIndex;
    }

    if (lastEndIndex < text.length) {
      const finalText = text.substring(lastEndIndex).trim();
      const cleanText = finalText.replace(/工具结果评估.*?(是否需要执行其他工具:.*?)(?=\n|$)/gs, '');
      if (cleanText.trim()) {
        parts.push({
          type: 'text',
          content: filterPromptText(cleanText)
        });
      }
    }

    return parts;
  };

  const processContent = (content) => {
    if (!content) return { type: 'text', content: '' };
    
    content = filterPromptText(content);
    
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

  const ToolExecutingAnimation = ({ toolName }) => (
    <div className="tool-executing-animation">
      <span>{toolName} 工具执行中</span>
      <div className="loading-dots">
        <div className="dot"></div>
        <div className="dot"></div>
        <div className="dot"></div>
      </div>
    </div>
  );

  const contentParts = parseContent(content);
  
  const executingToolsMap = {};
  contentParts.forEach(part => {
    if (part.type === 'tool-result' && part.toolName) {
      executingToolsMap[part.toolName] = false;
    }
  });
  
  Object.keys(executingTools).forEach(toolName => {
    if (executingTools[toolName] && !(toolName in executingToolsMap)) {
      executingToolsMap[toolName] = true;
    }
  });

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
    "--confidence-text": "#ffffff",
    "--execution-plan-bg": "#1e2a38",
    "--execution-plan-border": "#39465a",
    "--execution-step-bg": "#2c3e50",
    "--execution-step-border": "#39465a",
    "--execution-step-success-bg": "rgba(76, 175, 80, 0.15)",
    "--execution-step-error-bg": "rgba(244, 67, 54, 0.15)",
    "--execution-step-pending-bg": "rgba(255, 152, 0, 0.15)",
    "--execution-assessment-bg": "rgba(97, 218, 251, 0.1)"
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
    "--confidence-text": "#1677ff",
    "--execution-plan-bg": "#ffffff",
    "--execution-plan-border": "#e0e0e0",
    "--execution-step-bg": "#ffffff",
    "--execution-step-border": "#e0e0e0",
    "--execution-step-success-bg": "#e8f5e9",
    "--execution-step-error-bg": "#ffebee",
    "--execution-step-pending-bg": "#fff3e0",
    "--execution-assessment-bg": "#eef5ff"};

    const themeStyles = currentTheme === 'dark' ? darkThemeStyles : lightThemeStyles;
  
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
          if (part.type === 'execution-plan') {
            const planData = parseExecutionPlan(part.content);
            if (!planData) {
              return (
                <div key={`invalid-plan-${index}`} className="execution-plan-error">
                  无法解析执行计划内容
                </div>
              );
            }
            return renderExecutionPlan(planData);
          }
          else if (part.type === 'text') {
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
          } else if (part.type === 'tool-result') {
            const resultId = `tool-result-${index}`;
            const isCollapsed = getCollapsedState(resultId);
            const toolName = part.toolName;
          
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
                    <div className="tool-result-info">
                      {toolName && <span className="tool-result-name">{toolName}</span>}
                    </div>
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
          }
          
          return null;
        })}
        
        {Object.entries(executingToolsMap).map(([toolName, isExecuting]) => 
          isExecuting ? (
            <ToolExecutingAnimation key={`executing-${toolName}`} toolName={toolName} />
          ) : null
        )}
      </div>
    );
  });
  
  export default ToolExecutionRenderer;