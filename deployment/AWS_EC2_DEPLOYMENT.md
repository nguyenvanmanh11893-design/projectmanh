# 🚀 AWS EC2 Deployment Guide

Guide for deploying **Cloud File Manager Backend** to an AWS EC2 instance.

---

## 1. Architecture Overview

```text
                  AWS EC2
        ┌─────────────────────────┐
        │       Nginx (Reverse)   │
        │             │           │
        │             ▼           │
        │      Node.js App        │
        │       (PM2 Daemon)      │
        └────────────┬────────────┘
                     │
           ┌─────────┴─────────┐
           │                   │
           ▼                   ▼
      Local MySQL         Amazon S3
        (XAMPP)       (Cloud Storage)
```

---

## 2. Server Prerequisites (Ubuntu Server 22.04 LTS)

Execute on EC2 Instance:

```bash
# 1. Update Packages
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js v20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx mysql-server

# 3. Install PM2 globally
sudo npm install -g pm2
```

---

## 3. Deployment Steps

### Step 1: Clone Repository & Install Dependencies
```bash
cd /var/www
sudo git clone <YOUR_GIT_REPOSITORY_URL> cloud-file-manager
cd cloud-file-manager
npm install --production
```

### Step 2: Configure Environment Variables (`.env`)
Create `.env` file:
```bash
nano .env
```

Set production configuration:
```env
NODE_ENV=production
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_NAME=cloud_file_manager
DB_USER=root
DB_PASSWORD=your_secure_mysql_password

JWT_SECRET=your_production_secure_jwt_secret_key_2026
JWT_EXPIRES_IN=7d

AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_S3_BUCKET=your-production-s3-bucket-name
```

### Step 3: Initialize Database Schema
Run SQL script:
```bash
sudo mysql -u root -p < database/cloud_file_manager.sql
```

### Step 4: Start Process with PM2
```bash
pm2 start src/server.js --name "cloud-file-manager"
pm2 save
pm2 startup
```

### Step 5: Configure Nginx Reverse Proxy
Edit Nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/cloud-file-manager
```

Paste configuration:
```nginx
server {
    listen 80;
    server_name your-domain-or-ec2-ip.amazonaws.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable site & restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/cloud-file-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 4. Security Verification Checklist

- [x] CORS enabled for domain origin
- [x] Helmet security headers active
- [x] S3 Credentials stored only in `.env`
- [x] `.env` present in `.gitignore`
- [x] MySQL port 3306 blocked from public inbound internet (bound to 127.0.0.1)
- [x] EC2 Security Group opens inbound HTTP (80) & HTTPS (443)
