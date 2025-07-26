// Header scroll effect
window.addEventListener('scroll', () => {
    const header = document.querySelector('.header');
    if (window.scrollY > 100) {
        header.style.background = 'rgba(18, 18, 18, 0.98)';
    } else {
        header.style.background = 'rgba(18, 18, 18, 0.95)';
    }
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Animated lyrics demo
function animateLyrics() {
    const lyricLines = document.querySelectorAll('.lyric-line');
    let currentIndex = 0;
    
    setInterval(() => {
        lyricLines.forEach(line => line.classList.remove('active'));
        lyricLines[currentIndex].classList.add('active');
        currentIndex = (currentIndex + 1) % lyricLines.length;
    }, 3000);
}

// Intersection Observer for animations
const observerOptions = {
    threshold: 0.2,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
        }
    });
}, observerOptions);

// Button hover effects
function addButtonEffects() {
    const buttons = document.querySelectorAll('.btn');
    
    buttons.forEach(button => {
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
        });
        
        button.addEventListener('mousedown', function() {
            this.style.transform = 'translateY(0) scale(0.98)';
        });
        
        button.addEventListener('mouseup', function() {
            this.style.transform = 'translateY(-2px)';
        });
    });
}

// Feature card hover effects
function addFeatureCardEffects() {
    const featureCards = document.querySelectorAll('.feature-card');
    
    featureCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.background = 'rgba(26, 26, 26, 0.8)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.background = 'var(--background-card)';
        });
    });
}

// Music wave animation control
function controlMusicWave() {
    const waveBars = document.querySelectorAll('.wave-bar');
    let isPlaying = true;
    
    // Toggle animation on click
    document.querySelector('.music-wave').addEventListener('click', () => {
        isPlaying = !isPlaying;
        waveBars.forEach(bar => {
            if (isPlaying) {
                bar.style.animationPlayState = 'running';
            } else {
                bar.style.animationPlayState = 'paused';
            }
        });
    });
}

// Randomize shuffle demo
function animateShuffleDemo() {
    const trackItems = document.querySelectorAll('.track-item');
    const tracks = ['Titre 1', 'Titre 2', 'Titre 3', 'Titre 4', 'Titre 5'];
    
    setInterval(() => {
        trackItems.forEach(item => {
            const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
            item.textContent = randomTrack;
        });
    }, 2000);
}

// Stats demo animation
function animateStatsDemo() {
    const statBars = document.querySelectorAll('.stat-bar');
    
    setInterval(() => {
        statBars.forEach(bar => {
            const randomHeight = Math.floor(Math.random() * 40) + 20;
            bar.style.height = randomHeight + 'px';
        });
    }, 3000);
}

// Visual demo particle effect
function createVisualParticles() {
    const visualDemo = document.querySelector('.visual-demo');
    
    setInterval(() => {
        const particle = document.createElement('div');
        particle.style.position = 'absolute';
        particle.style.width = '4px';
        particle.style.height = '4px';
        particle.style.background = 'var(--primary-color)';
        particle.style.borderRadius = '50%';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.opacity = '0.7';
        particle.style.pointerEvents = 'none';
        
        visualDemo.style.position = 'relative';
        visualDemo.appendChild(particle);
        
        setTimeout(() => {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
        }, 2000);
    }, 500);
}

// Parallax effect for hero section
function addParallaxEffect() {
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const heroVisual = document.querySelector('.hero-visual');
        const heroContent = document.querySelector('.hero-content');
        
        if (heroVisual && heroContent) {
            heroVisual.style.transform = `translateY(${scrolled * 0.2}px)`;
            heroContent.style.transform = `translateY(${scrolled * 0.1}px)`;
        }
    });
}

// Loading animation
function showLoadingAnimation() {
    const body = document.body;
    body.style.opacity = '0';
    body.style.transition = 'opacity 0.5s ease';
    
    window.addEventListener('load', () => {
        setTimeout(() => {
            body.style.opacity = '1';
        }, 100);
    });
}

// Keyboard navigation
function addKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

// Initialize all functions when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    showLoadingAnimation();
    animateLyrics();
    addButtonEffects();
    addFeatureCardEffects();
    controlMusicWave();
    animateShuffleDemo();
    animateStatsDemo();
    createVisualParticles();
    addParallaxEffect();
    addKeyboardNavigation();
    
    // Observe elements for scroll animations
    document.querySelectorAll('.feature-card, .section-title, .cta-content').forEach(el => {
        observer.observe(el);
    });
    
    // Add animation classes to CSS
    const style = document.createElement('style');
    style.textContent = `
        .animate-in {
            animation: fadeInUp 0.8s ease forwards;
        }
        
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .feature-card:not(.animate-in) {
            opacity: 0;
            transform: translateY(30px);
        }
        
        .section-title:not(.animate-in) {
            opacity: 0;
            transform: translateY(20px);
        }
        
        .cta-content:not(.animate-in) {
            opacity: 0;
            transform: translateY(20px);
        }
    `;
    document.head.appendChild(style);
});

// Add click handlers for main CTA buttons
document.addEventListener('DOMContentLoaded', () => {
    const ctaButtons = document.querySelectorAll('.btn-primary');
    
    ctaButtons.forEach(button => {
        if (button.textContent.includes('Commencer')) {
            button.addEventListener('click', async () => {
                await SpotifyAuth.login();
            });
        }
        
        if (button.textContent.includes('démo')) {
            button.addEventListener('click', () => {
                document.querySelector('#features').scrollIntoView({
                    behavior: 'smooth'
                });
            });
        }
    });

    // Gérer le callback OAuth si on est sur la page de callback
    if (window.location.search.includes('code=') || window.location.search.includes('error=')) {
        SpotifyAuth.handleCallback();
    }

    // Afficher l'état de connexion dans la navigation
    updateLoginStatus();
});

// Fonction pour mettre à jour l'état de connexion dans la navigation
function updateLoginStatus() {
    const navLinks = document.querySelector('.nav-links');
    
    if (SpotifyAuth.isLoggedIn()) {
        // Utilisateur connecté - ajouter bouton de déconnexion
        const logoutBtn = document.createElement('a');
        logoutBtn.href = '#';
        logoutBtn.textContent = 'Déconnexion';
        logoutBtn.style.color = 'var(--accent-color)';
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            SpotifyAuth.logout();
        });
        
        // Remplacer les liens existants
        navLinks.innerHTML = '';
        navLinks.appendChild(logoutBtn);
        
        // Modifier les boutons CTA pour rediriger vers l'app
        document.querySelectorAll('.btn-primary').forEach(button => {
            if (button.textContent.includes('Commencer')) {
                button.textContent = 'Ouvrir l\'application';
                button.onclick = () => window.location.href = '/app';
            }
        });
    }
}

// Mobile menu toggle (for future mobile menu implementation)
function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
}