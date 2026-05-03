#!/bin/bash

# 7B Records - Raspberry Pi Setup & Desktop Icon Script
echo "🎵 Starting 7B Records Setup for Raspberry Pi..."

# 1. Update and install system dependencies
echo "📦 Installing system dependencies..."
sudo apt update
# Try chromium-browser first, then chromium if it fails (common on newer Debian versions)
sudo apt install -y icecast2 darkice mkchromecast nodejs npm chromium-browser || sudo apt install -y chromium

# 2. Setup the project folder
PROJECT_NAME="7B_records"
REPO_URL="https://github.com/starlandmusic/7B_records.git"

# Check if we are inside the project folder already
if [[ "$PWD" == *"$PROJECT_NAME"* ]]; then
    PROJECT_DIR=$(pwd)
else
    # If not, check if it exists in the current directory
    if [ -d "$PROJECT_NAME" ]; then
        cd "$PROJECT_NAME"
        PROJECT_DIR=$(pwd)
    else
        echo "📂 Cloning repository..."
        git clone $REPO_URL
        cd "$PROJECT_NAME"
        PROJECT_DIR=$(pwd)
    fi
fi

echo "📂 Working directory: $PROJECT_DIR"

# 3. Install Node.js dependencies
echo "🚀 Preparing application files..."

# If package.json is missing or broken, recreate it
if [ ! -f "package.json" ] || ! grep -q "\"build\":" "package.json"; then
    echo "⚠️  Missing or broken package.json detected. Recreating..."
    cat <<EOF > package.json
{
  "name": "7b-records",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx server.ts",
    "start": "tsx server.ts",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@google/genai": "^1.30.2",
    "@tailwindcss/vite": "^4.0.0",
    "express": "^4.21.2",
    "lucide-react": "^0.479.0",
    "motion": "^12.4.10",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "4.0.0",
    "vite": "^6.2.1"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.13.10",
    "@types/react": "^19.0.10",
    "@types/react-dom": "^19.0.4",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.5.3",
    "tailwindcss": "4.0.0",
    "tsx": "^4.19.3",
    "typescript": "^5.8.2"
  }
}
EOF
fi

# Ensure tsconfig.json exists
if [ ! -f "tsconfig.json" ]; then
    echo "⚠️  Missing tsconfig.json. Creating..."
    cat <<EOF > tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ESNext"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "server.ts"]
}
EOF
fi

# Ensure vite.config.ts exists
if [ ! -f "vite.config.ts" ]; then
    echo "⚠️  Missing vite.config.ts. Creating..."
    cat <<EOF > vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    host: '0.0.0.0'
  }
})
EOF
fi

# Ensure index.html exists
if [ ! -f "index.html" ]; then
    echo "⚠️  Missing index.html. Creating..."
    cat <<EOF > index.html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>7B Records Control</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF
fi

# Ensure src directory and basic files exist
if [ ! -d "src" ]; then
    echo "⚠️  Missing src directory. Creating basic structure..."
    mkdir -p src
fi

if [ ! -f "src/main.tsx" ]; then
    cat <<EOF > src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
EOF
fi

if [ ! -f "src/index.css" ]; then
    cat <<EOF > src/index.css
@import "tailwindcss";
EOF
fi

# Ensure server.ts exists
if [ ! -f "server.ts" ]; then
    echo "⚠️  Missing server.ts. Creating..."
    cat <<EOF > server.ts
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// In production, serve the built files
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(\`7B Records server running at http://localhost:\${PORT}\`);
});
EOF
fi

echo "📦 Running npm install..."
npm install
echo "🏗️  Building the application..."
npm run build

# 4. Create the Desktop Shortcut
echo "🖥️  Creating Desktop Shortcut..."
DESKTOP_FILE=~/Desktop/7B_Records.desktop

# Create the .desktop file content
# This version runs the server using node (production mode) after build
cat <<EOF > $DESKTOP_FILE
[Desktop Entry]
Name=7B Records
Comment=Synthwave Audio Broadcast Controller
Exec=lxterminal -e "bash -c 'cd $PROJECT_DIR && npm start; exec bash'"
Icon=multimedia-audio-player
Terminal=false
Type=Application
Categories=AudioVideo;Audio;
EOF

# Make it executable
chmod +x $DESKTOP_FILE

echo "✅ Setup Complete!"
echo "-------------------------------------------------------"
echo "1. A '7B Records' icon has been created on your Desktop."
echo "2. Double-click the icon to start the server and interface."
echo "3. The app is optimized for your 800x480 screen."
echo "-------------------------------------------------------"
