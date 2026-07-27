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

    /** Поиск селектора в Light DOM и Shadow DOM карточки */
    function queryCard(card, selector) {
        if (!card) return null;
        let el = card.querySelector(selector);
        if (!el && card.shadowRoot) {
            el = card.shadowRoot.querySelector(selector);
        }
        return el;
    }

    // =====================================================
    // Поиск пункта меню "Не интересует / Скрыть"
    // =====================================================

    function findHideMenuItem() {
        const items = document.querySelectorAll(
            'ytd-menu-service-item-renderer, tp-yt-paper-item, ytd-menu-navigation-item-renderer, yt-list-item-view-model, ytd-menu-service-item-download-renderer'
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
            '.shortsLockupViewModelHostOutsideMetadataMenu button',
            'ytd-menu-renderer yt-icon-button#button',
            'ytd-menu-renderer button[aria-label]',
            'yt-icon-button#button',
            'button[aria-label*="Action menu"]',
            'button[aria-label*="Меню"]',
            'button[aria-label*="Actions"]',
            'button[aria-label="Ещё"]',
            'button[aria-label="More actions"]',
            '#button yt-icon'
        ];
        for (const sel of selectors) {
            const btn = queryCard(card, sel);
            if (btn) return btn;
        }
        const menuArea = queryCard(card, 'ytd-menu-renderer, .shortsLockupViewModelHostOutsideMetadataMenu');
        if (menuArea) {
            const anyBtn = menuArea.querySelector('button, yt-icon-button');
            if (anyBtn) return anyBtn;
        }
        const fallbackBtn = queryCard(card, 'button[aria-label*="menu"], button[aria-label*="Меню"], yt-icon-button');
        if (fallbackBtn) return fallbackBtn;

        return null;
    }

    // =====================================================
    // Гарантированное скрытие карточки с отключаемыми стилями
    // =====================================================

    function visualHideCard(card) {
        card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.8)';
        card.style.pointerEvents = 'none';

        setTimeout(function() {
            card.style.setProperty('display', 'none', 'important');
            card.style.setProperty('visibility', 'hidden', 'important');
            card.style.setProperty('height', '0px', 'important');
            card.style.setProperty('min-height', '0px', 'important');
            card.style.setProperty('margin', '0px', 'important');
            card.style.setProperty('padding', '0px', 'important');
        }, 200);
    }

    // =====================================================
    // Основная функция скрытия видео
    // =====================================================

    async function hideVideo(card) {
        if (card.dataset.ytQuickHiding === 'true') return;
        card.dataset.ytQuickHiding = 'true';

        try {
            card.style.transition = 'opacity 0.15s ease, transform 0.15s ease';
            card.style.opacity = '0.3';

            card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

            const menuBtn = findMenuButton(card);
            if (menuBtn) {
                const clicked = simulateClick(menuBtn);
                if (clicked) {
                    const hideItem = await waitForHideMenuItem(2000);
                    if (hideItem) {
                        simulateClick(hideItem);
                        await new Promise(function(r) { setTimeout(r, 250); });
                    }
                }
            }
        } catch (err) {
            console.warn('[YouTube Quick Hide] Error:', err);
        } finally {
            visualHideCard(card);
            delete card.dataset.ytQuickHiding;
        }
    }

    // =====================================================
    // Селекторы карточек
    // =====================================================

    const CARD_SELECTORS = [
        'ytd-rich-item-renderer',            // Главная лента
        'ytd-grid-video-renderer',           // Страница канала / поиск
        'ytd-rich-grid-media',               // Новая сетка
        'yt-lockup-view-model',              // Новая структура 2024+
        'ytd-shorts-lockup-view-model',      // Shorts 2024+
        'ytm-shorts-lockup-view-model',      // Shorts modern
        'ytd-rich-grid-slim-media',          // Shorts slim grid
        'ytd-video-renderer',                // Поиск
        'ytd-compact-video-renderer',        // Боковая панель
        'ytd-playlist-video-renderer',       // Плейлисты
        'ytd-playlist-panel-video-renderer', // Панель плейлиста
        'ytd-reel-item-renderer',            // Shorts
        'ytd-video-with-context-renderer'    // Другие контексты
    ].join(', ');

    /**
     * Поиск оптимального контейнера для кнопки
     */
    function getTargetContainer(card) {
        // 1. Для Shorts — идеальный блок меню 3 точек (.shortsLockupViewModelHostOutsideMetadataMenu)
        const shortsMenu = queryCard(card, '.shortsLockupViewModelHostOutsideMetadataMenu');
        if (shortsMenu) return shortsMenu;

        // 2. Для обычных видео — всегда в верхнем правом углу превью (превью)
        const thumb = queryCard(card, 'ytd-thumbnail') ||
                      queryCard(card, '#thumbnail') ||
                      queryCard(card, '.yt-lockup-view-model-wiz__media') ||
                      queryCard(card, '.yt-lockup-view-model-wiz__content-image') ||
                      queryCard(card, '#media-container') ||
                      queryCard(card, '#dismissible');
        if (thumb) return thumb;

        return card;
    }

    function processVideoCards() {
        const videoCards = document.querySelectorAll(CARD_SELECTORS);

        for (let i = 0; i < videoCards.length; i++) {
            const card = videoCards[i];

            if (queryCard(card, '.yt-quick-hide-btn')) continue;

            const target = getTargetContainer(card);

            const btn = document.createElement('button');
            btn.className = 'yt-quick-hide-btn';
            btn.textContent = '✕';
            btn.setAttribute('aria-label', 'Quick Hide');
            btn.title = 'Скрыть видео';

            // Изолируем клик на кнопке
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                hideVideo(card);
            }, true);

            btn.addEventListener('pointerdown', function(e) { e.stopPropagation(); }, true);
            btn.addEventListener('mousedown', function(e) { e.stopPropagation(); }, true);
            btn.addEventListener('touchstart', function(e) { e.stopPropagation(); }, true);

            target.appendChild(btn);
        }
    }

    // =====================================================
    // Оптимизированный запуск и MutationObserver
    // =====================================================

    processVideoCards();

    let scheduled = false;
    function onDomChange() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function() {
            scheduled = false;
            processVideoCards();
        });
    }

    const observer = new MutationObserver(onDomChange);
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('yt-navigate-finish', function() {
        setTimeout(processVideoCards, 400);
    });

})();
