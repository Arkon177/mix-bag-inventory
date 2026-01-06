/**
 * Mix Bag Inventory Tracker
 * A simple inventory management application
 */

const APP_VERSION = '2.1.4';

// ===========================================
// Default Flavours
// ===========================================
const DEFAULT_FLAVOURS = [
    { name: 'Rich', reorderThreshold: 5000 },
    { name: 'Caramel', reorderThreshold: 5000 },
    { name: 'White', reorderThreshold: 5000 },
    { name: 'Turkish', reorderThreshold: 3000 },
    { name: 'Mint', reorderThreshold: 3000 },
    { name: 'Strawberry', reorderThreshold: 3000 },
    { name: 'Coffee', reorderThreshold: 3000 },
    { name: 'Lemon Myrtle', reorderThreshold: 3000 },
    { name: 'Lamington', reorderThreshold: 3000 },
    { name: 'Fairy Bread', reorderThreshold: 3000 },
    { name: 'Cherry', reorderThreshold: 3000 },
    { name: 'Orange', reorderThreshold: 3000 },
    { name: 'Passionfruit', reorderThreshold: 3000 },
    { name: 'Blueberry', reorderThreshold: 3000 },
    { name: 'Raspberry', reorderThreshold: 3000 },
    { name: 'Gingerbread', reorderThreshold: 3000 },
    { name: 'Butterscotch', reorderThreshold: 3000 },
    { name: 'Eggnog', reorderThreshold: 3000 },
    { name: 'Pecan Pie', reorderThreshold: 3000 }
];

// Default Box Flavours (all have threshold of 3)
const DEFAULT_BOX_FLAVOURS = [
    'Rich', 'Caramel', 'White', 'Turkish', 'Mint', 'Strawberry',
    'Coffee', 'Lemon Myrtle', 'Lamington', 'Fairy Bread', 'Cherry',
    'Orange', 'Passionfruit', 'Blueberry', 'Raspberry', 'Gingerbread',
    'Butterscotch', 'Eggnog', 'Pecan Pie'
];

const state = {
    products: [],
    transactions: [],
    boxes: [],
    boxTransactions: [],
    tasks: [],
    currentTab: 'bags',
    settings: {
        reorderThreshold: 1000
    }
};

// Local Storage Keys
const STORAGE_KEYS = {
    PRODUCTS: 'mixbag_products',
    TRANSACTIONS: 'mixbag_transactions',
    BOXES: 'mixbag_boxes',
    BOX_TRANSACTIONS: 'mixbag_box_transactions',
    TASKS: 'mixbag_tasks',
    SETTINGS: 'mixbag_settings'
};

// ===========================================
// Data Layer (with Firebase Cloud Sync)
// ===========================================
const Storage = {
    // Flag to track if cloud sync is enabled
    cloudEnabled: typeof FirebaseStorage !== 'undefined',

    save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
        }
    },

    load(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
            return null;
        }
    },

    // Load from local storage first, then sync with cloud
    loadAll() {
        // Load from localStorage first (instant)
        state.products = Storage.load(STORAGE_KEYS.PRODUCTS) || [];
        state.transactions = Storage.load(STORAGE_KEYS.TRANSACTIONS) || [];
        state.boxes = Storage.load(STORAGE_KEYS.BOXES) || [];
        state.boxTransactions = Storage.load(STORAGE_KEYS.BOX_TRANSACTIONS) || [];
        state.tasks = Storage.load(STORAGE_KEYS.TASKS) || [];
        state.settings = Storage.load(STORAGE_KEYS.SETTINGS) || { reorderThreshold: 1000 };

        // Initialize with default flavours if no products exist
        if (state.products.length === 0) {
            Inventory.initializeDefaultFlavours();
        } else {
            // Migration: Add reorderThreshold to existing products that don't have it
            let needsSave = false;
            state.products.forEach(product => {
                if (product.reorderThreshold === undefined) {
                    const defaultFlavour = DEFAULT_FLAVOURS.find(f => f.name.toLowerCase() === product.name.toLowerCase());
                    product.reorderThreshold = defaultFlavour ? defaultFlavour.reorderThreshold : 3000;
                    needsSave = true;
                }
            });
            if (needsSave) {
                Storage.save(STORAGE_KEYS.PRODUCTS, state.products);
            }
        }

        // Initialize boxes if none exist
        if (state.boxes.length === 0) {
            Inventory.initializeDefaultBoxes();
        }
    },

    // Save to both local and cloud
    saveAll() {
        // Save to localStorage (instant, works offline)
        Storage.save(STORAGE_KEYS.PRODUCTS, state.products);
        Storage.save(STORAGE_KEYS.TRANSACTIONS, state.transactions);
        Storage.save(STORAGE_KEYS.BOXES, state.boxes);
        Storage.save(STORAGE_KEYS.BOX_TRANSACTIONS, state.boxTransactions);
        Storage.save(STORAGE_KEYS.TASKS, state.tasks);
        Storage.save(STORAGE_KEYS.SETTINGS, state.settings);

        // Sync to cloud if available
        Storage.syncToCloud();
    },

    // Sync current state to cloud
    syncToCloud() {
        if (this.cloudEnabled && window.FirebaseStorage) {
            FirebaseStorage.saveToCloud({
                products: state.products,
                transactions: state.transactions,
                boxes: state.boxes,
                boxTransactions: state.boxTransactions,
                tasks: state.tasks,
                settings: state.settings
            });
        }
    },

    // Apply data from cloud to local state
    applyCloudData(data) {
        if (data.products) state.products = data.products;
        if (data.transactions) state.transactions = data.transactions;
        if (data.boxes) state.boxes = data.boxes;
        if (data.boxTransactions) state.boxTransactions = data.boxTransactions;
        if (data.tasks) state.tasks = data.tasks;
        if (data.settings) state.settings = data.settings;

        // Save to localStorage for offline access
        Storage.save(STORAGE_KEYS.PRODUCTS, state.products);
        Storage.save(STORAGE_KEYS.TRANSACTIONS, state.transactions);
        Storage.save(STORAGE_KEYS.BOXES, state.boxes);
        Storage.save(STORAGE_KEYS.BOX_TRANSACTIONS, state.boxTransactions);
        Storage.save(STORAGE_KEYS.TASKS, state.tasks);
        Storage.save(STORAGE_KEYS.SETTINGS, state.settings);

        // Refresh UI
        if (typeof UI !== 'undefined' && UI.refresh) {
            UI.refresh();
        }
    },

    // Start real-time sync with cloud
    startCloudSync() {
        if (this.cloudEnabled && window.FirebaseStorage) {
            console.log('🔥 Starting Firebase real-time sync...');
            FirebaseStorage.startRealtimeSync((cloudData) => {
                // Compare data richness before applying
                const localCount = state.transactions.length + state.boxTransactions.length + state.tasks.length;
                const cloudCount = (cloudData.transactions?.length || 0) +
                    (cloudData.boxTransactions?.length || 0) +
                    (cloudData.tasks?.length || 0);

                console.log(`🔄 Sync check - Local: ${localCount}, Cloud: ${cloudCount}`);

                // Only apply if cloud has MORE data (not equal or less)
                if (cloudCount > localCount) {
                    Storage.applyCloudData(cloudData);
                    if (typeof UI !== 'undefined') {
                        UI.showToast('Synced from another device', 'info');
                    }
                } else {
                    console.log('⏭️ Ignoring sync - local data is richer or equal');
                }
            });
        }
    },

    clearAll() {
        localStorage.removeItem(STORAGE_KEYS.PRODUCTS);
        localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
        localStorage.removeItem(STORAGE_KEYS.BOXES);
        localStorage.removeItem(STORAGE_KEYS.BOX_TRANSACTIONS);
        localStorage.removeItem(STORAGE_KEYS.SETTINGS);
        state.products = [];
        state.transactions = [];
        state.boxes = [];
        state.boxTransactions = [];
        state.settings = { reorderThreshold: 1000 };

        // Also clear cloud data
        Storage.syncToCloud();
    },

    exportData() {
        return {
            products: state.products,
            transactions: state.transactions,
            boxes: state.boxes,
            boxTransactions: state.boxTransactions,
            settings: state.settings,
            exportDate: new Date().toISOString()
        };
    },

    importData(data) {
        if (data.products) state.products = data.products;
        if (data.transactions) state.transactions = data.transactions;
        if (data.boxes) state.boxes = data.boxes;
        if (data.boxTransactions) state.boxTransactions = data.boxTransactions;
        if (data.settings) state.settings = data.settings;
        Storage.saveAll();
    }
};

// ===========================================
// Business Logic
// ===========================================
const Inventory = {
    // Initialize with default flavours
    initializeDefaultFlavours() {
        DEFAULT_FLAVOURS.forEach(flavour => {
            const product = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: flavour.name,
                reorderThreshold: flavour.reorderThreshold,
                createdAt: new Date().toISOString()
            };
            state.products.push(product);
        });
        Storage.save(STORAGE_KEYS.PRODUCTS, state.products);
    },

    // Get total used quantity for a product
    getTotalUsed(productId) {
        return state.transactions
            .filter(t => t.productId === productId && t.type === 'used')
            .reduce((sum, t) => sum + t.quantity, 0);
    },

    // Get total ordered quantity for a product
    getTotalOrdered(productId) {
        return state.transactions
            .filter(t => t.productId === productId && t.type === 'ordered')
            .reduce((sum, t) => sum + t.quantity, 0);
    },

    // Get total adjustments (initial stock, corrections)
    getTotalAdjustment(productId) {
        return state.transactions
            .filter(t => t.productId === productId && t.type === 'adjustment')
            .reduce((sum, t) => sum + t.quantity, 0);
    },

    // Calculate current stock for a product: Stock = Ordered + Adjustment - Used
    getStock(productId) {
        const totalOrdered = Inventory.getTotalOrdered(productId);
        const totalAdjustment = Inventory.getTotalAdjustment(productId);
        const totalUsed = Inventory.getTotalUsed(productId);
        return totalOrdered + totalAdjustment - totalUsed;
    },

    // Get status based on stock level (uses product's own threshold)
    getStatus(stock, product) {
        const threshold = product.reorderThreshold || 3000; // Default to 3000 if not set
        if (stock <= threshold) return 'reorder';
        return 'ok';
    },

    // Add a new product
    addProduct(name, reorderThreshold = 3000) {
        const product = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: name.trim(),
            reorderThreshold: reorderThreshold,
            createdAt: new Date().toISOString()
        };
        state.products.push(product);
        Storage.save(STORAGE_KEYS.PRODUCTS, state.products);
        return product;
    },

    // Delete a product
    deleteProduct(id) {
        state.products = state.products.filter(p => p.id !== id);
        state.transactions = state.transactions.filter(t => t.productId !== id);
        Storage.saveAll();
    },

    // Record a transaction (used or ordered)
    recordTransaction(productId, quantity, type) {
        const product = state.products.find(p => p.id === productId);
        if (!product) return null;

        const transaction = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            productId,
            productName: product.name,
            quantity: parseInt(quantity, 10),
            type: type, // 'used' or 'ordered' or 'adjustment'
            date: new Date().toISOString()
        };
        state.transactions.push(transaction);
        console.log(`📝 Recorded transaction: ${type} ${quantity} × ${product.name}. Total: ${state.transactions.length}`);
        Storage.saveAll(); // Save AND sync to cloud
        return transaction;
    },

    // Undo last transaction
    undoLastTransaction() {
        if (state.transactions.length === 0) return null;

        const lastTransaction = state.transactions.pop();
        console.log(`↩️ Undid transaction. Total now: ${state.transactions.length}`);
        Storage.saveAll(); // Sync to cloud too!
        return lastTransaction;
    },

    // Get last transaction (for preview)
    getLastTransaction() {
        if (state.transactions.length === 0) return null;
        return state.transactions[state.transactions.length - 1];
    },

    // Get all transactions, optionally filtered
    getTransactions(productId = null, type = null) {
        let transactions = [...state.transactions];
        if (productId) {
            transactions = transactions.filter(t => t.productId === productId);
        }
        if (type) {
            transactions = transactions.filter(t => t.type === type);
        }
        return transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    },

    // =====================
    // BOX FUNCTIONS
    // =====================

    // Initialize with default boxes
    initializeDefaultBoxes() {
        DEFAULT_BOX_FLAVOURS.forEach(name => {
            const box = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: name,
                reorderThreshold: 2, // All boxes have threshold of 2
                createdAt: new Date().toISOString()
            };
            state.boxes.push(box);
        });
        Storage.save(STORAGE_KEYS.BOXES, state.boxes);
    },

    // Get total used for a box
    getBoxTotalUsed(boxId) {
        return state.boxTransactions
            .filter(t => t.boxId === boxId && t.type === 'used')
            .reduce((sum, t) => sum + t.quantity, 0);
    },

    // Get total made for a box
    getBoxTotalMade(boxId) {
        return state.boxTransactions
            .filter(t => t.boxId === boxId && t.type === 'made')
            .reduce((sum, t) => sum + t.quantity, 0);
    },

    // Get total adjustments for a box
    getBoxTotalAdjustment(boxId) {
        return state.boxTransactions
            .filter(t => t.boxId === boxId && t.type === 'adjustment')
            .reduce((sum, t) => sum + t.quantity, 0);
    },

    // Calculate box stock: Stock = Made + Adjustment - Used
    getBoxStock(boxId) {
        const totalMade = Inventory.getBoxTotalMade(boxId);
        const totalAdjustment = Inventory.getBoxTotalAdjustment(boxId);
        const totalUsed = Inventory.getBoxTotalUsed(boxId);
        return totalMade + totalAdjustment - totalUsed;
    },

    // Get box status: OK when 3+, MAKE when less than 3
    getBoxStatus(stock, box) {
        if (stock < 3) return 'make';
        return 'ok';
    },

    // Add a new box flavour
    addBox(name) {
        const box = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: name.trim(),
            reorderThreshold: 2,
            createdAt: new Date().toISOString()
        };
        state.boxes.push(box);
        Storage.save(STORAGE_KEYS.BOXES, state.boxes);
        return box;
    },

    // Record a box transaction (used or made)
    recordBoxTransaction(boxId, quantity, type) {
        const box = state.boxes.find(b => b.id === boxId);
        if (!box) return null;

        const transaction = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            boxId,
            boxName: box.name,
            quantity: parseInt(quantity, 10),
            type: type, // 'used' or 'made' or 'adjustment'
            date: new Date().toISOString()
        };
        state.boxTransactions.push(transaction);
        console.log(`📝 Recorded box transaction: ${type} ${quantity} × ${box.name}. Total: ${state.boxTransactions.length}`);
        Storage.saveAll(); // Save AND sync to cloud
        return transaction;
    },

    // Undo last box transaction
    undoLastBoxTransaction() {
        if (state.boxTransactions.length === 0) return null;
        const lastTransaction = state.boxTransactions.pop();
        console.log(`↩️ Undid box transaction. Total now: ${state.boxTransactions.length}`);
        Storage.saveAll(); // Sync to cloud too!
        return lastTransaction;
    },

    // Get last box transaction
    getLastBoxTransaction() {
        if (state.boxTransactions.length === 0) return null;
        return state.boxTransactions[state.boxTransactions.length - 1];
    }
};

// ===========================================
// Tasks Management
// ===========================================
const Tasks = {
    // Add a new task
    add(text, isAuto = false, sourceId = null) {
        const task = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            text: text.trim(),
            completed: false,
            isAuto: isAuto, // true if generated from low stock
            sourceId: sourceId, // ID of product/box that triggered this
            createdAt: new Date().toISOString(),
            completedAt: null
        };
        state.tasks.push(task);
        Storage.save(STORAGE_KEYS.TASKS, state.tasks);
        Storage.syncToCloud();
        return task;
    },

    // Complete a task
    complete(taskId) {
        const task = state.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = true;
            task.completedAt = new Date().toISOString();
            Storage.save(STORAGE_KEYS.TASKS, state.tasks);
            Storage.syncToCloud();
            // Trigger confetti!
            Tasks.celebrate();
            return task;
        }
        return null;
    },

    // Uncomplete a task (move back to pending)
    uncomplete(taskId) {
        const task = state.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = false;
            task.completedAt = null;
            Storage.save(STORAGE_KEYS.TASKS, state.tasks);
            Storage.syncToCloud();
            return task;
        }
        return null;
    },

    // Delete a task
    delete(taskId) {
        state.tasks = state.tasks.filter(t => t.id !== taskId);
        Storage.save(STORAGE_KEYS.TASKS, state.tasks);
        Storage.syncToCloud();
    },

    // Get pending tasks
    getPending() {
        return state.tasks.filter(t => !t.completed).sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );
    },

    // Get completed tasks
    getCompleted() {
        return state.tasks.filter(t => t.completed).sort((a, b) =>
            new Date(b.completedAt) - new Date(a.completedAt)
        );
    },

    // Check for low stock and create auto-tasks
    checkLowStock() {
        // Check bags
        state.products.forEach(product => {
            const stock = Inventory.getStock(product.id);
            const status = Inventory.getStatus(stock, product);

            if (status === 'reorder') {
                // Check if we already have an auto-task for this
                const existingTask = state.tasks.find(t =>
                    t.isAuto && t.sourceId === product.id && !t.completed
                );

                if (!existingTask) {
                    Tasks.add(`📦 Reorder ${product.name} (low stock)`, true, product.id);
                }
            }
        });

        // Check boxes
        state.boxes.forEach(box => {
            const stock = Inventory.getBoxStock(box.id);
            const status = Inventory.getBoxStatus(stock, box);

            if (status === 'make') {
                const existingTask = state.tasks.find(t =>
                    t.isAuto && t.sourceId === box.id && !t.completed
                );

                if (!existingTask) {
                    Tasks.add(`📦 Make ${box.name} boxes (low stock)`, true, box.id);
                }
            }
        });
    },

    // 🎉 Confetti celebration!
    celebrate() {
        const confettiCount = 100;
        const colors = ['#c5a971', '#4a9d4a', '#f0ebe3', '#b89860', '#ffffff'];

        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            document.body.appendChild(confetti);

            // Remove after animation
            setTimeout(() => confetti.remove(), 4000);
        }
    }
};

// ===========================================
// UI Components
// ===========================================
const UI = {
    // Selectors
    elements: {},

    // Initialize UI references
    init() {
        this.elements = {
            // Forms
            addProductForm: document.getElementById('addProductForm'),
            inputForm: document.getElementById('inputForm'),
            settingsForm: document.getElementById('settingsForm'),

            // Input modal fields
            inputModal: document.getElementById('inputModal'),
            inputModalTitle: document.getElementById('inputModalTitle'),
            inputLabel: document.getElementById('inputLabel'),
            inputProductId: document.getElementById('inputProductId'),
            inputType: document.getElementById('inputType'),
            inputValue: document.getElementById('inputValue'),

            // Tables - Bags
            inventoryBody: document.getElementById('inventoryBody'),
            transactionLogBody: document.getElementById('transactionLogBody'),
            emptyState: document.getElementById('emptyState'),
            logEmptyState: document.getElementById('logEmptyState'),

            // Tables - Boxes
            boxesBody: document.getElementById('boxesBody'),
            boxesEmptyState: document.getElementById('boxesEmptyState'),

            // Tabs
            bagsTab: document.getElementById('bagsTab'),
            boxesTab: document.getElementById('boxesTab'),
            tabBtns: document.querySelectorAll('.tab-btn'),

            // Modals
            addProductModal: document.getElementById('addProductModal'),
            transactionLogModal: document.getElementById('transactionLogModal'),
            settingsModal: document.getElementById('settingsModal'),

            // Buttons
            undoBtn: document.getElementById('undoBtn'),
            addProductBtn: document.getElementById('addProductBtn'),
            viewLogBtn: document.getElementById('viewLogBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            exportDataBtn: document.getElementById('exportDataBtn'),
            importDataBtn: document.getElementById('importDataBtn'),
            importFileInput: document.getElementById('importFileInput'),
            clearDataBtn: document.getElementById('clearDataBtn'),
            resetDataBtn: document.getElementById('resetDataBtn'),

            // Settings inputs
            reorderThreshold: document.getElementById('reorderThreshold'),
            logFilterProduct: document.getElementById('logFilterProduct'),
            logFilterType: document.getElementById('logFilterType'),

            // Version display
            appVersion: document.getElementById('appVersion'),

            // Toast container
            toastContainer: document.getElementById('toastContainer'),

            // Tasks
            tasksTab: document.getElementById('tasksTab'),
            pendingTasksList: document.getElementById('pendingTasksList'),
            completedTasksList: document.getElementById('completedTasksList'),
            tasksEmptyState: document.getElementById('tasksEmptyState'),
            newTaskInput: document.getElementById('newTaskInput'),
            addTaskBtn: document.getElementById('addTaskBtn')
        };

        // Display version
        if (this.elements.appVersion) {
            this.elements.appVersion.textContent = `Version ${APP_VERSION}`;
        }
    },

    // Render the inventory table
    renderInventory() {
        const tbody = this.elements.inventoryBody;
        tbody.innerHTML = '';

        if (state.products.length === 0) {
            this.elements.emptyState.classList.remove('hidden');
            return;
        }

        this.elements.emptyState.classList.add('hidden');

        state.products.forEach(product => {
            const totalUsed = Inventory.getTotalUsed(product.id);
            const totalOrdered = Inventory.getTotalOrdered(product.id);
            const stock = Inventory.getStock(product.id);
            const threshold = product.reorderThreshold || 3000;
            const status = Inventory.getStatus(stock, product);

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <span class="status-badge status-${status}">
                        ${status === 'ok' ? 'OK' : 'REORDER'}
                    </span>
                </td>
                <td class="mix-bag-name">${this.escapeHtml(product.name)}</td>
                <td class="clickable-cell cell-stock ${stock <= threshold ? 'stock-low' : 'stock-ok'}" data-product-id="${product.id}" data-type="adjustment">
                    ${stock}
                </td>
                <td class="clickable-cell cell-used" data-product-id="${product.id}" data-type="used">
                    ${totalUsed}
                </td>
                <td class="clickable-cell cell-ordered" data-product-id="${product.id}" data-type="ordered">
                    ${totalOrdered}
                </td>
            `;
            tbody.appendChild(row);
        });

        // Attach event listeners to clickable cells
        tbody.querySelectorAll('.clickable-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                const productId = cell.dataset.productId;
                const type = cell.dataset.type;
                this.openInputModal(productId, type);
            });
        });
    },

    // Open input modal for Used, Ordered, or Adjustment (bags)
    openInputModal(productId, type) {
        const product = state.products.find(p => p.id === productId);
        if (!product) return;

        this.elements.inputProductId.value = productId;
        this.elements.inputType.value = type;
        this.elements.inputValue.value = '';

        // Mark as bag transaction
        this.elements.inputForm.dataset.isBox = 'false';

        if (type === 'used') {
            this.elements.inputModalTitle.textContent = `Record Usage - ${product.name}`;
            this.elements.inputLabel.textContent = 'How many have you used?';
        } else if (type === 'adjustment') {
            const currentStock = Inventory.getStock(product.id);
            this.elements.inputModalTitle.textContent = `Set Stock - ${product.name}`;
            this.elements.inputLabel.textContent = `Current stock: ${currentStock}. Enter amount to add:`;
        } else {
            this.elements.inputModalTitle.textContent = `Record Order - ${product.name}`;
            this.elements.inputLabel.textContent = 'How many have you ordered?';
        }

        this.openModal(this.elements.inputModal);

        // Focus input after modal opens
        setTimeout(() => {
            this.elements.inputValue.focus();
        }, 100);
    },

    // Render the product select dropdown for log filter
    renderProductSelect() {
        const filterSelect = this.elements.logFilterProduct;

        filterSelect.innerHTML = '<option value="">All Flavours</option>';

        state.products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = product.name;
            filterSelect.appendChild(option);
        });
    },

    // Render transaction log
    renderTransactionLog(productId = null, type = null) {
        const tbody = this.elements.transactionLogBody;
        const transactions = Inventory.getTransactions(productId, type);

        tbody.innerHTML = '';

        if (transactions.length === 0) {
            this.elements.logEmptyState.classList.remove('hidden');
            return;
        }

        this.elements.logEmptyState.classList.add('hidden');

        transactions.forEach(transaction => {
            const row = document.createElement('tr');
            const date = new Date(transaction.date);
            row.innerHTML = `
                <td>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</td>
                <td>${this.escapeHtml(transaction.productName)}</td>
                <td>
                    <span class="log-type log-type-${transaction.type}">
                        ${transaction.type}
                    </span>
                </td>
                <td>${transaction.quantity}</td>
            `;
            tbody.appendChild(row);
        });
    },

    // Modal management
    openModal(modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closeModal(modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    },

    closeAllModals() {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            this.closeModal(modal);
        });
    },

    // Toast notifications
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
            <span>${this.escapeHtml(message)}</span>
        `;

        this.elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // Utility: Escape HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Render boxes table
    renderBoxes() {
        const tbody = this.elements.boxesBody;
        tbody.innerHTML = '';

        if (state.boxes.length === 0) {
            this.elements.boxesEmptyState.classList.remove('hidden');
            return;
        }

        this.elements.boxesEmptyState.classList.add('hidden');

        state.boxes.forEach(box => {
            const totalUsed = Inventory.getBoxTotalUsed(box.id);
            const totalMade = Inventory.getBoxTotalMade(box.id);
            const stock = Inventory.getBoxStock(box.id);
            const status = Inventory.getBoxStatus(stock, box);

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <span class="status-badge status-${status === 'ok' ? 'ok' : 'make'}">
                        ${status === 'ok' ? 'OK' : 'MAKE'}
                    </span>
                </td>
                <td class="mix-bag-name">${this.escapeHtml(box.name)}</td>
                <td class="clickable-cell cell-stock ${stock < 3 ? 'stock-low' : 'stock-ok'}" data-box-id="${box.id}" data-type="adjustment">
                    ${stock}
                </td>
                <td class="clickable-cell cell-used" data-box-id="${box.id}" data-type="used">
                    ${totalUsed}
                </td>
                <td class="clickable-cell cell-ordered" data-box-id="${box.id}" data-type="made">
                    ${totalMade}
                </td>
            `;
            tbody.appendChild(row);
        });

        // Attach event listeners to clickable cells
        tbody.querySelectorAll('.clickable-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                const boxId = cell.dataset.boxId;
                const type = cell.dataset.type;
                this.openBoxInputModal(boxId, type);
            });
        });
    },

    // Open input modal for box Used, Made, or Adjustment
    openBoxInputModal(boxId, type) {
        const box = state.boxes.find(b => b.id === boxId);
        if (!box) return;

        this.elements.inputProductId.value = boxId;
        this.elements.inputType.value = type;
        this.elements.inputValue.value = '';

        // Store that this is a box transaction
        this.elements.inputForm.dataset.isBox = 'true';

        if (type === 'used') {
            this.elements.inputModalTitle.textContent = `Record Usage - ${box.name}`;
            this.elements.inputLabel.textContent = 'How many boxes have you used?';
        } else if (type === 'adjustment') {
            const currentStock = Inventory.getBoxStock(box.id);
            this.elements.inputModalTitle.textContent = `Set Stock - ${box.name}`;
            this.elements.inputLabel.textContent = `Current stock: ${currentStock}. Enter amount to add:`;
        } else {
            this.elements.inputModalTitle.textContent = `Record Made - ${box.name}`;
            this.elements.inputLabel.textContent = 'How many boxes have you made?';
        }

        this.openModal(this.elements.inputModal);

        setTimeout(() => {
            this.elements.inputValue.focus();
        }, 100);
    },

    // Update undo button state based on current tab
    updateUndoButton() {
        let lastTransaction;
        if (state.currentTab === 'bags') {
            lastTransaction = Inventory.getLastTransaction();
            if (lastTransaction) {
                this.elements.undoBtn.disabled = false;
                this.elements.undoBtn.title = `Undo: ${lastTransaction.type} ${lastTransaction.quantity} × ${lastTransaction.productName}`;
            } else {
                this.elements.undoBtn.disabled = true;
                this.elements.undoBtn.title = 'Nothing to undo';
            }
        } else {
            lastTransaction = Inventory.getLastBoxTransaction();
            if (lastTransaction) {
                this.elements.undoBtn.disabled = false;
                this.elements.undoBtn.title = `Undo: ${lastTransaction.type} ${lastTransaction.quantity} × ${lastTransaction.boxName}`;
            } else {
                this.elements.undoBtn.disabled = true;
                this.elements.undoBtn.title = 'Nothing to undo';
            }
        }
    },

    // Switch between tabs
    switchTab(tabName) {
        state.currentTab = tabName;

        // Update tab buttons
        this.elements.tabBtns.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update tab content
        if (tabName === 'bags') {
            this.elements.bagsTab.classList.add('active');
            this.elements.boxesTab.classList.remove('active');
            this.elements.tasksTab.classList.remove('active');
        } else if (tabName === 'boxes') {
            this.elements.bagsTab.classList.remove('active');
            this.elements.boxesTab.classList.add('active');
            this.elements.tasksTab.classList.remove('active');
        } else if (tabName === 'tasks') {
            this.elements.bagsTab.classList.remove('active');
            this.elements.boxesTab.classList.remove('active');
            this.elements.tasksTab.classList.add('active');
        }

        this.updateUndoButton();
    },

    // Render tasks list
    renderTasks() {
        const pendingList = this.elements.pendingTasksList;
        const completedList = this.elements.completedTasksList;

        if (!pendingList || !completedList) return;

        pendingList.innerHTML = '';
        completedList.innerHTML = '';

        const pendingTasks = Tasks.getPending();
        const completedTasks = Tasks.getCompleted();

        // Show/hide empty state
        if (pendingTasks.length === 0) {
            this.elements.tasksEmptyState.classList.remove('hidden');
        } else {
            this.elements.tasksEmptyState.classList.add('hidden');
        }

        // Render pending tasks
        pendingTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = 'task-item' + (task.isAuto ? ' task-auto' : '');
            li.innerHTML = `
                <button class="task-checkbox" data-task-id="${task.id}" aria-label="Complete task">
                    <span class="checkbox-icon"></span>
                </button>
                <span class="task-text">${this.escapeHtml(task.text)}</span>
                <button class="task-delete" data-task-id="${task.id}" aria-label="Delete task">✕</button>
            `;
            pendingList.appendChild(li);
        });

        // Render completed tasks
        completedTasks.slice(0, 10).forEach(task => { // Show last 10 completed
            const li = document.createElement('li');
            li.className = 'task-item task-completed' + (task.isAuto ? ' task-auto' : '');
            li.innerHTML = `
                <button class="task-checkbox checked" data-task-id="${task.id}" aria-label="Uncomplete task">
                    <span class="checkbox-icon">✓</span>
                </button>
                <span class="task-text">${this.escapeHtml(task.text)}</span>
                <button class="task-delete" data-task-id="${task.id}" aria-label="Delete task">✕</button>
            `;
            completedList.appendChild(li);
        });

        // Attach event listeners
        pendingList.querySelectorAll('.task-checkbox').forEach(btn => {
            btn.addEventListener('click', () => {
                Tasks.complete(btn.dataset.taskId);
                this.renderTasks();
                UI.showToast('Task completed! 🎉', 'success');
            });
        });

        completedList.querySelectorAll('.task-checkbox').forEach(btn => {
            btn.addEventListener('click', () => {
                Tasks.uncomplete(btn.dataset.taskId);
                this.renderTasks();
            });
        });

        document.querySelectorAll('.task-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                Tasks.delete(btn.dataset.taskId);
                this.renderTasks();
            });
        });
    },

    // Refresh all UI components
    refresh() {
        this.renderInventory();
        this.renderBoxes();
        this.renderTasks();
        this.renderProductSelect();
        this.updateUndoButton();

        // Check for low stock and create auto-tasks
        Tasks.checkLowStock();
    }
};

// ===========================================
// Event Handlers
// ===========================================
const Handlers = {
    init() {
        // Tab switching
        UI.elements.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                UI.switchTab(btn.dataset.tab);
            });
        });

        // Add task
        if (UI.elements.addTaskBtn) {
            UI.elements.addTaskBtn.addEventListener('click', () => {
                const text = UI.elements.newTaskInput.value.trim();
                if (text) {
                    Tasks.add(text);
                    UI.elements.newTaskInput.value = '';
                    UI.renderTasks();
                    UI.showToast('Task added!', 'success');
                }
            });

            // Also allow Enter key
            UI.elements.newTaskInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const text = UI.elements.newTaskInput.value.trim();
                    if (text) {
                        Tasks.add(text);
                        UI.elements.newTaskInput.value = '';
                        UI.renderTasks();
                        UI.showToast('Task added!', 'success');
                    }
                }
            });
        }

        // Input form submission (Used/Ordered/Made)
        UI.elements.inputForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = UI.elements.inputProductId.value;
            const type = UI.elements.inputType.value;
            const quantity = UI.elements.inputValue.value;
            const isBox = UI.elements.inputForm.dataset.isBox === 'true';

            if (!quantity || quantity <= 0) {
                UI.showToast('Please enter a valid quantity', 'error');
                return;
            }

            if (isBox) {
                const transaction = Inventory.recordBoxTransaction(id, quantity, type);
                if (transaction) {
                    UI.refresh();
                    UI.closeModal(UI.elements.inputModal);
                    const action = type === 'used' ? 'Used' : type === 'adjustment' ? 'Added' : 'Made';
                    UI.showToast(`${action} ${transaction.quantity} × ${transaction.boxName}`, 'success');
                }
            } else {
                const transaction = Inventory.recordTransaction(id, quantity, type);
                if (transaction) {
                    UI.refresh();
                    UI.closeModal(UI.elements.inputModal);
                    const action = type === 'used' ? 'Used' : type === 'adjustment' ? 'Added' : 'Ordered';
                    UI.showToast(`${action} ${transaction.quantity} × ${transaction.productName}`, 'success');
                }
            }

            // Reset the isBox flag
            UI.elements.inputForm.dataset.isBox = 'false';
        });

        // Add product form submission
        UI.elements.addProductForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('productName').value;

            if (!name) {
                UI.showToast('Please enter a flavour name', 'error');
                return;
            }

            // Check for duplicate names in products
            if (state.products.some(p => p.name.toLowerCase() === name.toLowerCase())) {
                UI.showToast('This flavour already exists', 'error');
                return;
            }

            // Add to both bags and boxes
            Inventory.addProduct(name);
            Inventory.addBox(name);
            UI.refresh();
            UI.closeModal(UI.elements.addProductModal);
            UI.elements.addProductForm.reset();
            UI.showToast(`Added flavour: ${name}`, 'success');
        });

        // Settings form submission
        UI.elements.settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            state.settings.reorderThreshold = parseInt(UI.elements.reorderThreshold.value, 10);
            Storage.save(STORAGE_KEYS.SETTINGS, state.settings);
            UI.renderInventory();
            UI.closeModal(UI.elements.settingsModal);
            UI.showToast('Settings saved', 'success');
        });

        // Undo button - works for current tab
        UI.elements.undoBtn.addEventListener('click', () => {
            if (state.currentTab === 'bags') {
                const undone = Inventory.undoLastTransaction();
                if (undone) {
                    UI.refresh();
                    const action = undone.type === 'used' ? 'Used' : 'Ordered';
                    UI.showToast(`Undid: ${action} ${undone.quantity} × ${undone.productName}`, 'info');
                }
            } else {
                const undone = Inventory.undoLastBoxTransaction();
                if (undone) {
                    UI.refresh();
                    const action = undone.type === 'used' ? 'Used' : 'Made';
                    UI.showToast(`Undid: ${action} ${undone.quantity} × ${undone.boxName}`, 'info');
                }
            }
        });

        // Open modals
        UI.elements.addProductBtn.addEventListener('click', () => {
            UI.openModal(UI.elements.addProductModal);
        });

        UI.elements.viewLogBtn.addEventListener('click', () => {
            UI.elements.logFilterProduct.value = '';
            UI.elements.logFilterType.value = '';
            UI.renderTransactionLog();
            UI.openModal(UI.elements.transactionLogModal);
        });

        UI.elements.settingsBtn.addEventListener('click', () => {
            UI.elements.reorderThreshold.value = state.settings.reorderThreshold;
            UI.openModal(UI.elements.settingsModal);
        });

        // Close modals
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                UI.closeAllModals();
            });
        });

        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    UI.closeModal(modal);
                }
            });
        });

        // Escape key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                UI.closeAllModals();
            }
        });

        // Log filters
        UI.elements.logFilterProduct.addEventListener('change', () => {
            UI.renderTransactionLog(
                UI.elements.logFilterProduct.value || null,
                UI.elements.logFilterType.value || null
            );
        });

        UI.elements.logFilterType.addEventListener('change', () => {
            UI.renderTransactionLog(
                UI.elements.logFilterProduct.value || null,
                UI.elements.logFilterType.value || null
            );
        });

        // Export data
        UI.elements.exportDataBtn.addEventListener('click', () => {
            const data = Storage.exportData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `inventory-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            UI.showToast('Data exported successfully', 'success');
        });

        // Import data
        UI.elements.importDataBtn.addEventListener('click', () => {
            UI.elements.importFileInput.click();
        });

        UI.elements.importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (confirm('This will replace all current data. Are you sure?')) {
                        Storage.importData(data);
                        UI.refresh();
                        UI.closeModal(UI.elements.settingsModal);
                        UI.showToast('Data imported successfully', 'success');
                    }
                } catch (err) {
                    UI.showToast('Invalid file format', 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = ''; // Reset input
        });

        // Clear data
        UI.elements.clearDataBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete ALL data? This cannot be undone!')) {
                Storage.clearAll();
                UI.refresh();
                UI.closeModal(UI.elements.settingsModal);
                UI.showToast('All data cleared', 'success');
            }
        });

        // Reset to default flavours
        UI.elements.resetDataBtn.addEventListener('click', () => {
            if (confirm('This will reset to default flavours and clear all transaction history. Continue?')) {
                Storage.clearAll();
                Inventory.initializeDefaultFlavours();
                Inventory.initializeDefaultBoxes();
                UI.refresh();
                UI.closeModal(UI.elements.settingsModal);
                UI.showToast('Reset to default flavours', 'success');
            }
        });
    }
};

// ===========================================
// Application Bootstrap
// ===========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Load saved data from localStorage first (instant)
    Storage.loadAll();

    // Debug: log what we loaded from localStorage
    console.log('📂 Loaded from localStorage:', {
        products: state.products.length,
        transactions: state.transactions.length,
        boxes: state.boxes.length,
        boxTransactions: state.boxTransactions.length,
        tasks: state.tasks.length
    });

    // Initialize UI
    UI.init();
    UI.refresh();

    // Initialize event handlers
    Handlers.init();

    console.log('Mix Bag Inventory Tracker initialized');

    // Register Service Worker for PWA/offline support
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('ServiceWorker registered:', registration.scope);
            })
            .catch((error) => {
                console.log('ServiceWorker registration failed:', error);
            });
    }

    // Initialize Firebase cloud sync
    if (window.FirebaseStorage) {
        // Check if cloud has data
        const cloudData = await FirebaseStorage.loadFromCloud();

        // Count transactions to determine which data is "richer"
        const localTransactionCount = state.transactions.length + state.boxTransactions.length + state.tasks.length;
        const cloudTransactionCount = cloudData ?
            (cloudData.transactions?.length || 0) + (cloudData.boxTransactions?.length || 0) + (cloudData.tasks?.length || 0) : 0;

        console.log(`📊 Local: ${localTransactionCount} transactions, Cloud: ${cloudTransactionCount} transactions`);

        if (cloudData && cloudTransactionCount > localTransactionCount) {
            // Cloud has more data - use it
            Storage.applyCloudData(cloudData);
            console.log('📥 Loaded richer data from cloud');
            UI.showToast('☁️ Synced from cloud', 'success');
        } else if (localTransactionCount > 0) {
            // Local has more or equal data - upload it
            Storage.syncToCloud();
            console.log('📤 Uploaded local data to cloud');
            UI.showToast('☁️ Cloud sync enabled', 'success');
        } else if (cloudData && cloudData.products?.length > 0) {
            // Both empty but cloud has products, use cloud
            Storage.applyCloudData(cloudData);
            UI.showToast('☁️ Cloud sync enabled', 'success');
        } else {
            UI.showToast('☁️ Cloud sync enabled', 'success');
        }

        // Start real-time sync for future changes
        Storage.startCloudSync();
    }
});
