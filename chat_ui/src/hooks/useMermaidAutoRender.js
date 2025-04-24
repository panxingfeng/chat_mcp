import { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

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

export function useMermaidAutoRender(isComplete, messageId) {
  const hasRenderedRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isComplete || hasRenderedRef.current) return;
    hasRenderedRef.current = true;
    timerRef.current = setTimeout(() => {
      try {
        console.log("尝试渲染Mermaid图表，messageId:", messageId);
        const messageElement = document.getElementById(messageId);
        if (!messageElement) {
          console.warn(`找不到ID为${messageId}的消息元素`);
          return;
        }

        const codeBlocks = messageElement.querySelectorAll('pre > code, .syntax-highlighter');
        console.log(`找到${codeBlocks.length}个代码块`);

        codeBlocks.forEach((codeBlock, index) => {
          try {
            const code = codeBlock?.textContent || '';
            const trimmedCode = code.trim();

            console.log(`检查代码块 #${index+1}，长度: ${trimmedCode.length}`);

            // 检测是否为Mermaid代码
            const mermaidPatterns = [
              /^graph\s/i,
              /^flowchart\s/i,
              /^sequenceDiagram/i,
              /^classDiagram/i,
              /^stateDiagram/i,
              /^erDiagram/i,
              /^gantt/i,
              /^pie/i,
              /^journey/i
            ];

            const isMermaid = mermaidPatterns.some(pattern => pattern.test(trimmedCode));
            if (!isMermaid) {
              console.log("不是Mermaid代码");
              return;
            }

            console.log("检测到Mermaid代码:", trimmedCode.substring(0, 50) + "...");

            let preElement = codeBlock;
            while (preElement &&
                  preElement.nodeName.toLowerCase() !== 'pre' &&
                  !preElement.classList.contains('syntax-highlighter')) {
              preElement = preElement.parentElement;
              if (!preElement) break;
            }

            if (!preElement) {
              console.warn("找不到代码块的父元素");
              return;
            }

            const parentElement = preElement.parentElement;
            if (!parentElement) {
              console.warn("找不到代码块父元素的父元素");
              return;
            }

            if (!document.contains(preElement)) {
              console.warn("代码块已不在DOM中，可能已被移除或替换");
              return;
            }

            const mermaidContainer = document.createElement('div');
            mermaidContainer.className = 'mermaid-container';
            const diagramElement = document.createElement('div');
            diagramElement.className = 'mermaid';
            diagramElement.textContent = trimmedCode;
            mermaidContainer.appendChild(diagramElement);
            const sourceDetails = document.createElement('details');
            sourceDetails.className = 'mermaid-source';

            const sourceSummary = document.createElement('summary');
            sourceSummary.textContent = '查看Mermaid源代码';
            sourceDetails.appendChild(sourceSummary);

            const sourceCode = document.createElement('pre');
            sourceCode.className = 'mermaid-code';
            sourceCode.textContent = trimmedCode;
            sourceDetails.appendChild(sourceCode);

            mermaidContainer.appendChild(sourceDetails);

            if (!document.contains(preElement)) {
              console.warn("在替换前，发现代码块已不在DOM中");
              return;
            }
            try {
              console.log("替换代码块为Mermaid图表");
              parentElement.replaceChild(mermaidContainer, preElement);

              console.log("开始渲染Mermaid图表");

              try {
                const renderPromise = mermaid.render(`mermaid-${Math.random().toString(36).substring(2, 9)}`, trimmedCode);
                renderPromise.then(({ svg }) => {
                  if (!document.contains(mermaidContainer)) {
                    console.warn("渲染完成后，容器已不在DOM中");
                    return;
                  }

                  const svgContainer = document.createElement('div');
                  svgContainer.className = 'mermaid-diagram';
                  svgContainer.innerHTML = svg;
                  if (mermaidContainer.firstChild) {
                    mermaidContainer.insertBefore(svgContainer, sourceDetails);
                    console.log("Mermaid图表渲染成功");
                  }
                }).catch(error => {
                  console.error('Mermaid渲染错误:', error);

                  const errorElement = document.createElement('div');
                  errorElement.className = 'mermaid-error';
                  errorElement.innerHTML = `
                    <div>⚠️ 图表渲染失败</div>
                    <div>${error.message || '未知错误'}</div>
                  `;

                  if (document.contains(mermaidContainer)) {
                    mermaidContainer.insertBefore(errorElement, sourceDetails);
                  }
                });
              } catch (error) {
                console.error('启动Mermaid渲染时出错:', error);

                const errorElement = document.createElement('div');
                errorElement.className = 'mermaid-error';
                errorElement.innerHTML = `
                  <div>⚠️ 图表渲染失败</div>
                  <div>${error.message || '未知错误'}</div>
                `;

                if (document.contains(mermaidContainer)) {
                  mermaidContainer.insertBefore(errorElement, sourceDetails);
                }
              }

            } catch (replaceError) {
              console.error("替换DOM节点时出错:", replaceError);
            }

          } catch (blockError) {
            console.error("处理代码块时出错:", blockError);
          }
        });
      } catch (globalError) {
        console.error("Mermaid自动渲染发生全局错误:", globalError);
      }
    }, 200);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isComplete, messageId]);
}