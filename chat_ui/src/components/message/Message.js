import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './Message.css';
import './ThinkingProcess.css';
import './MarkdownStyles.css';
import './LaTeXStyles.css';
import ImageGallery from "./ImageGallery";
import FilePreview from '../input/FilePreview';
import {useMermaidAutoRender} from "../../hooks/useMermaidAutoRender";
import MermaidWithButtons from "./MermaidWithButtons";
import ToolExecutionRenderer from './ToolExecutionRenderer';
import AudioPlayer from "./AudioPlayer";

function Message({ message, isStreaming = false, isNew = false,onSendMessage, onDeleteMessage }) {
  const { id, role, content = '', timestamp, model, chunks = [] } = message;
  const isUser = role === 'user';

  const [isThinking, setIsThinking] = useState(false);
  const [displayedContent, setDisplayedContent] = useState('');
  const [thinkingContent, setThinkingContent] = useState('');
  const [displayContent, setDisplayContent] = useState('');
  const [hasThinking, setHasThinking] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [isComplete, setIsComplete] = useState(!isStreaming);

  const [structuredContent, setStructuredContent] = useState(null);

  const isProcessedRef = useRef(false);
  const isProcessedContentRef = useRef(false);
  const pendingStructureRef = useRef(false);

  const messageEndRef = useRef(null);

  const [showControls, setShowControls] = useState(false);
  const [showCopyTooltip, setShowCopyTooltip] = useState(false);

  const formattedTime = timestamp && !isUser
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const messageRef = useRef(null);

  useEffect(() => {
    if (isNew && messageRef.current) {
      messageRef.current.classList.add('new-message');
      const timer = setTimeout(() => {
        if (messageRef.current) {
          messageRef.current.classList.remove('new-message');
        }
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isNew]);

  const safeString = (content) => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return '';
    if (content === null || content === undefined) return '';
    return String(content);
  };

  const removeMarkdownCodeBlocks = (content) => {
    if (!content || typeof content !== 'string') return content;
    const markdownBlockRegex = /```markdown\s*([\s\S]*?)\s*```/g;
    return content.replace(markdownBlockRegex, (match, codeContent) => {
      return codeContent;
    });
  };

  const preprocessLatex = (content) => {
    if (!content || typeof content !== 'string') return content;
    let processed = content;
    processed = processed.replace(/\$([^$]+)\$/g, (match, formula) => {
      return `$${formula}$`;
    });
    processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
      return `$$${formula}$$`;
    });
    processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
      return `$${formula}$`;
    });
    processed = processed.replace(/\[ *(\\[a-zA-Z]+[^[\]]*) *\]/g, (match, formula) => {
      return `$${formula}$`;
    });
    processed = processed.replace(/\$(\\[a-zA-Z]+.*?)\$/g, (match) => {
      return match;
    });
    processed = processed.replace(/\${3}(.*?)\${1,3}/g, (match, formula) => {
      return `$$${formula}$$`;
    });
    processed = processed.replace(/\$\\lim_\{([^}]*)\}(.*?)\$/g, (match) => {
      return match;
    });
    return processed;
  };

  const [currentTheme, setCurrentTheme] = useState(
    document.documentElement.getAttribute('data-theme') || 'light'
  );

  const handleMouseEnter = (e) => {
    if (e.target.closest('.tool-execution-renderer')) {
      return;
    }
    setShowControls(true);
  };

  const handleMouseLeave = (e) => {
    if (e.target.closest('.tool-execution-renderer')) {
      return;
    }
    setShowControls(false);
  };

  useEffect(() => {
    const updateTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme') ||
                   (document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light');
      setCurrentTheme(theme);
    };

    updateTheme();

    document.addEventListener('themechange', updateTheme);

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });

    return () => {
      document.removeEventListener('themechange', updateTheme);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    isProcessedRef.current = false;
    isProcessedContentRef.current = false;
    pendingStructureRef.current = false;

    const newContent = isUser
      ? content
      : (isStreaming && chunks.length > 0)
        ? chunks.join('')
        : content;

    setDisplayedContent(prev => {
      if (prev !== newContent) {
        return newContent;
      }
      return prev;
    });
  }, [content, chunks, isStreaming, isUser]);

  useEffect(() => {
    if (isStreaming && chunks.length > 0) {
      const latestChunk = chunks[chunks.length - 1];

      if (latestChunk.includes('<think>') && !isThinking) {
        setIsThinking(true);
      }

      if (latestChunk.includes('</think>') && isThinking) {
        setIsThinking(false);
      }
    }
  }, [chunks, isStreaming]);

  const extractImagesAndFilesFromMarkdown = (markdown) => {
    if (!markdown || typeof markdown !== 'string') return { images: [], files: [] };

    const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
    const images = [];
    const files = [];
    let match;

    while ((match = imgRegex.exec(markdown)) !== null) {
      const altText = match[1];
      const url = match[2];

      if (altText.startsWith('文件:')) {
        const fileName = altText.substring(3).trim();
        files.push({
          fileName,
          fileUrl: url,
          fileType: fileName.split('.').pop()
        });
      } else {
        images.push(url);
      }
    }

    return { images, files };
  };

  const extractImagesFromMarkdown = (markdown) => {
    if (!markdown || typeof markdown !== 'string') return [];

    const imgRegex = /!\[.*?\]\((.*?)\)/g;
    const images = [];
    let match;

    while ((match = imgRegex.exec(markdown)) !== null) {
      if (match[1]) {
        images.push(match[1]);
      }
    }

    return images;
  };

  const extractFileUrlFromMarkdown = (markdown) => {
    if (!markdown || typeof markdown !== 'string') return null;

    const fileRegex = /\[文件:\s*(.*?)\]\((.*?)\)/g;
    const matches = [...markdown.matchAll(fileRegex)];

    if (matches.length === 0) return null;

    return matches.map(match => ({
      fileName: match[1].trim(),
      fileUrl: match[2].trim(),
      fileType: match[1].trim().split('.').pop()
    }));
  };

  const processContent = (content) => {
    if (isProcessedContentRef.current) {
      return content;
    }

    if (!content) return '';
    if (Array.isArray(content)) return content;

    const stringContent = typeof content === 'string' ? content : String(content);

    if (/^https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp)$/i.test(stringContent.trim())) {
      return stringContent.trim();
    }
    const urlRegex = /(https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp))/gi;
    let result = stringContent;
    let match;
    const urls = [];
    while ((match = urlRegex.exec(stringContent)) !== null) {
      urls.push(match[0]);
    }

    for (let i = urls.length - 1; i >= 0; i--) {
      const url = urls[i];
      const isInMarkdown = stringContent.includes(`![`) && stringContent.includes(`](${url})`);
      if (!isInMarkdown) {
        const urlIndex = stringContent.indexOf(url);
        const isOnOwnLine = (
          (urlIndex === 0 || stringContent[urlIndex - 1] === '\n') &&
          (urlIndex + url.length === stringContent.length || stringContent[urlIndex + url.length] === '\n')
        );

        if (isOnOwnLine) {
          continue;
        }
        result = result.replace(url, `![图片](${url})`);
      }
    }

    result = preprocessLatex(result);
    return result;
  };

  const extractAudioFromMarkdown = (markdown) => {
    if (!markdown || typeof markdown !== 'string') return [];
    const audioRegex = /\[音频:\s*(.*?)\]\((.*?\.(?:mp3|wav|ogg|m4a|flac))\)/gi;
    const matches = [...markdown.matchAll(audioRegex)];

    if (matches.length === 0) {
      const directAudioRegex = /(https?:\/\/[^\s]+\.(?:mp3|wav|ogg|m4a|flac))/gi;
      const directMatches = [...markdown.matchAll(directAudioRegex)];

      return directMatches.map(match => ({
        fileName: '音频文件',
        audioUrl: match[1]
      }));
    }

    return matches.map(match => ({
      fileName: match[1].trim(),
      audioUrl: match[2].trim()
    }));
  };

  const processStructuredContent = useMemo(() => {
    return (content) => {
      if (!content || typeof content !== 'string') return;
      const { images, files } = extractImagesAndFilesFromMarkdown(content);
      const audioFiles = extractAudioFromMarkdown(content);
      const regularFiles = extractFileUrlFromMarkdown(content);
      const allFiles = [
        ...(files || []),
        ...(regularFiles || [])
      ];
      if ((images.length > 0) || (allFiles.length > 0) || (audioFiles.length > 0)) {
        let textContent = content;
        const imgRegex = /!\[.*?\]\((.*?)\)/g;
        const fileRegex = /\[文件:\s*(.*?)\]\((.*?)\)/g;
        const audioRegex = /\[音频:\s*(.*?)\]\((.*?\.(?:mp3|wav|ogg|m4a|flac))\)/gi;
        const directAudioRegex = /(https?:\/\/[^\s]+\.(?:mp3|wav|ogg|m4a|flac))/gi;

        textContent = textContent.replace(imgRegex, '');
        textContent = textContent.replace(fileRegex, '');
        textContent = textContent.replace(audioRegex, '');
        textContent = textContent.replace(directAudioRegex, '');
        textContent = textContent.trim();

        const structured = [];

        if (textContent) {
          structured.push({
            type: 'text',
            content: textContent
          });
        }

        const pureImages = images.filter(img =>
          !files.some(file => file.fileUrl === img)
        );

        if (pureImages.length > 0) {
          if (pureImages.length === 1) {
            structured.push({
              type: 'image',
              url: pureImages[0]
            });
          } else {
            structured.push({
              type: 'images',
              urls: pureImages
            });
          }
        }

        if (audioFiles.length > 0) {
          audioFiles.forEach(audio => {
            structured.push({
              type: 'audio',
              fileName: audio.fileName,
              audioUrl: audio.audioUrl
            });
          });
        }

        if (allFiles.length > 0) {
          const uniqueFiles = new Map();
          allFiles.forEach(file => {
            uniqueFiles.set(file.fileUrl, file);
          });

          Array.from(uniqueFiles.values()).forEach(file => {
            structured.push({
              type: 'file',
              ...file
            });
          });
        }

        if (structured.length > 0) {
          setStructuredContent(structured);
          isProcessedContentRef.current = true;
        } else {
          setStructuredContent(null);
        }
      } else {
        setStructuredContent(null);
      }
    };
  }, []);

  useEffect(() => {
    if (isUser || isProcessedRef.current || !displayedContent) return;
    isProcessedRef.current = true;

    let text = displayedContent;

    if (Array.isArray(text)) {
      return;
    }

    text = removeMarkdownCodeBlocks(text);

    let thinking = '';
    let finalContent = text;

    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    finalContent = finalContent.replace(thinkRegex, (match, thinkContent) => {
      thinking += thinkContent + '\n\n';
      return '';
    }).trim();

    try {
      const jsonRegex = /\{[\s\S]*?"type"\s*:\s*"think_process"[\s\S]*?\}/g;
      const jsonMatches = finalContent.match(jsonRegex);

      if (jsonMatches) {
        jsonMatches.forEach(match => {
          try {
            const parsed = JSON.parse(match);
            if (parsed.type === 'think_process' && parsed.content) {
              thinking += parsed.content + '\n\n';
              finalContent = finalContent.replace(match, '');
            }
          } catch (e) {
            console.error(e);
          }
        });
      }
    } catch (e) {
      console.error(e);
    }

    finalContent = finalContent.replace(/\n{3,}/g, '\n\n').trim();
    thinking = thinking.trim();

    if (thinking.length > 0) {
      setThinkingContent(thinking);
      setHasThinking(true);
    }

    if (finalContent !== displayedContent) {
      setDisplayContent(finalContent);
      pendingStructureRef.current = true;
    }
  }, [isUser, displayedContent]);

  useEffect(() => {
    if (pendingStructureRef.current && displayContent && !isUser) {
      pendingStructureRef.current = false;

      if (typeof displayContent === 'string') {
        try {
          processStructuredContent(displayContent);
        } catch (e) {
          console.error('处理结构化内容时出错:', e);
        }
      }
    }
  }, [displayContent, processStructuredContent, isUser]);

  useEffect(() => {
    if (!isStreaming) {
      setIsComplete(true);
    }
  }, [isStreaming]);

  useMermaidAutoRender(isComplete, id);

  const toggleThinking = () => {
    setShowThinking(!showThinking);
  };

  const handleSendEditMessage = (messageText, imageUrl) => {
    if (typeof onSendMessage === 'function') {
      const fullMessage = `${messageText}\n![image](${imageUrl})`;

      const messageObject = {
        id: Date.now().toString(),
        content: fullMessage,
        userId: 'default-user',
        conversationId: message.conversationId || 'default-conversation',
        timestamp: new Date().toISOString(),
        model: model || { name: 'default-model', provider: 'default-provider' }
      };

      onSendMessage(messageObject, true);
    } else {
      console.log('无法发送编辑消息，onSendMessage回调未定义');
      alert(`${messageText} - 编辑请求已创建，但无法发送`);
    }
  };

  const renderLatex = (content, isDisplayMode = false) => {
    try {
      const cleanContent = content
        .trim()
        .replace(/\\\\$/, '')
        .replace(/^\\[^a-zA-Z]/, '\\');

      return katex.renderToString(cleanContent, {
        displayMode: isDisplayMode,
        throwOnError: false,
        strict: false,
        output: 'html'
      });
    } catch (error) {
      console.error('LaTeX渲染错误:', error, content);
      return `<span class="latex-error" title="${error.message}">${content}</span>`;
    }
  };

  const components = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const code = String(children).replace(/\n$/, '');

      if (!inline && match) {
        const language = match[1];

        if (language === 'latex' || language === 'math' || language === 'tex' ||
            code.includes('\\begin') || code.includes('\\frac') ||
            code.includes('\\sum') || code.includes('\\lim')) {
          try {
            return (
              <div className="latex-block">
                <span
                  dangerouslySetInnerHTML={{
                    __html: renderLatex(code, true)
                  }}
                />
              </div>
            );
          } catch (error) {
            console.error('LaTeX代码块渲染失败:', error);
            return (
              <div className="latex-error">{code}</div>
            );
          }
        }

        const possibleMermaid =
          language === 'mermaid' ||
          /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey)/i.test(code.trim());

        if (possibleMermaid) {
          return <MermaidWithButtons code={code} language={language} />;
        }

        return (
          <div className="code-block-container">
            <SyntaxHighlighter
              style={atomDark}
              language={language}
              PreTag="div"
              className="syntax-highlighter"
              {...props}
            >
              {code}
            </SyntaxHighlighter>
            <button
              className="code-button copy-button"
              onClick={() => {
                navigator.clipboard.writeText(code)
                  .then(() => {
                    const button = document.activeElement;
                    if (button) {
                      button.innerHTML = '已复制';
                      button.classList.add('success');

                      setTimeout(() => {
                        button.innerHTML = '复制';
                        button.classList.remove('success');
                      }, 2000);
                    }
                  })
                  .catch(err => console.error('复制失败:', err));
              }}
              title="复制代码"
            >
              复制
            </button>
          </div>
        );
      }

    if (inline && (code.includes('\\') || code.match(/\$(.+?)\$/))) {
        try {
          const formula = code.replace(/^\$|\$$/g, '');
          return (
            <span
              className="math-inline"
              dangerouslySetInnerHTML={{
                __html: renderLatex(formula, false)
              }}
            />
          );
        } catch (error) {
          console.error('行内LaTeX代码渲染失败:', error);
          return <code {...props}>{children}</code>;
        }
      }

      return <code className={className} {...props}>{children}</code>;
    },
    img({ node, ...props }) {
      const srcUrl = props.src || null;;
      const altText = props.alt || '';

      if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(srcUrl)) {
        return (
          <AudioPlayer
            src={srcUrl}
            fileName={altText || '音频文件'}
            inline={true}
          />
        );
      }

      if (altText.startsWith('文件:') && !isProcessedContentRef.current) {
        const fileName = altText.substring(3).trim();
        const fileType = fileName.split('.').pop();

        return (
          <FilePreview
            fileUrl={srcUrl}
            fileName={fileName}
            fileType={fileType}
          />
        );
      }

      return (
        <img
          className="markdown-image"
          style={{
            display: 'block',
            maxWidth: '100%',
            height: 'auto',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            margin: '8px 0'
          }}
          loading="lazy"
          onError={(e) => {
            console.error('Image failed to load:', e.target.src);
            e.target.onerror = null; // 防止无限循环
            e.target.style.display = 'none';

            const errorSpan = document.createElement('span');
            errorSpan.className = 'image-error-container';
            errorSpan.innerHTML = `
              <span style="display: block; padding: 10px; border: 1px dashed #ddd; border-radius: 8px; margin: 8px 0; background: #f9f9f9; color: #666; font-size: 14px;">
                <span style="display: block; margin-bottom: 5px;"><span style="color: #e74c3c;">⚠️</span> 图像加载失败</span>
                <span style="display: block; word-break: break-all; margin-bottom: 5px;">${srcUrl}</span>
              </span>
            `;

            if (e.target.parentNode) {
              e.target.parentNode.insertBefore(errorSpan, e.target.nextSibling);
            }
          }}
          {...props}
          src={srcUrl}
          alt={altText}
        />
      );
    },

    a({ node, ...props }) {
      const href = props.href || null;
      const isAudioUrl = /\.(mp3|wav|ogg|m4a|flac)$/i.test(href);
      const isImageUrl = /\.(png|jpg|jpeg|gif|webp)$/i.test(href);

      if (isAudioUrl) {
        return (
          <AudioPlayer
            src={href}
            fileName={props.children || '音频文件'}
            inline={true}
          />
        );
      }

      if (isImageUrl && !isAudioUrl) {
        return (
          <img
            src={href}
            alt={props.children || '图片'}
            style={{
              maxWidth: '100%',
              height: 'auto',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              margin: '8px 0'
            }}
            loading="lazy"
            onError={(e) => {
              console.error('Image link failed to load:', e.target.src);
              e.target.onerror = null;
              e.target.style.display = 'none';

              const parent = e.target.parentNode;
              if (parent) {
                const errorSpan = document.createElement('span');
                errorSpan.className = 'image-error-container';
                errorSpan.innerHTML = `
                  <span style="display: block; padding: 10px; border: 1px dashed #ddd; border-radius: 8px; margin: 8px 0; background: #f9f9f9; color: #666; font-size: 14px;">
                    <span style="display: block; margin-bottom: 5px;"><span style="color: #e74c3c;">⚠️</span> 图像链接加载失败</span>
                    <span style="display: block; word-break: break-all; margin-bottom: 5px;">${href}</span>
                  </span>
                `;
                parent.appendChild(errorSpan);
              }
            }}
          />
        );
      }

      return <a {...props} target="_blank" rel="noopener noreferrer" />;
    },

    table({ node, ...props }) {
      return (
        <div className="table-container">
          <table className="enhanced-table" {...props} />
        </div>
      );
    },

    td({ node, children, ...props }) {
      const isNumeric = React.Children.toArray(children).every(child => {
        if (typeof child === 'string') {
          return /^[\s]*[-+]?[\d.,±$€¥%]+[\s]*$/.test(child);
        }
        return false;
      });

      return (
        <td className={isNumeric ? 'numeric' : ''} {...props}>
          {children}
        </td>
      );
    },

    th({ node, ...props }) {
      return (
        <th {...props} />
      );
    },

    tr({ node, ...props }) {
      return <tr {...props} />;
    },

    p({ node, children, ...props }) {
      if (children && typeof children === 'string') {
        const text = children;

        if ((text.startsWith('$$') && text.endsWith('$$')) ||
            (text.startsWith('$$$') && text.endsWith('$$$'))) {
          const formula = text.replace(/^\${2,3}|\${2,3}$/g, '');
          try {
            return (
              <div className="math-display">
                <span
                  dangerouslySetInnerHTML={{
                    __html: renderLatex(formula, true)
                  }}
                />
              </div>
            );
          } catch (error) {
            console.error('块级公式渲染失败:', error);
            return <div className="latex-error">{text}</div>;
          }
        }

        if (text.includes('$')) {
          const parts = [];
          let lastIndex = 0;
          const regex = /\$(\\?[^$]+?)\$/g;
          let match;

          while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
              parts.push(text.substring(lastIndex, match.index));
            }
            const formula = match[1];
            if (formula.includes('\\') || formula.includes('_') || formula.includes('^')) {
              try {
                parts.push(
                  <span
                    key={match.index}
                    className="math-inline"
                    dangerouslySetInnerHTML={{
                      __html: renderLatex(formula, false)
                    }}
                  />
                );
              } catch (error) {
                console.error('行内公式渲染失败:', formula, error);
                parts.push(`$${formula}$`);
              }
            } else {
              parts.push(`$${formula}$`);
            }

            lastIndex = match.index + match[0].length;
          }

          if (lastIndex < text.length) {
            parts.push(text.substring(lastIndex));
          }

          return <p {...props}>{parts}</p>;
        }
      }

      if (Array.isArray(children) && children.length > 0) {
        return <p {...props}>{children}</p>;
      }
      return <p {...props}>{children}</p>;
    }
  };

  const processedContent = processContent(displayContent || displayedContent);

  const containsEditInstruction = (content) => {
    if (!content || typeof content !== 'string') return false;
    return /图像(扩图|修复)\s*\n.+\n!\[.+?\]\(.+?\)/i.test(content);
  };

  const parseEditInstruction = (content) => {
    if (!content || typeof content !== 'string') return null;

    const instructionMatch = content.match(/图像(扩图|修复)\s*\n\s*(.+?)(?:\n|$)/i);
    if (!instructionMatch) return null;

    const images = extractImagesFromMarkdown(content);
    if (images.length === 0) return null;

    return {
      category: instructionMatch[1],
      option: instructionMatch[2].trim(),
      imageUrl: images[0]
    };
  };

  const handleDeleteMessage = (e) => {
    e.stopPropagation();

    if (typeof onDeleteMessage === 'function') {
      onDeleteMessage(message.id);
    }
  };

  const handleCopyMessage = (e) => {
    e.stopPropagation();
  
    let textToCopy = content;
  
    if (!isUser && typeof processedContent === 'string' && /\[执行工具:|/.test(processedContent)) {
      const finalResponsePattern = /(?:最终回答|最终结果|生成回答)[:：]?\s*([\s\S]+)$/;
      const finalResponseMatch = processedContent.match(finalResponsePattern);
      
      if (finalResponseMatch) {
        textToCopy = finalResponseMatch[1].trim();
        navigator.clipboard.writeText(textToCopy)
          .then(() => {
            setShowCopyTooltip(true);
            setTimeout(() => {
              setShowCopyTooltip(false);
            }, 2000);
          })
          .catch(err => {
            console.error('复制失败:', err);
          });
        return;
      }
    }
  
    if (structuredContent) {
      const textItems = structuredContent.filter(item => item.type === 'text');
      if (textItems.length > 0) {
        textToCopy = textItems.map(item => item.content).join('\n\n');
      }
    }
  
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        setShowCopyTooltip(true);
        setTimeout(() => {
          setShowCopyTooltip(false);
        }, 2000);
      })
      .catch(err => {
        console.error('复制失败:', err);
      });
  };

  const isEditInstructionMessage = isUser && containsEditInstruction(content);
  const editInstruction = isEditInstructionMessage ? parseEditInstruction(content) : null;

  const isPureImageUrl = !isUser && !Array.isArray(displayContent) &&
                      typeof processedContent === 'string' &&
                      /^https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp)$/i.test(processedContent.trim());

  const renderStructuredContent = () => {
    if (!structuredContent) return null;

    return (
      <div className="structured-content">
        {structuredContent.map((item, index) => {
          if (item.type === 'text') {
            return (
              <div key={`text-${index}`} className="structured-text">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, [remarkMath, {singleDollar: true}]]}
                  rehypePlugins={[rehypeKatex]}
                  components={components}
                  skipHtml={false}
                >
                  {safeString(item.content)}
                </ReactMarkdown>
              </div>
            );
          } else if (item.type === 'image') {
            return (
              <div key={`image-${index}`} className="structured-image">
                <ImageGallery
                  content={[item.url]}
                  onSendEditMessage={handleSendEditMessage}
                />
              </div>
            );
          } else if (item.type === 'images') {
            return (
              <div key={`images-${index}`} className="structured-images">
                <ImageGallery
                  content={item.urls}
                  onSendEditMessage={handleSendEditMessage}
                />
              </div>
            );
          } else if (item.type === 'audio') {
            return (
              <div key={`audio-${index}`} className="structured-audio">
                <AudioPlayer
                  src={item.audioUrl}
                  fileName={item.fileName}
                />
              </div>
            );
          } else if (item.type === 'file') {
            return (
              <div key={`file-${index}`} className="structured-file">
                <FilePreview
                  fileUrl={item.fileUrl}
                  fileName={item.fileName}
                  fileType={item.fileType}
                />
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  };

  return (
    <div
      id={message.id}
      ref={messageRef}
      className={`message ${isUser ? 'user-message' : 'assistant-message'} ${isPureImageUrl ? 'with-image' : ''} ${isNew ? 'new-message' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isUser || !hasThinking ? (
        <div className="message-content">
          {showControls && (
            <div className="message-controls">
              {showCopyTooltip && (
                <div className="copy-tooltip show">已复制到剪贴板</div>
              )}
              <button className="control-button copy-button" onClick={handleCopyMessage} title="复制">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
              <button className="control-button delete-button" onClick={handleDeleteMessage} title="删除">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </div>
          )}

          {isUser && isEditInstructionMessage && editInstruction ? (
            <div className="edit-instruction-message">
              <div className="edit-instruction-header">
                <div className="edit-instruction-category">图像{editInstruction.category}</div>
                <div className="edit-instruction-option">{editInstruction.option}</div>
              </div>
              <div className="edit-instruction-image">
                <img src={editInstruction.imageUrl} alt="要编辑的图像" className="edit-target-image" />
              </div>
            </div>
          ) : (
            <>
              {!isUser && structuredContent && renderStructuredContent()}

              {!isUser && Array.isArray(displayContent) && !structuredContent && (
                <ImageGallery content={displayContent} onSendEditMessage={handleSendEditMessage} />
              )}

              {!isUser && isPureImageUrl && !structuredContent && typeof processedContent === 'string' && (
                <div className="direct-image-container">
                  <ImageGallery content={[processedContent.trim()]} onSendEditMessage={handleSendEditMessage} />
                </div>
              )}

               {((isUser && !isEditInstructionMessage) || (!isUser && !Array.isArray(displayContent) && !isPureImageUrl && !structuredContent && !isProcessedContentRef.current)) && (
                  <div className="message-text markdown-content">
                    {(processedContent && typeof processedContent === 'string' &&
                      /\[执行工具:|/.test(processedContent)) ? (
                      <ToolExecutionRenderer
                        content={processedContent}
                        markdownComponents={components}
                        key={`tool-exec-${id}-${currentTheme}-${Date.now()}`}
                      />
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, [remarkMath, {singleDollar: true}]]}
                        rehypePlugins={[rehypeKatex]}
                        components={components}
                        skipHtml={false}
                      >
                        {safeString(processedContent)}
                      </ReactMarkdown>
                    )}
                  </div>
                )}
            </>
          )}

          {!isUser && (
            <div className="message-info">
              {formattedTime && <span className="message-metadata">{formattedTime}</span>}
              {model && (
                <>
                  {formattedTime && <span className="message-separator"> - </span>}
                  <span className="message-metadata">模型: {typeof model === 'object' ? model.name : model}</span>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="message-bubble">
          <div className="thinking-button-container">
            <button
              className="thinking-toggle-button"
              onClick={toggleThinking}
              title="查看思考过程"
            >
              思考过程 {showThinking ? '▼' : '▶'}
            </button>
          </div>

          {showControls && (
            <div className="message-controls">
              {showCopyTooltip && <div className="copy-tooltip show">已复制到剪贴板</div>}
              <button className="control-button copy-button" onClick={handleCopyMessage} title="复制">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
              <button className="control-button delete-button" onClick={handleDeleteMessage} title="删除">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </div>
          )}

          <div className="message-inner-content">
            {showThinking && (
              <div className="thinking-content-popup">
                <div className="thinking-content markdown-content">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, [remarkMath, {singleDollar: true}]]}
                    rehypePlugins={[rehypeKatex]}
                    components={components}
                    skipHtml={false}
                  >
                    {safeString(thinkingContent)}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {structuredContent && renderStructuredContent()}

            {Array.isArray(displayContent) && !structuredContent && (
              <ImageGallery
                content={displayContent}
                onSendEditMessage={handleSendEditMessage}
              />
            )}

            {isPureImageUrl && !structuredContent && typeof processedContent === 'string' && (
              <div className="direct-image-container">
                <ImageGallery
                  content={[processedContent.trim()]}
                  onSendEditMessage={handleSendEditMessage}
                />
              </div>
            )}

            {!Array.isArray(displayContent) && !isPureImageUrl && !structuredContent && !isProcessedContentRef.current && (
              <div className="message-text markdown-content">
                {(processedContent && typeof processedContent === 'string' &&
                  /\[执行工具:|/.test(processedContent)) ? (
                  <ToolExecutionRenderer
                    content={processedContent}
                    markdownComponents={components}
                    key={`tool-exec-${id}-${currentTheme}-${Date.now()}`}
                  />
                ) : (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, [remarkMath, {singleDollar: true}]]}
                    rehypePlugins={[rehypeKatex]}
                    components={components}
                    skipHtml={false}
                  >
                    {safeString(processedContent)}
                  </ReactMarkdown>
                )}
              </div>
            )}

            <div className="message-info">
              {formattedTime && <span className="message-metadata">{formattedTime}</span>}
              {model && (
                <>
                  {formattedTime && <span className="message-separator"> - </span>}
                  <span className="message-metadata">模型: {typeof model === 'object' ? model.name : model}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <div ref={messageEndRef} />
    </div>
  );
}

export default Message;