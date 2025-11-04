# LumoAI

Built this website to provide students and teachers with a simple, modern learning experience: AI chat, class collaboration, lecture tools, and a focus timer — all in one place.

## Features
- Student Portal
  - Live AI Q&A Chat (voice input, formatted replies, export)
  - Class Chat 
  - Study Tools: Pomodoro timer with background running
- Teacher Portal
  - Video generator (prototype)
  - Basic analytics-ready structure
- UI/UX
  - Branded login with creative background
  - Accessible, responsive layout

## Tech Stack
- Frontend: React + TypeScript + Vite + Tailwind
- Build/Dev: Vite

## Run Locally
Prerequisites: Node.js 

1) Install dependencies  
   npm install

2) Create .env.local at the project root and set your API key  
   API_KEY=your_api_key_here

3) Start the app  
   npm run dev

Optional (auth/class chat server):  
- Start WebSocket/auth server in /server if needed.

## Project Structure
- components/ … shared and page components (student, teacher, common)
- services/ … API and utility services (auth, AI, audio, export)
- server/ … optional WebSocket/auth server (no secrets committed)
- App.tsx, index.tsx, vite.config.ts … app shell

