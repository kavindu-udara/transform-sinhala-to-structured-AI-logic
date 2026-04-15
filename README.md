# AI Systems Architect & Prompt Engineer

AI Systems Architect & Prompt Engineer is a Vite + React application that turns Sinhala speech or typed Sinhala input into a structured English prompt optimized for advanced AI models. The app captures microphone input, sends it to Gemini for transcription and prompt engineering, and keeps a local history of recent translations.

## Features

- Voice input with microphone recording and live volume feedback.
- Manual Sinhala input when microphone access is unavailable.
- Gemini-powered transcription and prompt engineering.
- Side-by-side display of the Sinhala source text and the engineered English output.
- Copy, clear, export, and history restore actions.
- Local persistence of translation history in `localStorage`.
- Built-in microphone permission guidance for iframe and browser security issues.

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- `@google/genai`
- `motion`
- `lucide-react`

## Requirements

- Node.js 18 or newer
- A Gemini API key
- A browser with microphone support

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a file named `.env.local` in the project root.
3. Add your Gemini API key:
   ```bash
   GEMINI_API_KEY=your_api_key_here
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

The app runs on `http://localhost:3000` by default.

## Available Scripts

- `npm run dev` - start the Vite development server on port 3000.
- `npm run build` - build the production bundle.
- `npm run preview` - preview the production build locally.
- `npm run lint` - run the TypeScript compiler check.
- `npm run clean` - remove the `dist` folder.

## How It Works

1. Speak Sinhala into the microphone or switch to manual typing.
2. The app captures the input and sends it to Gemini.
3. Gemini returns the Sinhala transcription and the engineered English prompt.
4. The result is displayed in two panels and saved to history.

## Permissions And Troubleshooting

- Microphone access requires a secure browser context.
- If the app is embedded in an iframe, the browser may block microphone access even when site permissions are allowed.
- If recording fails, use the built-in "Open in New Tab" option or switch to typing mode.
- If your browser denies access, check the site permissions in the address bar and allow microphone access.

## Project Structure

- `src/App.tsx` - main UI and recording / translation flow.
- `src/services/geminiService.ts` - Gemini API integration.
- `src/types.ts` - shared TypeScript types.
- `src/main.tsx` - app bootstrap.
- `src/index.css` - base styles.

## Notes

- The app stores recent translations in the browser, so clearing site data will remove history.
- The Gemini API key is injected at build time through Vite configuration.
