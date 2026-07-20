#!/bin/bash

echo "🚀 Starting LeadPack XC Local Development Environment"
echo ""

# Check if dependencies are installed
echo "📦 Checking dependencies..."

cd backend
if [ ! -d "node_modules/@supabase" ]; then
    echo "Installing backend dependencies..."
    npm install @supabase/supabase-js
fi

cd ../web
if [ ! -d "node_modules/@supabase" ]; then
    echo "Installing frontend dependencies..."
    npm install @supabase/supabase-js
fi

cd ..

echo ""
echo "✅ Dependencies ready!"
echo ""
echo "🔧 Starting Backend (port 3001)..."
cd backend
npm start > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "   Backend PID: $BACKEND_PID"

sleep 3

echo ""
echo "🎨 Starting Frontend (port 5173)..."
cd ../web
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   Frontend PID: $FRONTEND_PID"

sleep 5

echo ""
echo "✅ Servers started!"
echo ""
echo "📍 URLs:"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:3001"
echo ""
echo "📋 Test the complete flow:"
echo "   1. Open http://localhost:5173"
echo "   2. Register a new account"
echo "   3. Create a team"
echo "   4. Import season data"
echo "   5. View analytics"
echo ""
echo "📝 Logs:"
echo "   Backend:  tail -f /tmp/backend.log"
echo "   Frontend: tail -f /tmp/frontend.log"
echo ""
echo "🛑 To stop servers:"
echo "   pkill -f 'node.*server.js'"
echo "   pkill -f 'vite'"
echo ""
