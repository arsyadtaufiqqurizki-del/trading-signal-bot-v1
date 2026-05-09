'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * ContentGenerator leverages Gemini AI to create viral content scripts.
 * It focuses on psychological triggers and the Indonesian social media landscape.
 */
class ContentGenerator {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[ContentGenerator] GEMINI_API_KEY is missing in .env');
      this.genAI = null;
    } else {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  /**
   * Generates 3 different content angles for a given keyword.
   * @param {string} keyword - The topic or trend to create content for.
   * @returns {Promise<string>} - The formatted scripts from AI.
   */
  async generateHooks(keyword) {
    if (!this.genAI) {
      throw new Error('Gemini API Key is not configured. Please add GEMINI_API_KEY to your .env file.');
    }

    const modelsToTry = ['gemini-1.0-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'];
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[ContentGenerator] Attempting to use model: ${modelName}`);
        const model = this.genAI.getGenerativeModel({ model: modelName });

        const prompt = `
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
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      } catch (error) {
        console.error(`[ContentGenerator] Model ${modelName} failed: ${error.message}`);
        lastError = error;
        // Continue to the next model in the list
      }
    }

    throw new Error(`All attempted models failed. Last error: ${lastError?.message}`);
  }
}

module.exports = new ContentGenerator();
