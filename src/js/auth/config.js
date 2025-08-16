// Configuration Management for Melodyx
// This file handles environment variables and configuration

const Config = {
    // Get Spotify Client ID from environment or fallback
    getSpotifyClientId() {
        // Vite environment variables are prefixed with VITE_
        // They are replaced at build time
        return import.meta.env?.VITE_SPOTIFY_CLIENT_ID || 
               window.SPOTIFY_CLIENT_ID || 
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
        
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'https://melodyx-dev.netlify.app/src/pages/callback.html';
        } else if (hostname === 'nikoloo.github.io') {
            // URI ABSOLUE ET FIXE pour GitHub Pages
            // Cette URI doit correspondre EXACTEMENT à celle dans Spotify Dashboard
            return 'https://nikoloo.github.io/Melodyx/src/pages/callback.html';
        } else if (hostname.includes('.github.io')) {
            // Pour d'autres utilisateurs GitHub Pages
            return `${protocol}//${hostname}/Melodyx/src/pages/callback.html`;
        } else if (hostname.includes('.vercel.app') || hostname.includes('.netlify.app')) {
            return `${protocol}//${hostname}/src/pages/callback.html`;
        } else {
            return 'https://melodyx.app/src/pages/callback.html';
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

// Make available globally for non-module scripts
window.Config = Config;