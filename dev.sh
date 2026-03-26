#!/bin/sh
# Quick local development startup
# Usage: ./dev.sh

set -e

# Check for .env
if [ ! -f .env ]; then
  echo "📋 No .env found — copying from .env.example"
  cp .env.example .env
  echo "⚠️  Edit .env with your Immich URL and API key, then re-run."
  exit 1
fi

# Load .env
export $(grep -v '^#' .env | xargs)

echo "🔧 Installing backend deps..."
cd backend && npm install && cd ..

echo "🔧 Installing frontend deps..."
cd frontend && npm install && cd ..

echo ""
echo "🚀 Starting backend on :3000 and frontend dev server on :5173"
echo "   Admin: http://localhost:5173/admin"
echo ""

# Run both in parallel
(cd backend && node src/index.js) &
BACKEND_PID=$!

(cd frontend && npm run dev) &
FRONTEND_PID=$!

# Trap Ctrl+C and kill both
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
