/**
 * 🛡️ KITS RESULT - HYBRID SECURITY SHIELD (v3.0)
 * Aggressive desktop blocking + Mobile compatibility.
 */

(function() {
    'use strict';

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // 1. 🚫 DISABLE RIGHT-CLICK
    document.addEventListener('contextmenu', e => e.preventDefault());

    // 2. 🚫 DISABLE KEYBOARD SHORTCUTS
    document.addEventListener('keydown', e => {
        if (e.keyCode === 123) { e.preventDefault(); return false; }
        if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
            e.preventDefault();
            return false;
        }
        if (e.ctrlKey && e.keyCode === 85) { e.preventDefault(); return false; }
        if (e.ctrlKey && e.keyCode === 80) {
            e.preventDefault();
            alert("⚠️ Printing is disabled for data security.");
            return false;
        }
    });

    // 3. 🚨 AGGRESSIVE DESKTOP BLOCKER
    // If not mobile, we use the window-size sensor to visually blur the site immediately.
    if (!isMobile) {
        const detectDevTools = () => {
            const widthThreshold = window.outerWidth - window.innerWidth > 160;
            const heightThreshold = window.outerHeight - window.innerHeight > 160;
            
            if (widthThreshold || heightThreshold) {
                document.body.classList.add('devtools-open');
            } else {
                document.body.classList.remove('devtools-open');
            }
        };

        // Check constantly
        setInterval(detectDevTools, 500);
        window.addEventListener('resize', detectDevTools);
        detectDevTools(); // Run immediately on load
    }

    // 4. 🖨️ ANTI-PRINT TRIGGER
    window.onbeforeprint = function() {
        document.body.style.display = 'none';
    };
    window.onafterprint = function() {
        document.body.style.display = 'block';
    };

    console.log("%c🛡️ Hybrid Shield Active (v3.0)", "color: #4f46e5; font-size: 16px; font-weight: bold;");
})();
