.PHONY: help copilot-usage-install copilot-usage-uninstall docker-deploy docker-stop docker-logs clean install compile package

# Extension metadata
EXTENSION_ID := Huggiv.copilot-usage
EXTENSION_NAME := copilot-usage
PUBLISHER := Huggiv

# Get version from package.json
VERSION := $(shell node -p "require('./package.json').version")
VSIX_FILE := $(EXTENSION_NAME)-$(VERSION).vsix

help:
	@echo "Copilot Usage Extension - Make Targets"
	@echo "========================================"
	@echo ""
	@echo "Extension:"
	@echo "  make copilot-usage-install       Install npm packages, compile, package, and install extension in local VS Code"
	@echo "  make copilot-usage-uninstall     Uninstall copilot-usage extension from local VS Code"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-deploy               Build and deploy backend and frontend services locally"
	@echo "  make docker-stop                 Stop running Docker containers"
	@echo "  make docker-logs                 Show Docker Compose logs"
	@echo ""

copilot-usage-install: clean compile package
	@echo ""
	@echo "Installing $(VSIX_FILE) to VS Code..."
	@if command -v code >/dev/null 2>&1; then \
		code --install-extension $(VSIX_FILE); \
		echo "✓ Extension installed successfully!"; \
		echo "  Open VS Code and reload to activate the extension."; \
	else \
		echo "✗ Error: 'code' command not found in PATH."; \
		echo "  Make sure VS Code is installed and 'code' command is available."; \
		echo "  Alternatively, install manually via VS Code UI:"; \
		echo "    1. Open Extensions (Ctrl+Shift+X)"; \
		echo "    2. Click ... menu > Install from VSIX"; \
		echo "    3. Select $(VSIX_FILE)"; \
		exit 1; \
	fi

copilot-usage-uninstall:
	@echo "Uninstalling $(EXTENSION_ID) from VS Code..."
	@if command -v code >/dev/null 2>&1; then \
		code --uninstall-extension $(EXTENSION_ID); \
		echo "✓ Extension uninstalled successfully!"; \
	else \
		echo "✗ Error: 'code' command not found in PATH."; \
		echo "  Uninstall manually via VS Code UI:"; \
		echo "    1. Open Extensions (Ctrl+Shift+X)"; \
		echo "    2. Find 'Copilot Usage' and click uninstall"; \
		exit 1; \
	fi

docker-deploy:
	@echo "Starting Docker Compose services (backend + frontend)..."
	@cd server && docker compose up -d
	@echo ""
	@echo "✓ Services started successfully!"
	@echo ""
	@echo "Access points:"
	@echo "  Backend API:     http://localhost:8000"
	@echo "  Frontend UI:     http://localhost:5173"
	@echo ""
	@echo "View logs: make docker-logs"
	@echo "Stop services: make docker-stop"

docker-stop:
	@echo "Stopping Docker Compose services..."
	@cd server && docker compose down
	@echo "✓ Services stopped."

docker-logs:
	@cd server && docker compose logs -f

# Internal targets

compile: install
	@echo "Compiling TypeScript..."
	@npm run compile

package: compile
	@echo "Packaging extension as VSIX..."
	@npm run package
	@echo "✓ Packaged: $(VSIX_FILE)"

install:
	@echo "Installing dependencies..."
	@npm ci

clean:
	@echo "Cleaning build artifacts..."
	@rm -rf out/
	@rm -f $(EXTENSION_NAME)-*.vsix
	@echo "✓ Cleaned."

.DEFAULT_GOAL := help
