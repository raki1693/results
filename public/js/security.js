/**
 * 🛡️ KITS RESULT - REFINED SECURITY SHIELD (v2.0)
 * Optimized for mobile and multi-device compatibility.
 */

(function() {
    'use strict';

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
        
        // Disable Print
        if (e.ctrlKey && e.keyCode === 80) {
            e.preventDefault();
            alert("⚠️ Printing is disabled for data security.");
            return false;
        }
        
        // Disable Save
        if (e.ctrlKey && e.keyCode === 83) { e.preventDefault(); return false; }
    });

    // 3. 🚨 SMARTER DEVTOOLS PROTECTION (Non-Visual)
    // We remove the blur effect triggered by window size because it's unreliable on mobile.
    // Instead, we use a debugger loop that only engages if the inspector is actually active.
    
    const blockDevTools = () => {
        const start = Date.now();
        debugger; // This will pause execution ONLY if DevTools are open
        const end = Date.now();
        if (end - start > 100) {
            // If it took a long time, the debugger was active
            // We can log it or slightly slow down the app, but we don't blur the UI anymore.
            console.warn("Security Alert: Execution paused.");
        }
    };

    // Only run the debugger check on non-mobile devices to be safe
    if (!/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        setInterval(blockDevTools, 2000);
    }

    // 4. 🖨️ ANTI-PRINT TRIGGER (CSS Layer remains the primary defense)
    window.onbeforeprint = function() {
        document.body.style.display = 'none';
    };
    window.onafterprint = function() {
        document.body.style.display = 'block';
    };

    console.log("%c🛡️ Security Shield Active (v2.0)", "color: #10b981; font-size: 16px; font-weight: bold;");
})();
