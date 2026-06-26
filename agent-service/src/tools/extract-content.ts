/**
 * extract_content tool
 * Extracts clean text from a URL or plain text input.
 */

import { tool } from '@tencent-ai/agent-sdk';
import { z } from 'zod';
import { toolSuccess, toolError, withErrorHandling } from './tool-helpers.js';

const FETCH_TIMEOUT_MS = 30_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5 MB ceiling on remote pages

export const extractContentTool = tool(
  'extract_content',
  'Extract clean text content from a URL or plain text. ' +
    'For URL: fetches the webpage and extracts the main text content. ' +
    'For text: returns the text with metadata. ' +
    'Call this to get the source material for content generation.',
  {
    type: z.enum(['url', 'text']).describe('Source type'),
    content: z.string().describe('The URL to fetch or the raw text content'),
  },
  ({ type, content }) =>
    withErrorHandling(async () => {
      if (type === 'text') {
        return toolSuccess({
          title: null,
          text: content,
          charCount: content.length,
          language: detectLanguage(content),
        });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(content, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AIMake/1.0; +https://studio.aimake.cc)',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          return toolError(`Failed to fetch URL: ${response.status} ${response.statusText}`);
        }

        const declaredLength = Number(response.headers.get('content-length') || '0');
        if (declaredLength > MAX_HTML_BYTES) {
          return toolError(
            `URL content too large: ${declaredLength} bytes (max ${MAX_HTML_BYTES})`
          );
        }

        const html = await response.text();
        if (html.length > MAX_HTML_BYTES) {
          return toolError(`URL content too large: ${html.length} bytes (max ${MAX_HTML_BYTES})`);
        }

        const text = stripHtml(html);
        return toolSuccess({
          title: extractTitle(html),
          text,
          charCount: text.length,
          language: detectLanguage(text),
        });
      } finally {
        clearTimeout(timeout);
      }
    }, 'Content extraction failed')
);

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<\/?(p|div|br|h[1-6]|li|blockquote|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (match) {
    return match[1].replace(/<[^>]+>/g, '').trim() || null;
  }
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    return h1Match[1].replace(/<[^>]+>/g, '').trim() || null;
  }
  return null;
}

export function detectLanguage(text: string): 'zh' | 'en' {
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf]/g;
  const cjkMatches = text.match(cjkPattern);
  const cjkRatio = cjkMatches ? cjkMatches.length / text.length : 0;
  return cjkRatio > 0.3 ? 'zh' : 'en';
}
