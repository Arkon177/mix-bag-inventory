/**
 * Firebase Configuration for Mix Bag Inventory
 * Cloud sync for real-time data sharing across devices
 */

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBblBMrZd5XugRFj5EwOtTrKwpilKscd8k",
    authDomain: "stock-tracker-33fa8.firebaseapp.com",
    projectId: "stock-tracker-33fa8",
    storageBucket: "stock-tracker-33fa8.firebasestorage.app",
    messagingSenderId: "704165901798",
    appId: "1:704165901798:web:caf9e6dd46dd95b1485227"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();

// Document reference for our inventory data
const INVENTORY_DOC = 'shared-inventory';

/**
 * Firebase Storage Layer
 * Syncs data to Firestore for cross-device access
 */
const FirebaseStorage = {
    // Reference to our main document
    docRef: db.collection('inventory').doc(INVENTORY_DOC),

    // Track if we're currently syncing to prevent loops
    isSyncing: false,

    // Unsubscribe function for real-time listener
    unsubscribe: null,

    /**
     * Save all data to Firestore
     */
    async saveToCloud(data) {
        if (this.isSyncing) return;

        try {
            await this.docRef.set({
                products: data.products || [],
                transactions: data.transactions || [],
                boxes: data.boxes || [],
                boxTransactions: data.boxTransactions || [],
                settings: data.settings || { reorderThreshold: 1000 },
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('✅ Data synced to cloud');
        } catch (error) {
            console.error('❌ Failed to sync to cloud:', error);
        }
    },

    /**
     * Load data from Firestore (one-time)
     */
    async loadFromCloud() {
        try {
            const doc = await this.docRef.get();
            if (doc.exists) {
                console.log('✅ Data loaded from cloud');
                return doc.data();
            }
            console.log('ℹ️ No cloud data found, using local');
            return null;
        } catch (error) {
            console.error('❌ Failed to load from cloud:', error);
            return null;
        }
    },

    /**
     * Start listening for real-time updates
     */
    startRealtimeSync(onDataChange) {
        this.unsubscribe = this.docRef.onSnapshot((doc) => {
            if (doc.exists && !this.isSyncing) {
                console.log('🔄 Real-time update received');
                this.isSyncing = true;
                onDataChange(doc.data());
                // Small delay to prevent sync loops
                setTimeout(() => {
                    this.isSyncing = false;
                }, 500);
            }
        }, (error) => {
            console.error('❌ Real-time sync error:', error);
        });
    },

    /**
     * Stop listening for updates
     */
    stopRealtimeSync() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }
};

// Make FirebaseStorage available globally
window.FirebaseStorage = FirebaseStorage;
