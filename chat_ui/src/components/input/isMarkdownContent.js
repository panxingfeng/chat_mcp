import React from 'react';
import './MarkdownRenderer.css';

export function isMarkdownContent(content) {
  const text = typeof content === 'string' ? content : '';

  const cleanedText = text.replace(/^meta=.*?content=TextContent\(.*?text='([\s\S]*?)'.*?\).*$/s, '$1');

  const markdownFeatures = [
    /^#{1,6}\s.+$/m,
    /^[\s]*[-*+]\s.+$/m,
    /^[\s]*\d+\.\s.+$/m,
    /^>\s.+$/m,
    /```[\s\S]*?```/,
    /\|.+\|.+\|/,
    /^[-*_]{3,}$/m,
    /\[.+?\](?:\(.+?\)|\[\d+\])/,
    /\*\*.+?\*\*/,
    /^---$/m,
    /\[\[?TOC\]?\]/i,
    /^## [A-Za-z0-9\u4e00-\u9fa5]+$/m
  ];

  const hasTOC = cleanedText.includes('## 目录') || cleanedText.includes('# 目录');

  const hasChapterTitles = /^## [A-Za-z0-9\u4e00-\u9fa5]+/m.test(cleanedText);

  const hasAcademicSections =
    (cleanedText.includes('## 摘要') || cleanedText.includes('# 摘要')) &&
    (cleanedText.includes('## 结论') || cleanedText.includes('# 结论') ||
     cleanedText.includes('## 参考文献') || cleanedText.includes('# 参考文献'));

  if (hasTOC || hasChapterTitles || hasAcademicSections) {
    return true;
  }

  const featureCount = markdownFeatures.filter(regex => regex.test(cleanedText)).length;

  return featureCount >= 3;
}


function cleanResponseText(text) {
  if (!text) return '';

  const apiMatch = text.match(/^meta=.*?content=TextContent\(.*?text='([\s\S]*?)'.*?\).*$/s);
  if (apiMatch && apiMatch[1]) {
    return apiMatch[1]
      .replace(/\\n/g, '\n')
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  return text;
}


function convertMarkdownToHTML(markdown) {
  if (!markdown) return '';

  const cleanedMarkdown = cleanResponseText(markdown);

  let html = cleanedMarkdown;

  html = html.replace(/^#{6}\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#{5}\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  html = html.replace(/\[(.+?)\]\[(\d+)\]/g, '<a href="#reference-$2" class="citation">$1<sup>[$2]</sup></a>');

  html = html.replace(/\[(\d+)\](?!\()/g, '<a href="#reference-$1" class="citation">[$1]</a>');

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
      inList = false;
      const listItems = listBuffer.map(item => `<li>${item}</li>`).join('');
      result.push(`<ul>${listItems}</ul>`);
      listBuffer = [];
      result.push(line);
    } else {
      result.push(line);
    }
  }

  if (inList && listBuffer.length > 0) {
    const listItems = listBuffer.map(item => `<li>${item}</li>`).join('');
    result.push(`<ul>${listItems}</ul>`);
  }

  html = result.join('\n');

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
      inList = false;
      const listItems = listBuffer.map(item => `<li>${item}</li>`).join('');
      result.push(`<ol>${listItems}</ol>`);
      listBuffer = [];
      result.push(line);
    } else {
      result.push(line);
    }
  }

  if (inList && listBuffer.length > 0) {
    const listItems = listBuffer.map(item => `<li>${item}</li>`).join('');
    result.push(`<ol>${listItems}</ol>`);
  }

  html = result.join('\n');

  html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, language, code) => {
    return `<pre><code class="language-${language || 'plaintext'}">${code.trim()}</code></pre>`;
  });

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  html = html.replace(/^[-*_]{3,}$/gm, '<hr>');

  html = html.replace(/^## 参考文献$([\s\S]*?)(?=^#|$)/gm, (match, references) => {
    const refLines = references.trim().split('\n');
    let refHTML = '<div class="references"><h2>参考文献</h2><ol>';

    refLines.forEach((line, index) => {
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

  html = html.replace(/<pre><code class="language-(json|plaintext)">([\s\S]*?)\{([\s\S]*?)\}([\s\S]*?)<\/code><\/pre>/g,
  (match, lang, before, content, after) => {
    try {
      const jsonContent = `{${content}}`;
      const formattedJSON = JSON.stringify(JSON.parse(jsonContent), null, 2);
      return `<pre><code class="language-${lang}">${before}${formattedJSON}${after}</code></pre>`;
    } catch (e) {
      return match;
    }
  });

  html = html.replace(/^([^<\s][^<]*)$/gm, '<p>$1</p>');

  html = html.replace(/\n{3,}/g, '\n\n');

  html = html.replace(/<h2>摘要<\/h2>\s*<p>([\s\S]*?)<\/p>/g,
    '<h2>摘要</h2><div class="abstract"><p>$1</p></div>');

  return html;
}


function extractTableOfContents(markdown) {
  if (!markdown) return [];

  const cleanedMarkdown = cleanResponseText(markdown);

  const headings = [...cleanedMarkdown.matchAll(/^(#{1,6})\s+(.+)$/gm)];

  const hasTOCSection = /^#{1,2}\s+目录$/.test(cleanedMarkdown);

  let tocItems = [];
  if (hasTOCSection) {

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
    tocItems = headings.map((match, index) => {
      const level = match[1].length;
      const text = match[2];
      const id = `heading-${index}`;
      return { level, text, id };
    });
  }

  return tocItems;
}


export function MarkdownRenderer({ content }) {
  const markdownText = typeof content === 'string' ? content : '';
  const cleanedText = cleanResponseText(markdownText);

  const tocItems = extractTableOfContents(cleanedText);

  const showTOC = tocItems.length >= 3;

  const htmlContent = convertMarkdownToHTML(markdownText);

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

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default MarkdownRenderer;