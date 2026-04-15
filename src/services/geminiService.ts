import { GoogleGenAI, Type } from "@google/genai";

const MODEL_NAME = "gemini-3-flash-preview";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  }

  async translateSpeech(base64Audio: string, mimeType: string) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in the environment.");
    }
    try {
      const response = await this.ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  data: base64Audio,
                  mimeType: mimeType,
                },
              },
              {
                text: `You are a professional AI Systems Architect and Prompt Engineer. 
Your task is to transform the spoken Sinhala input in the provided audio into a highly structured, technical English prompt optimized for advanced generative AI models.

Operational Requirements for the Generated English Prompt:
1. **Clean Narrative**: The output must be a clean, descriptive narrative. DO NOT use any markdown formatting characters such as asterisks (*), hashtags (#), or bullet points (-).
2. **Structural Components**: You must accurately identify and integrate the following components from the input:
   - Rules/Constraints: Specific limitations or requirements.
   - Context: The background or setting of the request.
   - Task: The primary action to be performed.
   - Objective: The desired end goal or outcome.
   - Mother Logic: The underlying reasoning or "first principles" required.
   - Output Specifications: Technical details like format, length, or specific metrics (e.g., Frame Rate).
3. **Precision**: Convert natural language concepts into a precise, computer-legible instruction set.
4. **Nuance Capture**: Think step-by-step to ensure every nuance of the spoken Sinhala input is captured and translated into a professional, cohesive description.

Return the result as a JSON object with 'sinhala' (the transcription) and 'english' (the engineered AI prompt) keys.`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sinhala: { type: Type.STRING },
              english: { type: Type.STRING },
              tone: { type: Type.STRING, description: "Formal or Informal" }
            },
            required: ["sinhala", "english"],
          },
        },
      });

      const text = response.text;
      if (text) {
        return JSON.parse(text);
      }
      throw new Error("No response from Gemini");
    } catch (error) {
      console.error("Gemini Translation Error:", error);
      throw error;
    }
  }

  async translateAndEngineer(sinhalaText: string) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in the environment.");
    }
    try {
      const response = await this.ai.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `You are a professional AI Systems Architect and Prompt Engineer. 
Your task is to transform the following Sinhala text into a highly structured, technical English prompt optimized for advanced generative AI models.

Sinhala Input: "${sinhalaText}"

Operational Requirements for the Generated English Prompt:
1. **Clean Narrative**: The output must be a clean, descriptive narrative. DO NOT use any markdown formatting characters such as asterisks (*), hashtags (#), or bullet points (-).
2. **Structural Components**: You must accurately identify and integrate the following components from the input:
   - Rules/Constraints: Specific limitations or requirements.
   - Context: The background or setting of the request.
   - Task: The primary action to be performed.
   - Objective: The desired end goal or outcome.
   - Mother Logic: The underlying reasoning or "first principles" required.
   - Output Specifications: Technical details like format, length, or specific metrics (e.g., Frame Rate).
3. **Precision**: Convert natural language concepts into a precise, computer-legible instruction set.
4. **Nuance Capture**: Think step-by-step to ensure every nuance of the Sinhala input is captured and translated into a professional, cohesive description.

Return only the engineered English prompt text.`,
              },
            ],
          },
        ],
      });

      return response.text;
    } catch (error) {
      console.error("Gemini Engineering Error:", error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();
