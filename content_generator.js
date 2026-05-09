'use strict';

const axios = require('axios');

/**
 * ContentGenerator uses direct REST API calls to Gemini to avoid SDK versioning issues.
 * This is the most stable way to ensure compatibility across different regions and API versions.
 */
class ContentGenerator {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    // We use v1beta as it's the most flexible, but we call it via direct REST
    this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  /**
   * Generates 3 different content angles for a given keyword.
   * @param {string} keyword - The topic or trend to create content for.
   * @returns {Promise<string>} - The formatted scripts from AI.
   */
  async generateHooks(keyword) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY is missing in .env');
    }

    // We try the most stable models in order
    const modelsToTry = ['gemini-1.5-flash', 'gemini-1.0-pro'];
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[ContentGenerator] Attempting REST call to: ${modelName}`);
        
        const response = await axios.post(
          `${this.apiUrl}/${modelName}:generateContent?key=${this.apiKey}`,
          {
            contents: [{
              parts: [{
                text: `
                  You are an expert Viral Marketer specializing in the Indonesian market (TikTok, Instagram Reels, and YouTube Shorts).
                  Your task is to create 3 different high-converting content hooks and short scripts for the keyword: "${keyword}".

                  For each angle, follow this strict structure:
                  1. Angle Name (e.g., FOMO, Pain Point, Curiosity)
                  2. Hook: A powerful opening sentence to stop the scroll (first 3 seconds).
                  3. Value: The core message or "meat" of the content.
                  4. CTA: A persuasive call to action.

                  Requirements:
                  - Use a mix of professional and catchy Indonesian (Bahasa Indonesia yang santai, modern, dan persuasif).
                  - Focus on psychological triggers.
                  - Ensure the hooks are bold and attention-grabbing.
                  - Format the output clearly using Markdown for Telegram.

                  Example Format:
                  Angle: [Name]
                  Hook: "[Sentence]"
                  Value: [Description]
                  CTA: "[Sentence]"
                `
              }]
            }]
          },
          { headers: { 'Content-Type': 'application/json' } }
        );

        // Extract text from Gemini REST response structure
        const text = response.data.candidates[0].content.parts[0].text;
        return text;

      } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[ContentGenerator] Model ${modelName} REST call failed: ${errorMsg}`);
        lastError = errorMsg;
      }
    }

    throw new Error(`Direct API calls failed for all models. Last error: ${lastError}`);
  }
}

module.exports = new ContentGenerator();
