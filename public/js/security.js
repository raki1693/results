/**
 * 🛡️ KITS RESULT - GLOBAL SECURITY SHIELD
 * Implements anti-scraping, anti-print, and anti-inspect mechanisms.
 */

(function() {
    'use strict';

    // 1. 🚫 DISABLE RIGHT-CLICK
    document.addEventListener('contextmenu', e => e.preventDefault());

    // 2. 🚫 DISABLE KEYBOARD SHORTCUTS (F12, CTRL+S, CTRL+P, CTRL+U, CTRL+SHIFT+I/J/C)
    document.addEventListener('keydown', e => {
        // F12
        if (e.keyCode === 123) { e.preventDefault(); return false; }
        
        // CTRL + SHIFT + I/J/C (Inspect / Console / Elements)
        if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
            e.preventDefault();
            return false;
        }

        // CTRL + U (View Source)
        if (e.ctrlKey && e.keyCode === 85) { e.preventDefault(); return false; }

        // CTRL + P (Print)
        if (e.ctrlKey && e.keyCode === 80) {
            e.preventDefault();
            alert("⚠️ Printing is disabled for data security.");
            return false;
        }

        // CTRL + S (Save Page)
        if (e.ctrlKey && e.keyCode === 83) { e.preventDefault(); return false; }
    });

    // 3. 🚨 DEVTOOLS DETECTION & BLOCKER
    // If window size changes drastically (possible devtools open), we can blur the screen
    let lastWidth = window.outerWidth;
    let lastHeight = window.outerHeight;

    setInterval(() => {
        const threshold = 160;
        const widthDiff = Math.abs(window.outerWidth - window.innerWidth) > threshold;
        const heightDiff = Math.abs(window.outerHeight - window.innerHeight) > threshold;

        if (widthDiff || heightDiff) {
            document.body.classList.add('devtools-open');
        } else {
            document.body.classList.remove('devtools-open');
        }
    }, 1000);

    // 4. 🖨️ ANTI-PRINT TRIGGER (JavaScript Layer)
    window.onbeforeprint = function() {
        document.body.style.display = 'none';
    };
    window.onafterprint = function() {
        document.body.style.display = 'block';
    };

    console.log("%c🛡️ Security Shield Active", "color: #4f46e5; font-size: 20px; font-weight: bold;");
    console.log("%cUnauthorised inspection or printing is strictly prohibited.", "color: #6366f1; font-size: 14px;");

})();
