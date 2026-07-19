// ###################################################
// File Name : logger.js
// Author : Hibiya Haraki
// Date : July 2026
// ###################################################
// Purpose : Define logger function
// Description : Define logger function
// ###################################################

export const debugLog = (...args) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('[DEBUG]', ...args);
  }
};