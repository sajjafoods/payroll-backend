#!/bin/bash

# Payroll Backend - Development Management Script
# This script manages the development environment (start/stop)

set -e  # Exit on any error

# Function to display usage
usage() {
    echo "Usage: $0 {start|stop|restart}"
    echo ""
    echo "Commands:"
    echo "  start    - Clean, build, and start the development environment"
    echo "  stop     - Stop all services and clean up"
    echo "  restart  - Stop and then start the development environment"
    exit 1
}

# Function to start the environment
start_environment() {
    echo "======================================"
    echo "Payroll Backend - Clean Build & Start"
    echo "======================================"
    echo ""

    # Change to the payroll-backend directory
    cd "$(dirname "$0")"

    # Step 0: Kill any existing processes for fresh start
    echo "🛑 Checking for existing processes..."

    # Find and kill serverless offline processes
    SERVERLESS_PIDS=$(pgrep -f "serverless offline" || true)
    if [ -n "$SERVERLESS_PIDS" ]; then
        echo "Found existing serverless processes: $SERVERLESS_PIDS"
        kill $SERVERLESS_PIDS 2>/dev/null || true
        sleep 2
        # Force kill if still running
        kill -9 $SERVERLESS_PIDS 2>/dev/null || true
        echo "✅ Existing serverless processes stopped"
    else
        echo "ℹ️  No existing serverless processes found"
    fi

    # Find and kill node processes related to this project
    NODE_PIDS=$(pgrep -f "node.*payroll-backend" || true)
    if [ -n "$NODE_PIDS" ]; then
        echo "Found existing node processes: $NODE_PIDS"
        kill $NODE_PIDS 2>/dev/null || true
        sleep 2
        # Force kill if still running
        kill -9 $NODE_PIDS 2>/dev/null || true
        echo "✅ Existing node processes stopped"
    else
        echo "ℹ️  No existing node processes found"
    fi

    echo ""

    # Step 1: Check and start Docker services
    echo "🐳 Checking Docker..."
    if ! docker info >/dev/null 2>&1; then
        echo "❌ Docker is not running. Please start Docker Desktop and try again."
        exit 1
    fi
    echo "✅ Docker is running"
    echo ""

    echo "🐳 Starting Docker Compose services..."
    docker-compose -f docker-compose.yml up -d postgres redis
    echo "⏳ Waiting for services to be ready..."
    sleep 5

    # Wait for PostgreSQL to be ready
    echo "⏳ Waiting for PostgreSQL..."
    until docker exec payroll-postgres pg_isready -U dev_user >/dev/null 2>&1; do
        echo "   PostgreSQL is unavailable - sleeping"
        sleep 2
    done
    echo "✅ PostgreSQL is ready"

    # Wait for Redis to be ready
    echo "⏳ Waiting for Redis..."
    until docker exec payroll-redis redis-cli ping >/dev/null 2>&1; do
        echo "   Redis is unavailable - sleeping"
        sleep 2
    done
    echo "✅ Redis is ready"

    # Run Flyway migrations
    echo "🔄 Running database migrations..."
    docker-compose -f docker-compose.yml up flyway
    echo "✅ Migrations complete"
    echo ""

    # Step 2: Clean build artifacts
    echo "🧹 Cleaning build artifacts..."
    rm -rf dist
    rm -rf build
    rm -rf .build
    rm -rf .serverless
    echo "✅ Clean complete"
    echo ""

    # Step 3: Install dependencies
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
    echo ""

    # Step 4: Build
    echo "🔨 Building TypeScript..."
    npm run build
    echo "✅ Build complete"
    echo ""

    # Step 5: Start server
    echo "🚀 Starting development server..."
    echo "======================================"
    npm run dev
}

# Function to stop the environment
stop_environment() {
    echo "======================================"
    echo "Payroll Backend - Stop & Clean"
    echo "======================================"
    echo ""

    # Change to the payroll-backend directory
    cd "$(dirname "$0")"

    # Step 1: Stop running server processes
    echo "🛑 Stopping server processes..."

    # Find and kill serverless offline processes
    SERVERLESS_PIDS=$(pgrep -f "serverless offline" || true)
    if [ -n "$SERVERLESS_PIDS" ]; then
        echo "Found serverless processes: $SERVERLESS_PIDS"
        kill $SERVERLESS_PIDS 2>/dev/null || true
        sleep 2
        # Force kill if still running
        kill -9 $SERVERLESS_PIDS 2>/dev/null || true
        echo "✅ Serverless processes stopped"
    else
        echo "ℹ️  No serverless processes found"
    fi

    # Find and kill node processes related to this project
    NODE_PIDS=$(pgrep -f "node.*payroll-backend" || true)
    if [ -n "$NODE_PIDS" ]; then
        echo "Found node processes: $NODE_PIDS"
        kill $NODE_PIDS 2>/dev/null || true
        sleep 2
        # Force kill if still running
        kill -9 $NODE_PIDS 2>/dev/null || true
        echo "✅ Node processes stopped"
    else
        echo "ℹ️  No node processes found"
    fi

    echo ""

    # Step 2: Stop Docker services
    echo "🐳 Stopping Docker Compose services..."
    docker-compose -f docker-compose.yml down
    echo "✅ Docker services stopped"
    echo ""

    # Step 3: Clean build artifacts
    echo "🧹 Cleaning build artifacts..."
    rm -rf dist
    rm -rf build
    rm -rf .build
    rm -rf .serverless
    echo "✅ Build artifacts cleaned"
    echo ""

    # Step 4: Optional - clean node_modules (commented out by default)
    # Uncomment the following lines to also remove node_modules
    # echo "🧹 Cleaning node_modules..."
    # rm -rf node_modules
    # echo "✅ node_modules cleaned"
    # echo ""

    echo "======================================"
    echo "✅ Server stopped and cleaned up!"
    echo "======================================"
}

# Main script logic
case "$1" in
    start)
        start_environment
        ;;
    stop)
        stop_environment
        ;;
    restart)
        stop_environment
        echo ""
        echo "⏳ Waiting 3 seconds before restart..."
        sleep 3
        echo ""
        start_environment
        ;;
    *)
        usage
        ;;
esac
