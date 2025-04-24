import React from 'react';
import './MarkdownRenderer.css';

/**
 * 检测内容是否为Markdown格式
 * @param {string} content 要检测的内容
 * @returns {boolean} 是否为Markdown格式
 */
export function isMarkdownContent(content) {
  // 提取文本内容
  const text = typeof content === 'string' ? content : '';

  // 处理一些可能的内容前缀，比如API响应中的meta=None content=TextContent(...)
  const cleanedText = text.replace(/^meta=.*?content=TextContent\(.*?text='([\s\S]*?)'.*?\).*$/s, '$1');

  // Markdown特征检测
  const markdownFeatures = [
    // 标题
    /^#{1,6}\s.+$/m,
    // 列表
    /^[\s]*[-*+]\s.+$/m,
    // 有序列表
    /^[\s]*\d+\.\s.+$/m,
    // 引用
    /^>\s.+$/m,
    // 代码块
    /```[\s\S]*?```/,
    // 表格
    /\|.+\|.+\|/,
    // 水平线
    /^[-*_]{3,}$/m,
    // 链接
    /\[.+?\](?:\(.+?\)|\[\d+\])/,
    // 强调
    /\*\*.+?\*\*/,
    // 分隔符 ---
    /^---$/m,
    // 目录标记 [TOC] 或 [[TOC]]
    /\[\[?TOC\]?\]/i,
    // 章节标记 ## 引言 等格式
    /^## [A-Za-z0-9\u4e00-\u9fa5]+$/m
  ];

  // 检查是否包含目录结构
  const hasTOC = cleanedText.includes('## 目录') || cleanedText.includes('# 目录');

  // 检查是否包含章节标题格式
  const hasChapterTitles = /^## [A-Za-z0-9\u4e00-\u9fa5]+/m.test(cleanedText);

  // 检查是否包含学术论文常见部分
  const hasAcademicSections =
    (cleanedText.includes('## 摘要') || cleanedText.includes('# 摘要')) &&
    (cleanedText.includes('## 结论') || cleanedText.includes('# 结论') ||
     cleanedText.includes('## 参考文献') || cleanedText.includes('# 参考文献'));

  // 如果有明显的结构特征，直接判定为Markdown
  if (hasTOC || hasChapterTitles || hasAcademicSections) {
    return true;
  }

  // 检查其他Markdown特征
  const featureCount = markdownFeatures.filter(regex => regex.test(cleanedText)).length;

  // 如果检测到至少3个Markdown特征，则判定为Markdown内容
  return featureCount >= 3;
}

/**
 * 清理API响应格式的文本
 * @param {string} text 原始文本
 * @returns {string} 清理后的文本
 */
function cleanResponseText(text) {
  if (!text) return '';

  // 处理API响应格式
  const apiMatch = text.match(/^meta=.*?content=TextContent\(.*?text='([\s\S]*?)'.*?\).*$/s);
  if (apiMatch && apiMatch[1]) {
    // 替换转义字符
    return apiMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  return text;
}

/**
 * 将Markdown文本转换为HTML
 * @param {string} markdown Markdown文本
 * @returns {string} 转换后的HTML
 */
function convertMarkdownToHTML(markdown) {
  if (!markdown) return '';

  // 清理API响应格式
  const cleanedMarkdown = cleanResponseText(markdown);

  let html = cleanedMarkdown;

  // 转换标题 (# 标题) -> <h1>标题</h1>
  html = html.replace(/^#{6}\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#{5}\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>');

  // 转换粗体 (**文本**) -> <strong>文本</strong>
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 转换斜体 (*文本*) -> <em>文本</em>
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 转换链接 [文本](链接) -> <a href="链接">文本</a>
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  // 转换学术引用链接 [文本][1] -> <a href="#reference-1">文本</a>
  html = html.replace(/\[(.+?)\]\[(\d+)\]/g, '<a href="#reference-$2" class="citation">$1<sup>[$2]</sup></a>');

  // 转换直接引用链接 [1] -> <a href="#reference-1">[1]</a>
  html = html.replace(/\[(\d+)\](?!\()/g, '<a href="#reference-$1" class="citation">[$1]</a>');

  // 处理无序列表 - 首先将列表项分组
  let inList = false;
  let listBuffer = [];
  let result = [];

  const lines = html.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const listMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);

    if (listMatch) {
      if (!inList) {
        inList = true;
        listBuffer = [];
      }
      listBuffer.push(listMatch[1]);
    } else if (inList) {
      // 列表结束
      inList = false;
      const listItems = listBuffer.map(item => `<li>${item}</li>`).join('');
      result.push(`<ul>${listItems}</ul>`);
      listBuffer = [];
      result.push(line);
    } else {
      result.push(line);
    }
  }

  // 处理最后一个可能的列表
  if (inList && listBuffer.length > 0) {
    const listItems = listBuffer.map(item => `<li>${item}</li>`).join('');
    result.push(`<ul>${listItems}</ul>`);
  }

  html = result.join('\n');

  // 处理有序列表 - 类似的方法
  inList = false;
  listBuffer = [];
  result = [];

  lines.length = 0;
  lines.push(...html.split('\n'));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const listMatch = line.match(/^[\s]*(\d+)\.\s+(.+)$/);

    if (listMatch) {
      if (!inList) {
        inList = true;
        listBuffer = [];
      }
      listBuffer.push(listMatch[2]);
    } else if (inList) {
      // 列表结束
      inList = false;
      const listItems = listBuffer.map(item => `<li>${item}</li>`).join('');
      result.push(`<ol>${listItems}</ol>`);
      listBuffer = [];
      result.push(line);
    } else {
      result.push(line);
    }
  }

  // 处理最后一个可能的列表
  if (inList && listBuffer.length > 0) {
    const listItems = listBuffer.map(item => `<li>${item}</li>`).join('');
    result.push(`<ol>${listItems}</ol>`);
  }

  html = result.join('\n');

  // 转换引用 (> 文本) -> <blockquote>文本</blockquote>
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // 转换代码块 - 支持语言高亮
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, language, code) => {
    return `<pre><code class="language-${language || 'plaintext'}">${code.trim()}</code></pre>`;
  });

  // 转换行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 转换水平线
  html = html.replace(/^[-*_]{3,}$/gm, '<hr>');

  // 转换参考文献部分
  html = html.replace(/^## 参考文献$([\s\S]*?)(?=^#|$)/gm, (match, references) => {
    const refLines = references.trim().split('\n');
    let refHTML = '<div class="references"><h2>参考文献</h2><ol>';

    refLines.forEach((line, index) => {
      // 查找引用格式，如 1. [菜鸟教程 - MCP 协议]
      const refMatch = line.match(/^\d+\.\s+\[(.+?)\](?:\((.+?)\))?/);
      if (refMatch) {
        const title = refMatch[1];
        const url = refMatch[2] || '';
        const id = `reference-${index + 1}`;

        if (url) {
          refHTML += `<li id="${id}"><a href="${url}" target="_blank">${title}</a></li>`;
        } else {
          refHTML += `<li id="${id}">${title}</li>`;
        }
      }
    });

    refHTML += '</ol></div>';
    return refHTML;
  });

  // 转换JSON代码块 - 特殊处理以使其更美观
  html = html.replace(/<pre><code class="language-(json|plaintext)">([\s\S]*?)\{([\s\S]*?)\}([\s\S]*?)<\/code><\/pre>/g,
  (match, lang, before, content, after) => {
    try {
      // 尝试格式化JSON
      const jsonContent = `{${content}}`;
      const formattedJSON = JSON.stringify(JSON.parse(jsonContent), null, 2);
      return `<pre><code class="language-${lang}">${before}${formattedJSON}${after}</code></pre>`;
    } catch (e) {
      // 如果不是有效JSON，返回原样
      return match;
    }
  });

  // 处理尚未包含在任何标签中的文本作为段落
  html = html.replace(/^([^<\s][^<]*)$/gm, '<p>$1</p>');

  // 处理连续的空行，最多保留一个
  html = html.replace(/\n{3,}/g, '\n\n');

  // 给摘要部分添加特殊样式
  html = html.replace(/<h2>摘要<\/h2>\s*<p>([\s\S]*?)<\/p>/g,
    '<h2>摘要</h2><div class="abstract"><p>$1</p></div>');

  return html;
}

/**
 * 提取目录结构
 * @param {string} markdown Markdown文本
 * @returns {Array} 目录项数组
 */
function extractTableOfContents(markdown) {
  if (!markdown) return [];

  // 清理API响应格式
  const cleanedMarkdown = cleanResponseText(markdown);

  // 查找所有标题
  const headings = [...cleanedMarkdown.matchAll(/^(#{1,6})\s+(.+)$/gm)];

  // 检查是否已有目录部分
  const hasTOCSection = /^#{1,2}\s+目录$/.test(cleanedMarkdown);

  // 如果存在目录部分，跳过它
  let tocItems = [];
  if (hasTOCSection) {
    // 查找目录部分之后的标题
    const tocMatch = cleanedMarkdown.match(/^#{1,2}\s+目录$[\s\S]*?^---/m);
    if (tocMatch) {
      const afterTOC = cleanedMarkdown.substring(tocMatch.index + tocMatch[0].length);
      tocItems = [...afterTOC.matchAll(/^(#{1,6})\s+(.+)$/gm)]
        .map((match, index) => {
          const level = match[1].length;
          const text = match[2];
          const id = `heading-${index}`;
          return { level, text, id };
        });
    }
  } else {
    // 没有目录部分，处理所有标题
    tocItems = headings.map((match, index) => {
      const level = match[1].length;
      const text = match[2];
      const id = `heading-${index}`;
      return { level, text, id };
    });
  }

  return tocItems;
}

/**
 * Markdown渲染器组件
 * @param {Object} props 组件属性
 * @param {string} props.content Markdown内容
 */
export function MarkdownRenderer({ content }) {
  // 处理原始内容
  const markdownText = typeof content === 'string' ? content : '';
  const cleanedText = cleanResponseText(markdownText);

  // 提取目录
  const tocItems = extractTableOfContents(cleanedText);

  // 是否显示目录 - 条件更宽松，只要有足够的标题就显示
  const showTOC = tocItems.length >= 3;

  // 转换Markdown为HTML
  const htmlContent = convertMarkdownToHTML(markdownText);

  // 创建目录HTML
  const tocHTML = showTOC ? (
    <div className="markdown-toc">
      <h3>目录</h3>
      <ul>
        {tocItems.map((item, index) => (
          <li key={index} className={`toc-level-${item.level}`}>
            <a href={`#${item.id}`}>{item.text}</a>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  // 为HTML内容添加标题ID以支持目录跳转
  let contentWithIds = htmlContent;
  tocItems.forEach((item, index) => {
    const headingRegex = new RegExp(`<h${item.level}>(${escapeRegExp(item.text)})</h${item.level}>`, 'g');
    contentWithIds = contentWithIds.replace(headingRegex, `<h${item.level} id="${item.id}">$1</h${item.level}>`);
  });

  return (
    <div className="markdown-container">
      {showTOC && tocHTML}
      <div
        className="markdown-content"
        dangerouslySetInnerHTML={{ __html: contentWithIds }}
      />
    </div>
  );
}

// 辅助函数：转义正则表达式中的特殊字符
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default MarkdownRenderer;