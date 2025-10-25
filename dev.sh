#!/bin/bash

# Payroll Backend - Development Management Script
# This script manages the development environment (start/stop)

set -e  # Exit on any error

# Function to display usage
usage() {
    echo "Usage: $0 {start|stop|restart|test}"
    echo ""
    echo "Commands:"
    echo "  start    - Clean, build, and start the development environment"
    echo "  stop     - Stop all services and clean up"
    echo "  restart  - Stop and then start the development environment"
    echo "  test     - Run unit tests"
    exit 1
}

# Function to kill server processes (shared by start and stop)
kill_server_processes() {
    echo "🛑 Stopping server processes..."

    # Kill processes using port 3002 (serverless offline lambda server)
    PORT_3002_PIDS=$(lsof -ti:3002 2>/dev/null || true)
    if [ -n "$PORT_3002_PIDS" ]; then
        echo "Found process(es) using port 3002: $PORT_3002_PIDS"
        kill $PORT_3002_PIDS 2>/dev/null || true
        sleep 2
        # Force kill if still running
        kill -9 $PORT_3002_PIDS 2>/dev/null || true
        echo "✅ Processes on port 3002 stopped"
    else
        echo "ℹ️  No processes using port 3002"
    fi

    # Kill processes using port 3000 (main API server)
    PORT_3000_PIDS=$(lsof -ti:3000 2>/dev/null || true)
    if [ -n "$PORT_3000_PIDS" ]; then
        echo "Found process(es) using port 3000: $PORT_3000_PIDS"
        kill $PORT_3000_PIDS 2>/dev/null || true
        sleep 2
        # Force kill if still running
        kill -9 $PORT_3000_PIDS 2>/dev/null || true
        echo "✅ Processes on port 3000 stopped"
    else
        echo "ℹ️  No processes using port 3000"
    fi

    # Find and kill serverless offline processes
    SERVERLESS_PIDS=$(pgrep -f "serverless offline" 2>/dev/null || true)
    if [ -n "$SERVERLESS_PIDS" ]; then
        echo "Found serverless processes: $SERVERLESS_PIDS"
        kill $SERVERLESS_PIDS 2>/dev/null || true
        sleep 2
        # Force kill if still running
        kill -9 $SERVERLESS_PIDS 2>/dev/null || true
        echo "✅ Serverless processes stopped"
    fi

    # Find and kill node processes related to this project
    NODE_PIDS=$(pgrep -f "node.*payroll-backend" 2>/dev/null || true)
    if [ -n "$NODE_PIDS" ]; then
        echo "Found node processes: $NODE_PIDS"
        kill $NODE_PIDS 2>/dev/null || true
        sleep 2
        # Force kill if still running
        kill -9 $NODE_PIDS 2>/dev/null || true
        echo "✅ Node processes stopped"
    fi

    echo "✅ All server processes cleaned up"
    echo ""
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
    kill_server_processes

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
    kill_server_processes

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

# Function to run unit tests
run_tests() {
    echo "======================================"
    echo "Payroll Backend - Running Unit Tests"
    echo "======================================"
    echo ""

    # Change to the payroll-backend directory
    cd "$(dirname "$0")"

    # Step 1: Check and start Docker services (tests need postgres and redis)
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

    # Run Flyway migrations (ensure test database is up to date)
    echo "🔄 Running database migrations..."
    docker-compose -f docker-compose.yml up flyway
    echo "✅ Migrations complete"
    echo ""

    # Step 2: Run tests
    echo "🧪 Running unit tests..."
    echo "======================================"
    npm test
    TEST_EXIT_CODE=$?
    echo ""
    echo "======================================"
    
    if [ $TEST_EXIT_CODE -eq 0 ]; then
        echo "✅ All tests passed!"
    else
        echo "❌ Some tests failed!"
    fi
    echo "======================================"
    
    exit $TEST_EXIT_CODE
}

# Main script logic
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
    test)
        run_tests
        ;;
    *)
        usage
        ;;
esac
