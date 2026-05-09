'use strict';

const axios = require('axios');

/**
 * ContentGenerator uses OpenRouter AI to generate viral content scripts.
 * OpenRouter provides a stable, unified interface for multiple high-end AI models.
 */
class ContentGenerator {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    // Using gemini-flash-1.5 via OpenRouter for speed and quality
    this.model = 'google/gemini-flash-1.5'; 
  }

  /**
   * Generates 3 different content angles for a given keyword.
   * @param {string} keyword - The topic or trend to create content for.
   * @returns {Promise<string>} - The formatted scripts from AI.
   */
  async generateHooks(keyword) {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY is missing in .env');
    }

    // Try multiple stable models as fallback, prioritizing llama-3-8b-instruct
    const modelsToTry = [
      'meta-llama/llama-3-8b-instruct', 
      'google/gemini-pro-1.5', 
      'google/gemini-pro', 
      'google/gemma-4-31b-it'
    ];
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[ContentGenerator] Attempting OpenRouter call to: ${modelName}`);
        
        const response = await axios.post(
          this.apiUrl,
          {
            model: modelName,
            messages: [
              {
                role: 'system',
                content: 'You are an expert Viral Marketer specializing in the Indonesian market (TikTok, Instagram Reels, and YouTube Shorts). You create high-converting content hooks and short scripts that stop the scroll and drive engagement.'
              },
              {
                role: 'user',
                content: `Create 3 different high-converting content hooks and short scripts for the keyword: "${keyword}".

              CRITICAL INSTRUCTIONS:
              1. DO NOT include any introductory text (e.g., "Here are the scripts...", "Certainly!").
              2. DO NOT include any concluding notes or summaries (e.g., "Note: These hooks...").
              3. Provide ONLY the scripts.

              For each angle, use this EXACT format:
              🎯 Angle: [Name]
              🪝 Hook: "[Powerful opening sentence]"
              💎 Value: [The core message/meat of the content]
              📣 CTA: "[Persuasive call to action]"
              --------------------------------------------

              Requirements:
              - Use a mix of professional and catchy Indonesian (Bahasa Indonesia yang santai, modern, dan persuasif).
              - Focus on psychological triggers (FOMO, Curiosity, Pain Points).
              - Ensure the hooks are bold and attention-grabbing.
              - Format the output clearly using Markdown for Telegram.
              `
              }            ],
            temperature: 0.7
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://gemini-cli.vercel.app',
              'X-Title': 'Gemini CLI Trend Bot'
            }
          }
        );

        const text = response.data.choices[0].message.content;
        return text;

      } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[ContentGenerator] Model ${modelName} failed: ${errorMsg}`);
        lastError = errorMsg;
      }
    }

    throw new Error(`All OpenRouter models failed. Last error: ${lastError}`);
  }
}

module.exports = new ContentGenerator();
