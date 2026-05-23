#!/usr/bin/env bash

# Buddy Live Workspace Setup Script
# Safely configures local environments and distributes environment variables.

set -euo pipefail

# ANSI color codes for rich logging
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BLUE}${BOLD}=====================================================${NC}"
echo -e "${BLUE}${BOLD}          Buddy Live Environment Configurator        ${NC}"
echo -e "${BLUE}${BOLD}=====================================================${NC}"
echo ""

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_ENV="$ROOT_DIR/.env"
ROOT_ENV_EXAMPLE="$ROOT_DIR/.env.example"

FRONTEND_ENV="$ROOT_DIR/apps/buddy-live/.env.local"
FRONTEND_ENV_EXAMPLE="$ROOT_DIR/apps/buddy-live/.env.example"

BACKEND_ENV="$ROOT_DIR/services/buddy-live-adk/.env"
BACKEND_ENV_EXAMPLE="$ROOT_DIR/services/buddy-live-adk/.env.example"

# 1. Create root .env from .env.example if missing
if [ ! -f "$ROOT_ENV" ]; then
    echo -e "${YELLOW}No central .env file found in root.${NC}"
    echo -e "Creating ${BOLD}.env${NC} from .env.example..."
    cp "$ROOT_ENV_EXAMPLE" "$ROOT_ENV"
    echo -e "${GREEN}✓ Created central .env${NC}"
else
    echo -e "${GREEN}✓ Central .env file detected in root.${NC}"
fi

# Function to read variables from .env files safely
get_env_val() {
    local file="$1"
    local key="$2"
    if [ -f "$file" ]; then
        # Matches lines with key=val, strips optional quotes and carriage returns
        grep -E "^${key}=" "$file" | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" -e 's/\r$//' || true
    fi
}

# Function to set/replace variables in .env files safely
set_env_val() {
    local file="$1"
    local key="$2"
    local val="$3"
    
    # Ensure file exists
    touch "$file"
    
    if grep -q "^${key}=" "$file"; then
        # Key exists, replace it safely using argv and single quotes to prevent any bash expansion
        python3 -c '
import sys
file_path = sys.argv[1]
key = sys.argv[2]
val = sys.argv[3]
with open(file_path, "r") as f:
    content = f.read()
lines = content.split("\n")
for i, line in enumerate(lines):
    if line.startswith(key + "="):
        lines[i] = key + "=" + val
with open(file_path, "w") as f:
    f.write("\n".join(lines))
' "$file" "$key" "$val"
    else
        # Key doesn't exist, append it
        echo "$key=$val" >> "$file"
    fi
}

echo ""
echo -e "${BOLD}Let's gather your primary API Keys to bootstrap the workspaces.${NC}"
echo -e "Leave blank to keep existing values or configure manually later."
echo ""

# Read current values if they exist
CURRENT_GOOGLE_KEY=$(get_env_val "$ROOT_ENV" "GOOGLE_API_KEY")
if [ -z "$CURRENT_GOOGLE_KEY" ]; then
    CURRENT_GOOGLE_KEY=$(get_env_val "$ROOT_ENV" "GEMINI_API_KEY")
fi
CURRENT_AGENT_ID=$(get_env_val "$ROOT_ENV" "NEXT_PUBLIC_ELEVENLABS_AGENT_ID")

# Prompt user for Gemini API Key
read -rp "1. Enter Gemini/Google API Key [${CURRENT_GOOGLE_KEY:-(not set)}]: " USER_GEMINI_KEY
GEMINI_KEY="${USER_GEMINI_KEY:-$CURRENT_GOOGLE_KEY}"

# Prompt user for ElevenLabs Agent ID
read -rp "2. Enter ElevenLabs Agent ID [${CURRENT_AGENT_ID:-(not set)}]: " USER_AGENT_ID
AGENT_ID="${USER_AGENT_ID:-$CURRENT_AGENT_ID}"

# Update root .env
if [ -n "$GEMINI_KEY" ]; then
    set_env_val "$ROOT_ENV" "GOOGLE_API_KEY" "$GEMINI_KEY"
    set_env_val "$ROOT_ENV" "GEMINI_API_KEY" "$GEMINI_KEY"
fi

if [ -n "$AGENT_ID" ]; then
    set_env_val "$ROOT_ENV" "NEXT_PUBLIC_ELEVENLABS_AGENT_ID" "$AGENT_ID"
fi

echo -e "\n${BLUE}Distributing configurations to workspaces...${NC}"

# Ensure sub-project .env files exist from their templates if missing
if [ ! -f "$FRONTEND_ENV" ]; then
    cp "$FRONTEND_ENV_EXAMPLE" "$FRONTEND_ENV"
    echo -e "Created frontend config at apps/buddy-live/.env.local"
fi

if [ ! -f "$BACKEND_ENV" ]; then
    cp "$BACKEND_ENV_EXAMPLE" "$BACKEND_ENV"
    echo -e "Created backend config at services/buddy-live-adk/.env"
fi

# Propagate central values to workspaces
# Read everything from root .env and map to respective sub-environments
while IFS= read -r line || [ -n "$line" ]; do
    # Skip comments and empty lines
    if [[ "$line" =~ ^[[:space:]]*# ]] || [[ "$line" =~ ^[[:space:]]*$ ]]; then
        continue
    fi
    
    key=$(echo "$line" | cut -d'=' -f1)
    val=$(echo "$line" | cut -d'=' -f2-)
    
    # Strip quotes/whitespace from key and val
    key=$(echo "$key" | xargs)
    val=$(echo "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    
    # 1. Propagate Frontend configurations
    # Anything in apps/buddy-live/.env.example that matches should be set
    if grep -q "^${key}=" "$FRONTEND_ENV_EXAMPLE"; then
        set_env_val "$FRONTEND_ENV" "$key" "$val"
    fi
    # Extra map for dual-naming of keys (e.g. GOOGLE_API_KEY -> GEMINI_API_KEY in frontend)
    if [ "$key" = "GOOGLE_API_KEY" ]; then
        set_env_val "$FRONTEND_ENV" "GEMINI_API_KEY" "$val"
    fi
    
    # 2. Propagate Backend configurations
    # Anything in services/buddy-live-adk/.env.example that matches should be set
    if grep -q "^${key}=" "$BACKEND_ENV_EXAMPLE"; then
        set_env_val "$BACKEND_ENV" "$key" "$val"
    fi
    # Extra map for dual-naming of keys
    if [ "$key" = "GEMINI_API_KEY" ]; then
        set_env_val "$BACKEND_ENV" "GOOGLE_API_KEY" "$val"
    fi

done < "$ROOT_ENV"

echo -e "${GREEN}✓ Done. Local config files synchronized!${NC}\n"

# Verify missing critical values to alert the user
MISSING=()
if [ -z "$(get_env_val "$BACKEND_ENV" "GOOGLE_API_KEY")" ]; then
    MISSING+=("GOOGLE_API_KEY (Backend /services/buddy-live-adk/.env)")
fi
if [ -z "$(get_env_val "$FRONTEND_ENV" "GEMINI_API_KEY")" ]; then
    MISSING+=("GEMINI_API_KEY (Frontend /apps/buddy-live/.env.local)")
fi
if [ -z "$(get_env_val "$FRONTEND_ENV" "NEXT_PUBLIC_ELEVENLABS_AGENT_ID")" ]; then
    MISSING+=("NEXT_PUBLIC_ELEVENLABS_AGENT_ID (Frontend /apps/buddy-live/.env.local)")
fi
if [ -z "$(get_env_val "$FRONTEND_ENV" "NEXT_PUBLIC_FIREBASE_API_KEY")" ]; then
    MISSING+=("NEXT_PUBLIC_FIREBASE_API_KEY (Frontend /apps/buddy-live/.env.local)")
fi

if [ ${#MISSING[@]} -ne 0 ]; then
    echo -e "${YELLOW}${BOLD}⚠️  Onboarding Checklist - Missing Parameters:${NC}"
    for item in "${MISSING[@]}"; do
        echo -e "  - $item"
    done
    echo ""
    echo -e "You can open either local files or the central root ${BOLD}.env${NC} file,"
    echo -e "fill in the missing credentials, and re-run this script to distribute them."
else
    echo -e "${GREEN}${BOLD}🎉 System ready! All critical local settings are configured.${NC}"
    echo -e "To start the application run:"
    echo -e "  ${BOLD}make install${NC}"
    echo -e "  ${BOLD}make dev${NC}"
fi
echo ""
