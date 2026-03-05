// API Configuration for Multi-Device Support
export const API_CONFIG = {
  // Development (use production backend)
  development: {
    baseURL: 'https://jigarthanda-api.onrender.com/api',
    timeout: 10000,
  },
  
  // Production (Render cloud)
  production: {
    baseURL: 'https://jigarthanda-api.onrender.com/api',
    timeout: 10000,
  },
};

// Get current environment
const isDevelopment = __DEV__; // Expo development flag

// Export current API configuration
export const API = API_CONFIG[isDevelopment ? 'development' : 'production'];

// API Endpoints
export const API_ENDPOINTS = {
  ORDERS: '/orders',
  SETTINGS: '/settings',
  HEALTH: '/health',
  SYNC: '/sync',
} as const;
