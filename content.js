(function() {
    'use strict';

    // =====================================================
    // Утилиты
    // =====================================================

    /** Программный клик по элементу */
    function simulateClick(el) {
        if (!el || !el.getBoundingClientRect) return false;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;

        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        const events = [
            new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
            new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
            new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
            new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
            new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y })
        ];

        events.forEach(e => el.dispatchEvent(e));
        return true;
    }

    // =====================================================
    // Поиск пункта меню "Не интересует / Скрыть"
    // =====================================================

    function findHideMenuItem() {
        const items = document.querySelectorAll(
            'ytd-menu-service-item-renderer, tp-yt-paper-item, ytd-menu-navigation-item-renderer'
        );

        const hideTexts = [
            'not interested', 'hide', 'скрыть', 'не интересует',
            'kein interesse', 'nie interesuje', 'non mi interessa',
            'не цікавить', 'ne plus afficher', 'dont recommend',
            'не рекомендовать', 'no me interesa', 'niet interessant'
        ];

        for (const item of items) {
            if (item.offsetParent === null && item.getClientRects().length === 0) continue;
            const text = item.textContent.trim().toLowerCase();
            if (hideTexts.some(t => text.includes(t))) return item;
        }
        return null;
    }

    /** Дождаться появления пункта меню */
    async function waitForHideMenuItem(timeout) {
        if (!timeout) timeout = 2500;
        const start = Date.now();

        return new Promise(function(resolve) {
            function check() {
                const item = findHideMenuItem();
                if (item) { resolve(item); return; }
                if (Date.now() - start >= timeout) { resolve(null); return; }
                requestAnimationFrame(function() { setTimeout(check, 80); });
            }
            check();
        });
    }

    // =====================================================
    // Поиск кнопки меню (3 точки) внутри карточки
    // =====================================================

    function findMenuButton(card) {
        const selectors = [
            'ytd-menu-renderer yt-icon-button#button',
            'ytd-menu-renderer button[aria-label]',
            'yt-icon-button#button',
            '#button yt-icon'
        ];
        for (const sel of selectors) {
            const btn = card.querySelector(sel);
            if (btn && btn.offsetParent !== null) return btn;
        }
        const menuArea = card.querySelector('ytd-menu-renderer');
        if (menuArea) {
            const anyBtn = menuArea.querySelector('button, yt-icon-button');
            if (anyBtn) return anyBtn;
        }
        return null;
    }

    // =====================================================
    // Основная функция скрытия видео
    // =====================================================

    async function hideVideo(card) {
        if (card.dataset.ytQuickHiding === 'true') return;
        card.dataset.ytQuickHiding = 'true';

        try {
            // Визуальный фидбек
            card.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
            card.style.opacity = '0.3';
            card.style.transform = 'scale(0.97)';

            const menuBtn = findMenuButton(card);
            if (!menuBtn) {
                card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                setTimeout(function() { card.style.display = 'none'; }, 300);
                return;
            }

            const clicked = simulateClick(menuBtn);
            if (!clicked) {
                card.style.opacity = '1';
                card.style.transform = '';
                return;
            }

            const hideItem = await waitForHideMenuItem(2500);

            if (hideItem) {
                simulateClick(hideItem);
                await new Promise(function(r) { setTimeout(r, 500); });

                card.style.transition = [
                    'opacity 0.3s ease',
                    'transform 0.3s ease',
                    'max-height 0.35s ease',
                    'margin 0.35s ease',
                    'padding 0.35s ease'
                ].join(', ');
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9) translateY(-10px)';
                card.style.maxHeight = '0';
                card.style.margin = '0';
                card.style.padding = '0';
                card.style.overflow = 'hidden';

                setTimeout(function() { card.style.display = 'none'; }, 400);
            } else {
                card.style.opacity = '1';
                card.style.transform = '';
            }
        } catch (err) {
            console.warn('[YouTube Quick Hide] Error:', err);
            card.style.opacity = '0';
            card.style.display = 'none';
        } finally {
            delete card.dataset.ytQuickHiding;
        }
    }

    // =====================================================
    // Создание кнопки ✕ на карточке
    // =====================================================

    const CARD_SELECTORS = [
        'ytd-rich-item-renderer',           // Главная лента
        'ytd-grid-video-renderer',          // Страница канала / поиск
        'ytd-rich-grid-media',              // Новая сетка
        'yt-lockup-view-model',             // Новая структура 2024+
        'ytd-video-renderer',               // Поиск
        'ytd-compact-video-renderer',       // Боковая панель
        'ytd-playlist-video-renderer',      // Плейлисты
        'ytd-playlist-panel-video-renderer', // Панель плейлиста
        'ytd-reel-item-renderer',           // Shorts
        'ytd-video-with-context-renderer'   // Другие контексты
    ];

    const CARD_SELECTORS_STR = CARD_SELECTORS.join(', ');

    function processVideoCards() {
        const videoCards = document.querySelectorAll(CARD_SELECTORS_STR);

        for (const card of videoCards) {
            if (card.dataset.ytQuickHideDone === 'true') continue;
            card.dataset.ytQuickHideDone = 'true';

            // Ищем контейнер, куда добавить кнопку
            // Приоритет: #dismissible > ytd-thumbnail > сама карточка
            let target = card.querySelector('#dismissible');
            if (!target) {
                target = card.querySelector('ytd-thumbnail');
            }
            if (!target) {
                target = card;
            }

            // Важно: родитель должен быть position:relative
            target.style.position = 'relative';

            const btn = document.createElement('button');
            btn.className = 'yt-quick-hide-btn';
            btn.textContent = '✕';
            btn.setAttribute('aria-label', 'Quick Hide');
            btn.title = 'Скрыть видео';

            target.appendChild(btn);

            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                hideVideo(card);
            });
        }
    }

    // =====================================================
    // Запуск
    // =====================================================


    // Первичная обработка
    processVideoCards();

    // Наблюдение за DOM с debounce
    let observerTimer = null;

    function onDomChange() {
        if (observerTimer) return;
        observerTimer = requestAnimationFrame(function() {
            observerTimer = null;
            processVideoCards();
        });
    }

    const observer = new MutationObserver(onDomChange);
    observer.observe(document.body, { childList: true, subtree: true });

    // SPA-навигация YouTube
    window.addEventListener('yt-navigate-finish', function() {
        setTimeout(processVideoCards, 500);
    });

})();
