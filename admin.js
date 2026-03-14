document.addEventListener('DOMContentLoaded', () => {
    // ─── Mode & Auth Configuration ──────────────────────────────
    const mode = localStorage.getItem('admin_mode') || 'server';
    const token = localStorage.getItem('admin_token');
    const ghToken = localStorage.getItem('gh_token');
    const ghRepo = localStorage.getItem('gh_repo');

    if (!token) {
        window.location.href = 'loginkota.html';
        return;
    }

    // ─── GitHub API Client ────────────────────────────────────────
    const github = {
        async request(path, options = {}) {
            const url = `https://api.github.com/repos/${ghRepo}/contents/${path}`;
            const headers = {
                'Authorization': `token ${ghToken}`,
                'Accept': 'application/vnd.github.v3+json',
                ...options.headers
            };
            const response = await fetch(url, { ...options, headers });
            if (response.status === 401) {
                alert('GitHub Token expired or invalid. Please login again.');
                localStorage.clear();
                window.location.href = 'loginkota.html';
            }
            return response;
        },
        async getFile(path) {
            const res = await this.request(path + '?t=' + Date.now()); // Cache bust
            if (!res.ok) return { content: null, sha: null };
            const data = await res.json();
            try {
                // Decode base64 to UTF-8
                const decoded = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));
                return {
                    content: JSON.parse(decoded),
                    sha: data.sha
                };
            } catch (err) {
                console.error('Decoding/JSON error:', err);
                return { content: null, sha: data.sha };
            }
        },
        async updateFile(path, content, sha, message) {
            const body = {
                message,
                content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
                sha
            };
            return this.request(path, {
                method: 'PUT',
                body: JSON.stringify(body)
            });
        },
        async uploadImage(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async () => {
                    const base64 = reader.result.split(',')[1];
                    const filename = `images/${Date.now()}-${Math.floor(Math.random() * 1000)}.${file.name.split('.').pop()}`;
                    const res = await this.request(filename, {
                        method: 'PUT',
                        body: JSON.stringify({
                            message: `Upload image: ${file.name}`,
                            content: base64
                        })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        resolve(data.content.path);
                    } else {
                        reject('Image upload failed');
                    }
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }
    };

    const authHeader = mode === 'server' ? { 'Authorization': token } : {};
    const uploadForm = document.getElementById('upload-form');
    const statusMsg = document.getElementById('status-message');
    const adminGrid = document.getElementById('admin-product-grid');
    const adminLoading = document.getElementById('admin-loading');
    const catSelect = document.getElementById('category');

    // ─── Category Management Logic ────────────────────────────────
    const loadCategories = async () => {
        try {
            let categories;
            if (mode === 'github') {
                const { content } = await github.getFile('categories.json');
                categories = content || ["embroidery", "block-print", "brush-paint", "screen-print"];
            } else {
                const res = await fetch('api/categories');
                categories = await res.json();
            }
            
            if (catSelect) {
                catSelect.innerHTML = categories.map(cat => 
                    `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1).replace('-', ' ')}</option>`
                ).join('');
            }
        } catch (err) {
            console.error('Failed to load categories');
        }
    };

    const addCatUiBtn = document.getElementById('add-cat-ui-btn');
    const newCatPanel = document.getElementById('new-cat-panel');
    const submitNewCatBtn = document.getElementById('submit-new-cat');
    const newCatInput = document.getElementById('new-cat-name');

    if (addCatUiBtn) {
        addCatUiBtn.addEventListener('click', () => {
            newCatPanel.style.display = newCatPanel.style.display === 'none' ? 'block' : 'none';
        });
    }

    if (submitNewCatBtn) {
        submitNewCatBtn.addEventListener('click', async () => {
            const name = newCatInput.value.trim();
            if (!name) return alert('Enter a category name');
            const safeName = name.toLowerCase().replace(/\s+/g, '-');

            try {
                if (mode === 'github') {
                    const { content, sha } = await github.getFile('categories.json');
                    const categories = content || [];
                    if (categories.includes(safeName)) return alert('Category exists');
                    categories.push(safeName);
                    const res = await github.updateFile('categories.json', categories, sha, `Add category: ${safeName}`);
                    if (res.ok) {
                        await loadCategories();
                        newCatInput.value = '';
                        newCatPanel.style.display = 'none';
                    }
                } else {
                    const res = await fetch('api/categories', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeader },
                        body: JSON.stringify({ name })
                    });
                    const result = await res.json();
                    if (res.ok && result.success) {
                        await loadCategories();
                        newCatInput.value = '';
                        newCatPanel.style.display = 'none';
                        catSelect.value = result.category;
                    }
                }
            } catch (err) {
                alert('Error adding category');
            }
        });
    }

    loadCategories();

    const showMessage = (msg, isError = false) => {
        statusMsg.textContent = msg;
        statusMsg.style.display = 'block';
        statusMsg.style.backgroundColor = isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)';
        statusMsg.style.color = isError ? '#fca5a5' : '#86efac';
        statusMsg.style.border = `1px solid ${isError ? '#ef4444' : '#22c55e'}`;
    };

    // ─── Load & Render Products ──────────────────────────────
    const loadAdminProducts = async () => {
        try {
            let products;
            if (mode === 'github') {
                const { content } = await github.getFile('data.json');
                products = content || [];
            } else {
                const res = await fetch('api/products', { headers: authHeader });
                products = await res.json();
            }
            
            adminLoading.style.display = 'none';
            if (products.length === 0) {
                adminGrid.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1/-1;">No products yet.</p>';
                return;
            }

            adminGrid.innerHTML = '';
            products.forEach(product => {
                const coverImg = product.images && product.images.length > 0 ? product.images[0] : '';
                const card = document.createElement('div');
                card.className = 'product-card';
                card.dataset.id = product.id;
                card.innerHTML = `
                    <div class="card-img-wrapper" style="height: auto; min-height: unset; background: #eee;">
                        <img src="${coverImg}" alt="${product.title}" class="main-img" style="width: 100%; height: auto; object-fit: contain; max-height: 250px;">
                        <span class="card-category-badge">${product.category.replace('-', ' ')}</span>
                    </div>
                    <div class="card-content">
                        <div class="card-header">
                            <h3 class="card-title" style="font-size: 1rem;">${product.title}</h3>
                            <span class="card-price">₹${product.price}</span>
                        </div>
                        <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 1rem;">${product.images ? product.images.length : 0} photo(s)</p>
                        <div class="card-actions">
                            <button class="delete-btn" data-id="${product.id}">🗑️ Delete Product</button>
                        </div>
                    </div>
                `;
                adminGrid.appendChild(card);
            });

            adminGrid.querySelectorAll('.delete-btn').forEach(btn => {
                btn.onclick = async () => {
                    const id = btn.dataset.id;
                    if (!confirm("Delete product?")) return;
                    btn.disabled = true;
                    btn.textContent = 'Deleting...';

                    try {
                        if (mode === 'github') {
                            const { content, sha } = await github.getFile('data.json');
                            const updated = content.filter(p => p.id !== id);
                            const res = await github.updateFile('data.json', updated, sha, `Delete product ID: ${id}`);
                            if (res.ok) btn.closest('.product-card').remove();
                        } else {
                            const res = await fetch(`api/products/${id}`, { method: 'DELETE', headers: authHeader });
                            if (res.ok) btn.closest('.product-card').remove();
                        }
                    } catch (err) {
                        alert('Delete failed');
                        btn.disabled = false;
                        btn.textContent = '🗑️ Delete Product';
                    }
                };
            });
        } catch (err) {
            adminLoading.textContent = 'Error loading products.';
        }
    };

    loadAdminProducts();

    // ─── Upload Form Submit ───────────────────────────────────────
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = uploadForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        const productData = {
            title: document.getElementById('title').value,
            price: document.getElementById('price').value,
            category: document.getElementById('category').value,
            description: document.getElementById('description').value,
            id: Date.now().toString()
        };

        try {
            if (mode === 'github') {
                const files = document.getElementById('images').files;
                const uploadedPaths = [];
                for (let i = 0; i < files.length; i++) {
                    submitBtn.textContent = `Uploading Image ${i+1}/${files.length}...`;
                    const path = await github.uploadImage(files[i]);
                    uploadedPaths.push(path);
                }
                
                submitBtn.textContent = 'Updating Catalog...';
                const { content, sha } = await github.getFile('data.json');
                const products = content || [];
                products.unshift({ ...productData, images: uploadedPaths });
                const res = await github.updateFile('data.json', products, sha, `Add product: ${productData.title}`);
                
                if (res.ok) {
                    showMessage('✅ Added to GitHub Catalog!');
                    uploadForm.reset();
                    loadAdminProducts();
                }
            } else {
                const formData = new FormData(uploadForm);
                const res = await fetch('api/upload', { method: 'POST', headers: authHeader, body: formData });
                if (res.ok) {
                    showMessage('✅ Added to Server Catalog!');
                    uploadForm.reset();
                    loadAdminProducts();
                }
            }
        } catch (err) {
            showMessage('❌ Upload failed', true);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Product to Catalog';
        }
    });

    document.getElementById('logout-btn').onclick = () => {
        localStorage.clear();
        window.location.href = 'login.html';
    };
});
