#!/usr/bin/env bash
set -e

# Helper function to ask Y/N questions
ask_yes_no() {
  local prompt="$1"
  local default="$2" # y or n
  local reply
  if [ "$default" = "y" ]; then
    prompt="$prompt [Y/n]: "
  else
    prompt="$prompt [y/N]: "
  fi
  read -p "$prompt" -r reply
  # Use default if reply is empty
  if [ -z "$reply" ]; then
    reply="$default"
  fi
  if [[ "$reply" =~ ^[Yy]$ ]]; then
    return 0
  fi
  return 1
}

# Read current version from app-version.json
MAJOR=$(grep -o '"major": [0-9]*' app-version.json | awk '{print $2}')
MINOR=$(grep -o '"minor": [0-9]*' app-version.json | awk '{print $2}')
PATCH=$(grep -o '"patch": [0-9]*' app-version.json | awk '{print $2}')

CURRENT_VERSION="${MAJOR}.${MINOR}.${PATCH}"
NEXT_PATCH=$((PATCH + 1))
NEW_VERSION="${MAJOR}.${MINOR}.${NEXT_PATCH}"

echo "=================================================="
echo "          Notely Release Orchestrator             "
echo "=================================================="
echo "Current version: ${CURRENT_VERSION}"
echo "Proposed version: ${NEW_VERSION}"
echo ""

# --- 1. Gather all choices upfront ---
echo "--- Configure Steps ---"

RUN_CI=false
if ask_yes_no "1. Run CI checks (Lint, Build, Test)?" "y"; then
  RUN_CI=true
fi

RUN_DOCS=false
if ask_yes_no "2. Verify documentation builds successfully?" "y"; then
  RUN_DOCS=true
fi

RUN_PACKAGING=false
if ask_yes_no "3. Run local packaging to verify EXE builds successfully?" "y"; then
  RUN_PACKAGING=true
fi

RUN_P2P=false
if ask_yes_no "4. Run packaged P2P tests?" "y"; then
  RUN_P2P=true
fi

BUMP_VERSION=false
COMMIT_CHANGES=false
TAG_RELEASE=false
PUSH_ORIGIN=false

if ask_yes_no "5. Bump version to v${NEW_VERSION} in configuration files?" "y"; then
  BUMP_VERSION=true
  if ask_yes_no "6. Create a git commit for this release?" "y"; then
    COMMIT_CHANGES=true
  fi

  if ask_yes_no "7. Tag this commit as v${NEW_VERSION}?" "y"; then
    TAG_RELEASE=true
  fi

  if ask_yes_no "8. Push commit and tag to origin?" "y"; then
    PUSH_ORIGIN=true
  fi
fi

echo ""
echo "--- Summary of Plan ---"
[ "$RUN_CI" = "true" ] && echo "  - Run CI checks" || echo "  - SKIP CI checks"
[ "$RUN_DOCS" = "true" ] && echo "  - Verify documentation build" || echo "  - SKIP documentation build"
[ "$RUN_PACKAGING" = "true" ] && echo "  - Run local packaging check" || echo "  - SKIP local packaging check"
[ "$RUN_P2P" = "true" ] && echo "  - Run packaged P2P tests" || echo "  - SKIP packaged P2P tests"
[ "$BUMP_VERSION" = "true" ] && echo "  - Bump version to v${NEW_VERSION}" || echo "  - KEEP current version v${CURRENT_VERSION}"
[ "$COMMIT_CHANGES" = "true" ] && echo "  - Create git commit" || echo "  - SKIP git commit"
[ "$TAG_RELEASE" = "true" ] && echo "  - Create git tag v${NEW_VERSION}" || echo "  - SKIP git tag"
[ "$PUSH_ORIGIN" = "true" ] && echo "  - Push to origin" || echo "  - SKIP push to origin"
echo ""

if ! ask_yes_no "Ready to execute the plan?" "y"; then
  echo "Release aborted."
  exit 0
fi

echo ""
echo "--- Executing Plan ---"

# --- 2. Execution phase ---

# 1. CI Checks
if [ "$RUN_CI" = "true" ]; then
  echo ">>> Running CI checks..."
  if ! npm run ci:check; then
    echo "CI checks failed."
    if ! ask_yes_no "Do you want to ignore CI checks failure and continue?" "n"; then
      echo "Aborting release."
      exit 1
    fi
  fi
fi

# 2. Documentation Build Check
if [ "$RUN_DOCS" = "true" ]; then
  echo ">>> Verifying documentation build..."
  if ! npm run docs:build; then
    echo "Documentation build failed."
    if ! ask_yes_no "Do you want to ignore documentation build failure and continue?" "n"; then
      echo "Aborting release."
      exit 1
    fi
  fi
fi

# 3. Local Build Check
if [ "$RUN_PACKAGING" = "true" ]; then
  echo ">>> Running local packaging..."
  if ! ./build-windows-exe.sh; then
    echo "Local packaging failed."
    if ! ask_yes_no "Do you want to ignore packaging failure and continue?" "n"; then
      echo "Aborting release."
      exit 1
    fi
  fi
fi

# 4. Packaged P2P Tests Check
if [ "$RUN_P2P" = "true" ]; then
  echo ">>> Running packaged P2P tests..."
  if ! npm run test:p2p:packaged; then
    echo "Packaged P2P tests failed."
    if ! ask_yes_no "Do you want to ignore P2P test failure and continue?" "n"; then
      echo "Aborting release."
      exit 1
    fi
  fi
fi

# 5. Version Bumping
BUMPED=false
if [ "$BUMP_VERSION" = "true" ]; then
  echo ">>> Bumping version to v${NEW_VERSION}..."
  # Update app-version.json
  sed -i -E "s/\"patch\": [0-9]+/\"patch\": ${NEXT_PATCH}/" app-version.json
  echo "Updated app-version.json"

  # Update package.json
  sed -i -E "s/\"version\": \"[0-9]+\.[0-9]+\.[0-9]+\"/\"version\": \"${NEW_VERSION}\"/" package.json
  echo "Updated package.json"

  # Update README.md version badge
  sed -i -E "s/version-v[0-9]+\.[0-9]+\.[0-9]+/version-v${NEW_VERSION}/" README.md
  echo "Updated README.md"
  BUMPED=true
else
  NEW_VERSION="${CURRENT_VERSION}"
fi

# 6. Git Commit
COMMITTED=false
if [ "$COMMIT_CHANGES" = "true" ]; then
  echo ">>> Committing changes..."
  git add .
  if [ "$BUMPED" = "true" ]; then
    git commit -m "Release v${NEW_VERSION}"
  else
    git commit -m "Release prep v${NEW_VERSION}"
  fi
  echo "Committed changes."
  COMMITTED=true
fi

# 7. Git Tag
TAGGED=false
TAG_NAME="v${NEW_VERSION}"
if [ "$TAG_RELEASE" = "true" ]; then
  echo ">>> Tagging commit..."
  git tag "${TAG_NAME}"
  echo "Created tag ${TAG_NAME}."
  TAGGED=true
fi

# 8. Git Push
if [ "$PUSH_ORIGIN" = "true" ]; then
  echo ">>> Pushing to origin..."
  if [ "$COMMITTED" = "true" ] || [ "$BUMPED" = "true" ]; then
    git push origin master
  fi
  if [ "$TAGGED" = "true" ]; then
    git push origin "${TAG_NAME}"
  fi
  echo "Pushed successfully."
fi

echo ""
echo "Release workflow completed successfully!"
