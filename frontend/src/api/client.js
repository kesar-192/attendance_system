import axios from 'axios';

export const TOKEN_KEY = 'campusflow.token';

const client = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', timeout: 20000 });

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

// attach the JWT to every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// an expired / revoked session anywhere sends the user back to the login screen
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !url.includes('/auth/login')) onUnauthorized();
    return Promise.reject(error);
  }
);

/** Human readable message from any axios error. */
export function errorMessage(error) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.code === 'ECONNABORTED') return 'The server took too long to respond. Try again.';
  if (error.request && !error.response) return 'Cannot reach the server. Check your connection.';
  return error.message || 'Something went wrong';
}

export default client;
