// Configuration Management for Melodyx
// This file handles environment variables and configuration

const Config = {
    // Get Spotify Client ID from environment or fallback
    getSpotifyClientId() {
        // For GitHub Pages deployment with GitHub Actions
        // The CLIENT_ID will be injected during build time
        return window.SPOTIFY_CLIENT_ID || 
               process?.env?.SPOTIFY_CLIENT_ID || 
               '6b0945e253ec4d6d87b5729d1dd946df'; // Fallback for local development only
    },

    // Get environment type
    getEnvironment() {
        const hostname = window.location.hostname;
        
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'development';
        } else if (hostname.includes('.github.io')) {
            return 'github-pages';
        } else if (hostname.includes('.vercel.app') || hostname.includes('.netlify.app')) {
            return 'staging';
        } else {
            return 'production';
        }
    },

    // Check if running in secure context
    isSecureContext() {
        return window.location.protocol === 'https:' || 
               window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1';
    },

    // Get redirect URI based on environment
    getRedirectUri() {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        const pathname = window.location.pathname;
        
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'https://melodyx-dev.netlify.app/callback';
        } else if (hostname.includes('.github.io')) {
            const basePath = pathname.split('/').slice(0, -1).join('/');
            return `${protocol}//${hostname}${basePath}/callback`;
        } else if (hostname.includes('.vercel.app') || hostname.includes('.netlify.app')) {
            return `${protocol}//${hostname}/callback`;
        } else {
            return 'https://melodyx.app/callback';
        }
    },

    // Validate configuration
    validateConfig() {
        const clientId = this.getSpotifyClientId();
        
        if (!clientId || clientId === 'YOUR_SPOTIFY_CLIENT_ID') {
            console.error('Spotify Client ID not configured properly');
            return false;
        }

        if (!this.isSecureContext() && this.getEnvironment() === 'production') {
            console.warn('Application should be served over HTTPS in production');
        }

        return true;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
}