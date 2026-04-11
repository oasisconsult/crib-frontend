#!/bin/bash

# WSL Development Setup Script for Next.js Frontend
# Optimizes the development environment for Windows WSL

set -e

echo "🐧 Setting up WSL-optimized development environment..."

# Check if running in WSL
if ! grep -q Microsoft /proc/version; then
    echo "⚠️  Warning: This script is designed for WSL environment"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Navigate to project root
cd "$(dirname "$0")/.."

# Set environment variables for WSL
export NODE_OPTIONS="--max-old-space-size=4096"
export NEXT_TELEMETRY_DISABLED=1
export CHOKIDAR_USEPOLLING=true

# Create .env.local if it doesn't exist
if [ ! -f .env.local ]; then
    echo "📝 Creating .env.local with WSL optimizations..."
    cat > .env.local << EOF
# WSL Optimizations
NEXT_TELEMETRY_DISABLED=1
CHOKIDAR_USEPOLLING=true
WATCHPACK_POLLING=true

# Performance
NODE_OPTIONS=--max-old-space-size=4096

# Development
NEXT_PUBLIC_WS_URL=ws://localhost:3000
FAST_REFRESH=true
EOF
    echo "✅ Created .env.local"
fi

# Install WSL-specific dependencies
echo "📦 Installing WSL-optimized dependencies..."
npm install --no-audit --no-fund

# Set up file watcher optimizations
echo "👀 Setting up file watcher optimizations..."
cat > .watchmanconfig << EOF
{
  "ignore_dirs": [
    ".git",
    "node_modules",
    ".next",
    "dist",
    "build"
  ]
}
EOF

# Create WSL development script
echo "🚀 Creating WSL development script..."
cat > dev-wsl.sh << 'EOF'
#!/bin/bash

# WSL Development Script
echo "🐧 Starting Next.js in WSL mode..."

# Set WSL-optimized environment
export NODE_OPTIONS="--max-old-space-size=4096"
export CHOKIDAR_USEPOLLING=true
export WATCHPACK_POLLING=true
export NEXT_TELEMETRY_DISABLED=1

# Start development server
npm run dev
EOF

chmod +x dev-wsl.sh

# Create Windows host access script
echo "🪟 Creating Windows host access script..."
cat > access-windows.sh << 'EOF'
#!/bin/bash

# Access Windows files from WSL
WINDOWS_HOME=$(cmd.exe /c "echo %USERPROFILE%" | tr -d '\r')
echo "🪟 Windows home: $WINDOWS_HOME"

# Create symlink if it doesn't exist
if [ ! -L ~/windows ]; then
    ln -sf "$WINDOWS_HOME" ~/windows
    echo "✅ Created symlink: ~/windows -> $WINDOWS_HOME"
fi

# Show common Windows paths
echo "📁 Common Windows paths:"
echo "  Desktop: $WINDOWS_HOME/Desktop"
echo "  Documents: $WINDOWS_HOME/Documents"
echo "  Downloads: $WINDOWS_HOME/Downloads"
EOF

chmod +x access-windows.sh

# Performance optimization for WSL
echo "⚡ Applying WSL performance optimizations..."

# Optimize npm cache for WSL
npm config set cache ~/.npm-cache
mkdir -p ~/.npm-cache

# Set up faster file watching
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf 2>/dev/null || true

# Clear any existing locks
rm -f .next/*.lock 2>/dev/null || true
rm -f node_modules/.cache/*.lock 2>/dev/null || true

echo "✅ WSL setup complete!"
echo ""
echo "🎯 Quick start commands:"
echo "  ./dev-wsl.sh          - Start development server with WSL optimizations"
echo "  ./access-windows.sh    - Access Windows files from WSL"
echo "  npm run analyze:bundle - Analyze bundle size"
echo "  npm run test          - Run tests"
echo ""
echo "🐧 WSL Tips:"
echo "  • Use ./dev-wsl.sh for better performance"
echo "  • File watching is optimized for WSL"
echo "  • Memory limits increased for Node.js"
echo "  • Windows files accessible via ~/windows"
echo ""
echo "🚀 Ready to develop in WSL!"
