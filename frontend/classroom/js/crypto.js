const E2EE = {
    deriveKey: async function (password) {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );
        return window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: enc.encode("lenguista-secure-salt-2026"),
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    },

    encryptFile: async function (file, password) {
        const startTime = performance.now();

        const key = await this.deriveKey(password);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const arrayBuffer = await file.arrayBuffer();
        const encryptedBuffer = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            arrayBuffer
        );

        const finalBuffer = new Uint8Array(iv.length + encryptedBuffer.byteLength);
        finalBuffer.set(iv, 0);
        finalBuffer.set(new Uint8Array(encryptedBuffer), iv.length);

        return new Blob([finalBuffer], { type: "application/octet-stream" });
    },

    decryptFile: async function (encryptedBlob, password, originalMimeType) {
        console.log(`[E2EE Worker] Starting hardware-accelerated decryption...`);
        const startTime = performance.now();

        const key = await this.deriveKey(password);
        const arrayBuffer = await encryptedBlob.arrayBuffer();

        // Extract the 12-byte IV from the beginning
        const iv = arrayBuffer.slice(0, 12);
        const encryptedData = arrayBuffer.slice(12);

        try {
            const decryptedBuffer = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: new Uint8Array(iv) },
                key,
                encryptedData
            );

            const timeTaken = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`[E2EE Worker] Decryption finished in ${timeTaken} seconds!`);

            return new Blob([decryptedBuffer], { type: originalMimeType || 'application/octet-stream' });
        } catch (e) {
            console.error("Decryption failed. Incorrect class code or corrupted file.");
            throw new Error("Decryption failed");
        }
    }
};

window.E2EE = E2EE;
