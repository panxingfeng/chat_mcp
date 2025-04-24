import { useState, useEffect, useCallback, useRef } from 'react';

const useLocalStorage = () => {
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const lastSavedData = useRef(null);

  const saveDataToLocalStorage = useCallback((data) => {
    if (!data) return;

    if (
      lastSavedData.current &&
      JSON.stringify(lastSavedData.current) === JSON.stringify(data)
    ) {
      return;
    }

    const dataToSave = {
      ...data,
      lastUpdated: new Date().toISOString()
    };

    try {
      localStorage.setItem('chatAppData', JSON.stringify(dataToSave));
      lastSavedData.current = { ...data };
    } catch (error) {
      console.error('保存数据到本地存储失败:', error);
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('存储空间不足，尝试保存部分重要数据');
        try {
          const essentialData = {
            settings: data.settings,
            currentConversation: data.currentConversation,
            conversations: data.conversations ?
              data.conversations.filter(conv => conv.id === data.currentConversation) : [],
            lastUpdated: new Date().toISOString(),
            isPartial: true
          };
          localStorage.setItem('chatAppData', JSON.stringify(essentialData));
          lastSavedData.current = { ...essentialData };
          console.log('已保存部分重要数据');
        } catch (err) {
          console.error('保存部分数据也失败:', err);
        }
      }
    }
  }, []);

  const loadDataFromLocalStorage = useCallback(() => {
    try {
      const savedData = localStorage.getItem('chatAppData');
      if (!savedData) return null;

      const parsedData = JSON.parse(savedData);

      if (parsedData.isPartial) {
        console.warn('注意: 加载的是部分数据，部分历史记录可能丢失');
      }

      lastSavedData.current = { ...parsedData };
      setIsDataLoaded(true);
      return parsedData;
    } catch (error) {
      console.error('从本地存储加载数据失败:', error);
      return null;
    }
  }, []);

  const saveSetting = useCallback((key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`保存设置 ${key} 失败:`, error);
    }
  }, []);

  const loadSetting = useCallback((key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`加载设置 ${key} 失败:`, error);
      return defaultValue;
    }
  }, []);

  const clearAllData = useCallback(() => {
    try {
      localStorage.removeItem('chatAppData');
      lastSavedData.current = null;
      console.log('已清除所有聊天应用数据');
    } catch (error) {
      console.error('清除数据失败:', error);
    }
  }, []);

  const exportData = useCallback(() => {
    try {
      const data = localStorage.getItem('chatAppData');
      if (!data) {
        console.warn('没有可导出的数据');
        return false;
      }

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').substring(0, 14);

      a.href = url;
      a.download = `chat-backup-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (error) {
      console.error('导出数据失败:', error);
      return false;
    }
  }, []);

  const importData = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);

          if (!data.conversations || !data.settings) {
            reject(new Error('无效的数据格式'));
            return;
          }

          const newData = {
            ...data,
            lastUpdated: new Date().toISOString(),
            importedAt: new Date().toISOString()
          };

          localStorage.setItem('chatAppData', JSON.stringify(newData));
          lastSavedData.current = { ...newData };

          resolve(true);
        } catch (error) {
          console.error('导入数据失败:', error);
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('读取文件失败'));
      };

      reader.readAsText(file);
    });
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      window.dispatchEvent(new CustomEvent('saveAppData'));
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);


  return {
    saveDataToLocalStorage,
    loadDataFromLocalStorage,
    saveSetting,
    loadSetting,
    clearAllData,
    exportData,
    importData,
    isDataLoaded
  };
};

export default useLocalStorage;