export interface TranslationHistory {
  id: string;
  sinhala: string;
  english: string;
  timestamp: number;
}

export interface GeminiResponse {
  sinhala: string;
  english: string;
  tone?: string;
}
