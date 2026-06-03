const axios = require("axios");

const DEFAULT_HOST = "https://api.opsgenie.com";

// Mirror the retry behaviour of opsgenie-sdk (requestretry HTTPOrNetworkError):
// up to 5 attempts, 5s apart, retrying on network errors and 5xx responses.
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Create an Opsgenie alert via a direct authenticated POST, replacing the
// deprecated opsgenie-sdk (which pulled in the unmaintained `request` stack).
// Returns the parsed response body, e.g. { result, took, requestId }.
async function createAlert({ api_key, host }, alertRequest) {
  const url = `${host || DEFAULT_HOST}/v2/alerts`;
  // Auth travels in the header only; never send the key (or the EU toggle) in the body.
  const { api_key: _key, using_eu_url: _eu, ...body } = alertRequest;

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await axios.post(url, body, {
        headers: {
          Authorization: `GenieKey ${api_key}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });
      return response.data;
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const retriable = status === undefined || status >= 500;
      if (!retriable || attempt === MAX_ATTEMPTS) {
        // Surface Opsgenie's own error message when present (matches the SDK).
        const apiMessage = error.response?.data?.message;
        if (apiMessage) {
          const apiError = new Error(apiMessage);
          apiError.httpStatusCode = status;
          throw apiError;
        }
        throw error;
      }
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

module.exports = {
  createAlert,
  DEFAULT_HOST,
};
