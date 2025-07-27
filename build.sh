#!/bin/bash

# Cross-platform build script for DWM Control
# This script helps build the application for all platforms with proper signing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "This script is designed to run on macOS for cross-platform building"
    exit 1
fi

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
print_status "Checking prerequisites..."

if ! command_exists node; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

if ! command_exists npm; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

# Check if electron-builder is installed
if ! npm list electron-builder >/dev/null 2>&1; then
    print_warning "electron-builder not found in dependencies. Installing..."
    npm install --save-dev electron-builder
fi

print_success "Prerequisites check passed"

# Function to build for a specific platform
build_platform() {
    local platform=$1
    
    print_status "Building for $platform..."
    
    # Set environment variables to avoid Python/node-gyp issues
    export ELECTRON_REBUILD_FORCE=true
    export npm_config_build_from_source=false
    
    if npm run "build:$platform"; then
        print_success "Build for $platform completed successfully"
        
        # List the generated files
        if [ -d "dist" ]; then
            print_status "Generated files for $platform:"
            case $platform in
                "mac")
                    find dist -name "*.dmg" -o -name "*-mac.zip" 2>/dev/null | head -10
                    ;;
                "win")
                    find dist -name "*.exe" -o -name "*.msi" 2>/dev/null | head -10
                    ;;
                "linux")
                    find dist -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" 2>/dev/null | head -10
                    ;;
            esac
        fi
    else
        print_error "Build for $platform failed"
        return 1
    fi
}

# Main build function
main() {
    print_status "Starting DWM Control build process..."
    
    cd "$(dirname "$0")"
    
    # Clean previous builds
    if [ -d "dist" ]; then
        print_status "Cleaning previous builds..."
        rm -rf dist
    fi
    
    # Install dependencies
    print_status "Installing/updating dependencies..."
    npm install
    
    # Parse command line arguments
    if [ $# -eq 0 ]; then
        print_status "No platform specified. Building for current platform (macOS)..."
        build_platform "mac"
    else
        case $1 in
            "mac"|"macos"|"darwin")
                build_platform "mac"
                ;;
            "win"|"windows")
                build_platform "win"
                ;;
            "linux")
                build_platform "linux"
                ;;
            "all")
                print_status "Building for all platforms..."
                build_platform "mac" && build_platform "win" && build_platform "linux"
                ;;
            *)
                print_error "Unknown platform: $1"
                echo "Usage: $0 [mac|win|linux|all]"
                exit 1
                ;;
        esac
    fi
    
    print_success "Build process completed!"
    
    # Show final summary
    if [ -d "dist" ]; then
        print_status "Final build outputs:"
        ls -la dist/
    fi
}

# Trap to clean up on exit
trap 'print_status "Build script interrupted"' INT TERM

# Run main function
main "$@"
