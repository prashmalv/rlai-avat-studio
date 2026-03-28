# Azure Deployment — RLAI Avatar Studios

## Quick Local Test (Docker Compose)

```bash
cp .env.deploy .env        # fill in your API keys
docker compose up --build  # backend on :8001, frontend on :3002
```

---

## Azure Container Apps (Recommended for Production)

### Prerequisites
- Azure CLI: `brew install azure-cli` then `az login`
- Docker installed

### Step 1 — Create Azure resources

```bash
RESOURCE_GROUP=rlai-avatar
LOCATION=eastasia          # or eastus, westeurope, etc.
ACR_NAME=rlaiavatarregistry
ENV_NAME=rlai-avatar-env

az group create --name $RESOURCE_GROUP --location $LOCATION

az acr create \
  --resource-group $RESOURCE_GROUP \
  --name $ACR_NAME \
  --sku Basic \
  --admin-enabled true

az containerapp env create \
  --name $ENV_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

### Step 2 — Build & push images

```bash
az acr login --name $ACR_NAME

# Backend
docker build -f Dockerfile.backend \
  -t $ACR_NAME.azurecr.io/avataar-backend:latest .
docker push $ACR_NAME.azurecr.io/avataar-backend:latest

# Frontend (provide your backend URL at build time)
BACKEND_URL=https://avataar-backend.<unique>.eastasia.azurecontainerapps.io
docker build -f Dockerfile.frontend \
  --build-arg NEXT_PUBLIC_BACKEND_URL=$BACKEND_URL \
  -t $ACR_NAME.azurecr.io/avataar-frontend:latest .
docker push $ACR_NAME.azurecr.io/avataar-frontend:latest
```

### Step 3 — Create Azure File Share for persistent data

```bash
STORAGE_ACCOUNT=rlaiavatarstorage$RANDOM

az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --sku Standard_LRS

az storage share create \
  --name avataar-data \
  --account-name $STORAGE_ACCOUNT

# Link storage to container app environment
STORAGE_KEY=$(az storage account keys list \
  --account-name $STORAGE_ACCOUNT \
  --query '[0].value' -o tsv)

az containerapp env storage set \
  --name $ENV_NAME \
  --resource-group $RESOURCE_GROUP \
  --storage-name avataarfiles \
  --azure-file-account-name $STORAGE_ACCOUNT \
  --azure-file-account-key $STORAGE_KEY \
  --azure-file-share-name avataar-data \
  --access-mode ReadWrite
```

### Step 4 — Deploy backend

```bash
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query passwords[0].value -o tsv)

az containerapp create \
  --name avataar-backend \
  --resource-group $RESOURCE_GROUP \
  --environment $ENV_NAME \
  --image $ACR_NAME.azurecr.io/avataar-backend:latest \
  --registry-server $ACR_NAME.azurecr.io \
  --registry-username $ACR_NAME \
  --registry-password $ACR_PASSWORD \
  --target-port 8001 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 3 \
  --env-vars \
    LLM_PROVIDER=anthropic \
    ANTHROPIC_API_KEY=YOUR_ANTHROPIC_KEY \
    ANTHROPIC_MODEL=claude-sonnet-4-6 \
    HEYGEN_API_KEY=YOUR_HEYGEN_KEY \
    SECRET_KEY=YOUR_SECRET_KEY \
    DATABASE_URL="sqlite+aiosqlite:///./data/avataar_platform.db" \
    UPLOADS_DIR=./data/uploads
```

> Get the backend URL:
> ```bash
> BACKEND_URL=$(az containerapp show \
>   --name avataar-backend \
>   --resource-group $RESOURCE_GROUP \
>   --query properties.configuration.ingress.fqdn -o tsv)
> echo "https://$BACKEND_URL"
> ```

### Step 5 — Deploy frontend

```bash
az containerapp create \
  --name avataar-frontend \
  --resource-group $RESOURCE_GROUP \
  --environment $ENV_NAME \
  --image $ACR_NAME.azurecr.io/avataar-frontend:latest \
  --registry-server $ACR_NAME.azurecr.io \
  --registry-username $ACR_NAME \
  --registry-password $ACR_PASSWORD \
  --target-port 3002 \
  --ingress external \
  --min-replicas 1 \
  --env-vars NEXT_PUBLIC_BACKEND_URL=https://$BACKEND_URL
```

> **Note:** If the backend URL wasn't known at Docker build time, rebuild the frontend image with the correct `NEXT_PUBLIC_BACKEND_URL` arg and push again.

### Step 6 — Access the app

```bash
FRONTEND_URL=$(az containerapp show \
  --name avataar-frontend \
  --resource-group $RESOURCE_GROUP \
  --query properties.configuration.ingress.fqdn -o tsv)

echo "Admin Panel: https://$FRONTEND_URL/admin"
echo "Login: pm@rightleft.ai / admin@rlai"
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (if anthropic LLM) | Claude API key |
| `HEYGEN_API_KEY` | Yes | HeyGen streaming avatar key |
| `SECRET_KEY` | Yes | JWT signing secret (`openssl rand -hex 32`) |
| `LLM_PROVIDER` | Yes | `anthropic` or `ollama` |
| `DID_API_KEY` | No | D-ID avatar key |
| `ELEVENLABS_API_KEY` | No | ElevenLabs voice key |
| `SARVAM_API_KEY` | No | Sarvam AI voice key |

---

## CORS Note for Production

When the frontend is on `https://rlai-avatar-frontend.azurecontainerapps.io`, the backend CORS is already set to `allow_origins=["*"]` which works for all origins. For production hardening, update `main.py` to list only the frontend's URL.
