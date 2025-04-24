export const API_CONFIG = {
  base: 'http://localhost:8007',
  endpoints: {
    chat: '/chat/stream',
    tools:'/api/tools'
  },
  timeout: 30000
};

export const FILE_API = {
  base: 'http://localhost:8008',
  endpoints: {
    user: '/file/user',
    uploadImage: '/file/images',
    uploadFile: '/file/files',
  },
  timeout: 30000
};

