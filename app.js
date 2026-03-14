document.addEventListener('DOMContentLoaded', () => {
    const productGrid = document.getElementById('product-grid');
    const filterBtns  = document.querySelectorAll('.filter-btn');

    // ─── Lightbox ────────────────────────────────────────────────────
    const lightbox    = document.createElement('div');
    lightbox.className = 'lightbox-overlay';
    lightbox.innerHTML = `
        <button class="lightbox-close" aria-label="Close">✕</button>
        <img class="lightbox-img" src="" alt="Preview">
    `;
    document.body.appendChild(lightbox);

    const lbImg = lightbox.querySelector('.lightbox-img');

    const openLightbox = (src) => {
        lbImg.src = src;
        lightbox.classList.add('open');
    };

    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
            lightbox.classList.remove('open');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') lightbox.classList.remove('open');
    });

    // ─── Pagination Logic ──────────────────────────────────────────
    let allProducts = [];
    let filteredProducts = [];
    let currentPage = 0;
    const BATCH_SIZE = 12;

    const showSkeletons = (count = 6) => {
        productGrid.innerHTML = Array(count).fill(0).map(() => `
            <div class="skeleton-card">
                <div class="skeleton-img skeleton"></div>
                <div class="skeleton-text skeleton"></div>
                <div class="skeleton-desc skeleton"></div>
                <div class="skeleton-price skeleton"></div>
            </div>
        `).join('');
    };

    // ─── Render Batch ─────────────────────────────────────────────────
    const loadNextBatch = () => {
        const start = currentPage * BATCH_SIZE;
        const end = start + BATCH_SIZE;
        const batch = filteredProducts.slice(start, end);
        
        if (batch.length > 0) {
            displayProducts(batch, currentPage === 0);
            currentPage++;
        }

        // Hide observer if no more products
        if (end >= filteredProducts.length) {
            sentinel.style.display = 'none';
        } else {
            sentinel.style.display = 'block';
        }
    };

    // ─── Fetch ────────────────────────────────────────────────────────
    const fetchProducts = async () => {
        try {
            const cacheBust = '?t=' + Date.now();
            const res = await fetch('api/products' + cacheBust).catch(() => fetch('data.json' + cacheBust));
            if (!res.ok && res.url.includes('api')) return fetch('data.json' + cacheBust).then(r => r.json());
            return await res.json();
        } catch (err) {
            console.error('Fetch error:', err);
            productGrid.innerHTML = '<p style="color:#6b6b6b;grid-column:1/-1;text-align:center;padding:3rem 0;">Failed to load products. Check console for details.</p>';
            return [];
        }
    };

    // ─── Render Cards ─────────────────────────────────────────────────
    const displayProducts = (items, clear = false) => {
        if (clear) productGrid.innerHTML = '';

        if (items.length === 0 && clear) {
            productGrid.innerHTML = '<p style="color:#6b6b6b;grid-column:1/-1;text-align:center;padding:3rem 0;">No products found.</p>';
            return;
        }

        const downloadIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;

        items.forEach((product, idx) => {
            const images = (product.images && product.images.length > 0) ? product.images : (product.image ? [product.image] : []);
            const hasMany = images.length > 1;
            const formatCat = (c) => c ? c.replace(/-/g, ' ') : '';
            const thumbsHtml = hasMany ? images.map((src, i) => `<img src="${src}" alt="View ${i+1}" class="thumb-img${i === 0 ? ' active' : ''}" data-index="${i}" loading="lazy">`).join('') : '';

            const card = document.createElement('div');
            card.className = 'product-card card-animate';
            card.innerHTML = `
                <div class="card-img-wrapper">
                    <img src="${images[0] || ''}" alt="${product.title}" class="main-img" loading="lazy">
                    <span class="card-category-badge">${formatCat(product.category)}</span>
                    ${images.length > 1 ? `<span class="img-count-badge">1 / ${images.length}</span>` : ''}
                </div>
                ${hasMany ? `<div class="thumbnail-strip">${thumbsHtml}</div>` : ''}
                <div class="card-content">
                    <p class="card-category-label">${formatCat(product.category)}</p>
                    <h3 class="card-title">${product.title}</h3>
                    <p class="card-desc">${product.description || ''}</p>
                    <div class="card-footer">
                        <span class="card-price"><sup>₹</sup>${Number(product.price).toLocaleString('en-IN')}</span>
                        <button class="save-btn" title="Download Current Image">${downloadIcon} Save Image</button>
                    </div>
                </div>
            `;

            const mainImg = card.querySelector('.main-img');
            const countBadge = card.querySelector('.img-count-badge');
            let currentIdx = 0;

            if (hasMany) {
                const thumbs = card.querySelectorAll('.thumb-img');
                thumbs.forEach(thumb => {
                    thumb.onclick = (e) => {
                        thumbs[currentIdx].classList.remove('active');
                        currentIdx = parseInt(e.currentTarget.dataset.index);
                        mainImg.src = images[currentIdx];
                        thumbs[currentIdx].classList.add('active');
                        if (countBadge) countBadge.textContent = `${currentIdx + 1} / ${images.length}`;
                    };
                });
            }

            mainImg.onclick = () => openLightbox(mainImg.src);
            const saveBtn = card.querySelector('.save-btn');
            saveBtn.onclick = async (e) => {
                e.preventDefault();
                const originalHtml = saveBtn.innerHTML;
                saveBtn.innerHTML = 'Downloading…';
                saveBtn.disabled = true;

                try {
                    const img = new Image();
                    img.crossOrigin = 'Anonymous';
                    img.src = mainImg.src;
                    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });

                    const canvas = document.createElement('canvas');
                    canvas.width = img.width; canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);

                    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));
                    const filename = `${product.title.replace(/\s+/g, '_').toLowerCase()}_${currentIdx + 1}.jpg`;
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
                } catch (err) {
                    alert('Error downloading image.');
                } finally {
                    saveBtn.innerHTML = originalHtml; saveBtn.disabled = false;
                }
            };
            productGrid.appendChild(card);
        });
    };

    // ─── Observer & Sentinel ──────────────────────────────────────────
    const sentinel = document.createElement('div');
    sentinel.id = 'pagination-sentinel';
    sentinel.style.height = '20px';
    sentinel.style.width = '100%';
    document.querySelector('.catalog-section').appendChild(sentinel);

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && filteredProducts.length > 0) {
            loadNextBatch();
        }
    }, { rootMargin: '200px' });

    observer.observe(sentinel);

    // ─── Init ──────────────────────────────────────────────────────────
    const fetchCategories = async () => {
        try {
            const cacheBust = '?t=' + Date.now();
            const res = await fetch('api/categories' + cacheBust).catch(() => fetch('categories.json' + cacheBust));
            if (!res.ok && res.url.includes('api')) return fetch('categories.json' + cacheBust).then(r => r.json());
            return await res.json();
        } catch (err) {
            return ["embroidery", "block-print", "brush-paint", "screen-print"];
        }
    };

    const initCategories = (categories) => {
        const categorySelect = document.getElementById('category-filter');
        if (categorySelect) {
            categorySelect.innerHTML = '<option value="all">All Designs</option>' + categories.map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}</option>`).join('');
        }
    };

    const initApp = async () => {
        showSkeletons(12);
        const [products, categories] = await Promise.all([fetchProducts(), fetchCategories()]);
        allProducts = products;
        filteredProducts = products;
        initCategories(categories);

        const categorySelect = document.getElementById('category-filter');
        if (categorySelect) {
            categorySelect.onchange = (e) => {
                const filter = e.target.value;
                filteredProducts = filter === 'all' ? allProducts : allProducts.filter(p => p.category === filter);
                currentPage = 0;
                productGrid.innerHTML = '';
                loadNextBatch();
            };
        }

        loadNextBatch();
    };

    initApp();
});
