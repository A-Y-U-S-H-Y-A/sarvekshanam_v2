'use strict';

/**
 * Parses Server-Sent Events from a fetch Response stream.
 * @param {ReadableStreamDefaultReader} reader - The reader from response.body.getReader()
 * @param {Function} onEvent - Callback for each parsed event: onEvent(eventObj)
 */
async function parseSSEStream(reader, onEvent) {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep the incomplete line

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const dataStr = line.substring(6);
          if (!dataStr) continue;
          const event = JSON.parse(dataStr);
          onEvent(event);
        } catch (e) {
          console.error('Error parsing SSE data chunk:', e.message);
        }
      }
    }
  }
}

module.exports = { parseSSEStream };
