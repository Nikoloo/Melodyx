# Security Setup Guide for Melodyx

## Overview
This guide explains how to securely configure your Spotify Client ID for deployment on GitHub Pages.

## Step 1: Set up GitHub Secret

1. Go to your GitHub repository
2. Click on **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secret:
   - **Name**: `SPOTIFY_CLIENT_ID`
   - **Value**: Your Spotify Client ID (from https://developer.spotify.com/dashboard)

## Step 2: Enable GitHub Pages

1. Go to **Settings** → **Pages**
2. Under "Build and deployment":
   - **Source**: GitHub Actions
3. The workflow will automatically deploy when you push to main/master

## Step 3: Local Development

For local development, you have two options:

### Option A: Direct Testing
The fallback Client ID in the code will work for basic testing.

### Option B: Custom Client ID
1. Copy `.env.example` to `.env.local`
2. Add your Client ID to `.env.local`
3. Never commit `.env.local` to version control

## Security Features Implemented

### 1. Environment Variables
- Client ID is injected during build time via GitHub Actions
- No sensitive data in source code (after you remove the hardcoded ID)

### 2. Security Headers (_headers file)
- **X-Frame-Options**: Prevents clickjacking
- **Content-Security-Policy**: Controls resource loading
- **X-Content-Type-Options**: Prevents MIME sniffing
- **Referrer-Policy**: Controls referrer information

### 3. Build-time Security
- Automatic minification of JS/CSS/HTML
- Environment-specific configuration
- Secure token handling with PKCE

## Important Notes

⚠️ **Remove the hardcoded Client ID** from `config.js` before pushing to production:
```javascript
// Change this line:
return window.SPOTIFY_CLIENT_ID || 
       process?.env?.SPOTIFY_CLIENT_ID || 
       '6b0945e253ec4d6d87b5729d1dd946df'; // Remove this!

// To this:
return window.SPOTIFY_CLIENT_ID || 
       process?.env?.SPOTIFY_CLIENT_ID || 
       'YOUR_SPOTIFY_CLIENT_ID';
```

## Verification

After deployment, verify security headers are working:
1. Open browser Developer Tools
2. Go to Network tab
3. Load your site
4. Check response headers for security headers

## Support

For issues or questions about security configuration, please open an issue in the repository.