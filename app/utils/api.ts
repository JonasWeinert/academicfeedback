/**
 * Utility functions for API interaction
 */

/**
 * Makes a fetch request to the specified endpoint with the Gemini API key if available
 * @param url The API endpoint URL
 * @param options Fetch options
 * @returns Fetch response
 */
export async function fetchWithApiKey(url: string, options: RequestInit = {}): Promise<Response> {
  // Get authentication method and API key from localStorage if available
  const authMethod = typeof window !== 'undefined' ? localStorage.getItem('authMethod') : null;
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('geminiApiKey') : null;
  
  // Create headers object if it doesn't exist
  const headers = options.headers || {};
  
  // Always include the auth method in headers if it exists
  if (authMethod) {
    Object.assign(headers, {
      'x-auth-method': authMethod
    });
  }
  
  // Add API key to headers ONLY if the auth method was api_key
  if (authMethod === 'api_key' && apiKey) {
    Object.assign(headers, {
      'x-gemini-api-key': apiKey
    });
  }
  
  // Return fetch with updated options
  return fetch(url, {
    ...options,
    headers
  });
} 