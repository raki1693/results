/**
 * 🛡️ KITS RESULT - DEBUGGER-LOCK SHIELD (v4.0)
 * Aggressive desktop blocking + Infinite Debugger Trap.
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

    // 3. 🚨 INFINITE DEBUGGER TRAP (Console Blocker)
    // This function will constantly pause the execution if DevTools are open.
    const startTrap = () => {
        function trap() {
            try {
                (function() {
                    (function a() {
                        debugger;
                        a();
                    }());
                }());
            } catch (e) {
                setTimeout(trap, 100);
            }
        }
        // Small delay to let the page load smoothly
        setTimeout(trap, 1000);
    };

    // 4. 🚨 AGGRESSIVE VISUAL BLOCKER
    if (!isMobile) {
        const detectDevTools = () => {
            const widthThreshold = window.outerWidth - window.innerWidth > 160;
            const heightThreshold = window.outerHeight - window.innerHeight > 160;
            
            if (widthThreshold || heightThreshold) {
                document.body.classList.add('devtools-open');
                startTrap(); // Engage the debugger trap if they try to bypass the blur
            } else {
                document.body.classList.remove('devtools-open');
            }
        };

        setInterval(detectDevTools, 500);
        window.addEventListener('resize', detectDevTools);
        detectDevTools();
    } else {
        // Even on mobile, we can run a milder version of the trap
        startTrap();
    }

    // 5. 🖨️ ANTI-PRINT TRIGGER
    window.onbeforeprint = function() {
        document.body.style.display = 'none';
    };
    window.onafterprint = function() {
        document.body.style.display = 'block';
    };

    console.log("%c🛡️ Debugger-Lock Active (v4.0)", "color: #ef4444; font-size: 16px; font-weight: bold;");
})();
