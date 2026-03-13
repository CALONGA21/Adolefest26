# Deploy em EC2 Ubuntu

## 1. Instalar Docker e Docker Compose

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 2. Clonar o projeto

```bash
git clone <URL_DO_SEU_REPOSITORIO>.git
cd Adolefest26
```

## 3. Ajustar as variaveis do compose

Edite o arquivo `docker-compose.prod.yml` e substitua os valores abaixo antes de subir:

- `change-this-db-password`
- `change-this-mercado-pago-access-token`
- `change-this-webhook-secret`
- `change-this-mercado-pago-public-key`
- `change-this-checkin-password`
- `http://YOUR_EC2_PUBLIC_IP`

## 4. Subir os containers em background

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## 5. Verificar o status

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
```

## Portas no Security Group da AWS

Abra estas portas de entrada:

- `22/TCP` para SSH, idealmente restrita ao seu IP.
- `80/TCP` para acesso HTTP ao frontend.

Se voce for usar HTTPS com um proxy reverso externo ou certificado depois, abra tambem:

- `443/TCP` para HTTPS.

Nao exponha `5432` publicamente. O PostgreSQL fica acessivel apenas na rede interna do Docker.