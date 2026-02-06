# Quick Start Guide

## Prerequisites

- Node.js >= 20.0.0
- pnpm (or npm)

## Installation

```bash
# Install pnpm if you don't have it
npm install -g pnpm

# Install dependencies
pnpm install
```

## Configuration

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your GitLab credentials
# Required fields:
# - PIPELINE_TRIGGER_TOKEN
# - PIPELINE_PROJECT_ID
```

## Running

### Development Mode (with hot reload)

```bash
pnpm dev
```

The server will start on `http://localhost:8080`

### Production Mode

```bash
# Build the application
pnpm build

# Start the server
pnpm start
```

### Docker

```bash
# Build image
docker build -t gitlab-copilot-agent .

# Run container
docker run -p 8080:8080 --env-file .env gitlab-copilot-agent
```

## Testing the Server

### Health Check

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Test Webhook (with sample payload)

```bash
curl -X POST http://localhost:8080/gitlab-events \
  -H "Content-Type: application/json" \
  -H "X-Gitlab-Event: Issue Hook" \
  -d '{
    "object_kind": "issue",
    "object_attributes": {
      "id": 1,
      "iid": 10,
      "project_id": 100,
      "title": "Test Issue",
      "description": "Test description",
      "state": "opened",
      "action": "open",
      "url": "https://gitlab.com/project/issues/10",
      "author_id": 5,
      "updated_at": "2024-01-01T00:00:00Z"
    },
    "project": {
      "id": 100,
      "http_url": "https://gitlab.com/group/test-project"
    },
    "user": {
      "id": 5,
      "username": "test-user"
    },
    "changes": {
      "assignees": {
        "current": [
          {
            "id": 10,
            "username": "copilot-gitlab-agent"
          }
        ]
      }
    }
  }'
```

## Verification

After starting the server, check:

1. **Logs**: Look in `logs/` directory for application logs
2. **Webhooks**: Persisted payloads are saved in `hooks/` directory
3. **Console**: Development mode shows pretty-printed logs in the console

## Common Commands

```bash
# Type checking
pnpm typecheck

# Build
pnpm build

# Format code
pnpm format

# Run tests (if configured)
pnpm test
```

## Troubleshooting

### Port Already in Use

Change the port in `.env`:
```env
LISTEN_PORT=3000
```

### Missing Environment Variables

The server will fail to start if required variables are missing. Check the error message for which variables need to be set.

### GitLab API Errors

Verify your `PIPELINE_TRIGGER_TOKEN` and `PIPELINE_PROJECT_ID` are correct in `.env`.

## Next Steps

1. **Configure GitLab Webhook**: See README.md for webhook setup instructions
2. **Deploy**: Use Docker or deploy the built application to your server
3. **Monitor**: Check logs for webhook events and pipeline triggers

## Support

- See `README.md` for full documentation
- See `MIGRATION.md` for migration details from Flask
- See `CONTRIBUTING.md` for development guidelines
