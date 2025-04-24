import React, { useState, useRef } from 'react';
import mermaid from 'mermaid';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

mermaid.initialize({
  startOnLoad: false,
  theme: 'neutral',
  themeVariables: {
    primaryColor: '#f4f4f4',
    primaryTextColor: '#333',
    primaryBorderColor: '#ddd',
    lineColor: '#666',
    secondaryColor: '#f0f0f0',
    tertiaryColor: '#fff'
  },
  fontFamily: 'sans-serif',
  flowchart: { curve: 'basis' },
  sequence: { useMaxWidth: true },
  fontSize: 14,
  securityLevel: 'loose',
});

const MermaidWithButtons = ({ code, language }) => {
  const [isRendered, setIsRendered] = useState(false);
  const [renderError, setRenderError] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const containerRef = useRef(null);

  const isMermaidCode = language === 'mermaid' ||
    /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey)/i.test(code.trim());

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
      .then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      })
      .catch(err => {
        console.error('复制失败:', err);
      });
  };

  const handleRender = async () => {
    if (!isMermaidCode) return;

    try {
      setRenderError(null);

      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }

      const renderContainer = document.createElement('div');
      renderContainer.className = 'mermaid-render-container';

      if (containerRef.current) {
        containerRef.current.appendChild(renderContainer);
      }

      const id = `mermaid-${Date.now()}`;
      const { svg } = await mermaid.render(id, code);

      if (renderContainer) {
        renderContainer.innerHTML = svg;
      }

      setIsRendered(true);
    } catch (error) {
      console.error('Mermaid渲染错误:', error);
      setRenderError(error.message || '渲染失败');
    }
  };

  return (
    <div className="mermaid-with-buttons">
      <div className="code-container">
        <SyntaxHighlighter
          style={atomDark}
          language={language || 'text'}
          customStyle={{margin: 0, borderRadius: '0'}}
        >
          {code}
        </SyntaxHighlighter>
      </div>

      <div className="buttons-container">
        <button
          className={`code-button copy-button ${copySuccess ? 'success' : ''}`}
          onClick={handleCopy}
          title="复制代码"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>{copySuccess ? '已复制' : '复制'}</span>
        </button>

        {isMermaidCode && (
          <button
            className={`code-button render-button ${isRendered ? 'active' : ''}`}
            onClick={handleRender}
            title="渲染图表"
            disabled={isRendered && !renderError}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            <span>{isRendered && !renderError ? '已渲染' : '渲染'}</span>
          </button>
        )}
      </div>

      {renderError && (
        <div className="render-error">
          <div className="error-icon">⚠️</div>
          <div className="error-message">
            <div className="error-title">渲染错误</div>
            <div className="error-details">{renderError}</div>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className={`render-result ${isRendered && !renderError ? 'visible' : ''}`}
      ></div>
    </div>
  );
};

export default MermaidWithButtons;