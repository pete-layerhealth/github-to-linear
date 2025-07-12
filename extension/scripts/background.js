/**
 * Load Linear API key from user preferences if set
 * @returns {Promise<string | null>}
 */
function loadLinearApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['pat'], ({ pat }) => resolve(pat || null));
  });
}

/** @type {Map<string, { data: any; t: number}>} */
const queryCache = new Map();

/**
 * Post a GraphQL query to the Linear API and get the parsed data back.
 * @param {string} query GraphQL query
 * @param {Object} [variables] GraphQL variables
 * @returns {Promise<any>}
 */
async function queryLinearApi(query, variables) {
  const apiKey = await loadLinearApiKey();
  if (!apiKey) return null;
  
  // Create cache key that includes variables for mutations
  const cacheKey = variables ? `${query}_${JSON.stringify(variables)}` : query;
  
  // Don't cache mutations (they typically start with 'mutation')
  const isMutation = query.trim().toLowerCase().startsWith('mutation');
  const cached = !isMutation ? queryCache.get(cacheKey) : null;
  if (cached && Date.now() - cached.t < 30_000) return cached.data;
  
  const requestBody = variables ? { query, variables } : { query };
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  const data = await response.json();
  
  // Only cache non-mutations
  if (!isMutation) {
    queryCache.set(cacheKey, { data, t: Date.now() });
  }
  
  return data;
}

// Handle messages from other parts of the extension.
// Currently handles messages containing a `linearQuery` GraphQL query,
// responding with data from the Linear API. All other messages will return null.
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  let query = Promise.resolve(null);
  if (request && typeof request === 'object' && 'linearQuery' in request) {
    query = queryLinearApi(request.linearQuery, request.variables);
  }
  query
    .then((json) => sendResponse(json || null))
    .catch((error) => {
      console.error({ error });
      sendResponse(null);
    });
  return true;
});
