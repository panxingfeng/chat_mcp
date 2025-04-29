import React, { useRef, useCallback, memo, useState, useEffect } from 'react';
import Message from './Message';
import './MessageList.css';

const MessageList = memo(function MessageList({
  messages,
  loading,
  onExampleClick,
  onHideSidebar,
  onSendMessage,
  streamingMessageId,
  onDeleteMessage,
}) {
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const lastContentHeightRef = useRef(0);
  const lastMessageCountRef = useRef(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastNewMessageId, setLastNewMessageId] = useState(null);

  const [currentTheme, setCurrentTheme] = useState(
    document.documentElement.getAttribute('data-theme') ||
    (document.documentElement.classList.contains('theme-dark') ? 'dark' : 'light')
  );

  const scrollToBottom = useCallback((behavior = 'smooth', offset = 0) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });

      if (offset !== 0 && containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollTop + offset;
      }
    }
  }, []);

  useEffect(() => {
    const newMessageAdded = messages.length > lastMessageCountRef.current;
    lastMessageCountRef.current = messages.length;

    if (newMessageAdded && messages.length === 1) {
      scrollToBottom('auto');
      return;
    }

    if (newMessageAdded && messages.length > 0) {
      setLastNewMessageId(messages[messages.length - 1].id);

      if (userHasScrolled) {
        setUnreadCount(prev => prev + 1);
      }
    }

    if (!userHasScrolled || streamingMessageId) {
      scrollToBottom('smooth');
    }
  }, [messages, streamingMessageId, userHasScrolled, scrollToBottom]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastScrollTop = container.scrollTop;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

      const scrollingDown = scrollTop > lastScrollTop;

      lastScrollTop = scrollTop;

      if (isAtBottom) {
        setUserHasScrolled(false);
        setUnreadCount(0);
      } else if (!scrollingDown) {
        setUserHasScrolled(true);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const newHeight = entry.contentRect.height;

        const heightDifference = newHeight - lastContentHeightRef.current;
        const significantChange = heightDifference > 20;

        if (significantChange && streamingMessageId && !userHasScrolled) {
          scrollToBottom('auto');
        }

        lastContentHeightRef.current = newHeight;
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [streamingMessageId, userHasScrolled, scrollToBottom]);

  useEffect(() => {
    const updateTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      if (theme) {
        setCurrentTheme(theme);
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

    const observer = new MutationObserver(updateTheme);

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

  const handleExampleClick = useCallback((example) => {
    if (onExampleClick) {
      onExampleClick(example);
    }
  }, [onExampleClick]);

  const handleContainerClick = useCallback(() => {
    if (window.innerWidth <= 768 && onHideSidebar) {
      onHideSidebar();
    }
  }, [onHideSidebar]);

  const ScrollToBottomButton = () => {
    const shouldShow = userHasScrolled && (unreadCount > 0 || streamingMessageId);

    if (!shouldShow) return null;

    return (
      <button
        className="scroll-to-bottom-button improved"
        onClick={(e) => {
          e.stopPropagation();
          setUserHasScrolled(false);
          scrollToBottom('smooth');
          setUnreadCount(0);
        }}
      >
        <span className="scroll-icon">↓</span>
        <span className="scroll-text">
          {unreadCount > 0 ? `${unreadCount}条新消息` : "查看新消息"}
        </span>
      </button>
    );
  };

  const StreamingIndicator = () => {
    if (!streamingMessageId) return null;

    return (
      <div className="streaming-indicator">
        <div className="streaming-icon">
          <span></span><span></span><span></span>
        </div>
        <span className="streaming-text">AI正在思考...</span>
      </div>
    );
  };

  if (messages.length === 0) {
    return (
      <div className="welcome-container" onClick={handleContainerClick}>
        <h2>AI聊天助手</h2>
        <p>您可以问我任何问题，我会尽力回答！</p>
        <div className="examples">
          <div className="example-items">
            <div
              className="example-item"
              onClick={(e) => {
                e.stopPropagation();
                handleExampleClick("测试Markdown表格");
              }}
            >
              "测试Markdown表格"
            </div>
            <div
              className="example-item"
              onClick={(e) => {
                e.stopPropagation();
                handleExampleClick("输出常见的LaTex数学公式");
              }}
            >
              "输出常见的LaTex数学公式"
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="message-list"
      onClick={handleContainerClick}
      data-theme={currentTheme}
      ref={containerRef}
    >
      {messages.map(message => (
        <Message
          key={`${message.id}-${currentTheme}`}
          message={message}
          isStreaming={message.id === streamingMessageId}
          isNew={message.id === lastNewMessageId}
          onSendMessage={onSendMessage}
          onDeleteMessage={onDeleteMessage}
          currentTheme={currentTheme}
        />
      ))}
      {loading && !streamingMessageId && (
        <div className="loading-indicator">
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}
      <StreamingIndicator />
      <ScrollToBottomButton />
      <div className="message-end-spacer" style={{ height: '20px', width: '100%' }} />
      <div ref={messagesEndRef} style={{ height: '1px', width: '100%' }} />
    </div>
  );
});

export default MessageList;