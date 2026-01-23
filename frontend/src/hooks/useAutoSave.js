/**
 * src/hooks/useAutoSave.js
 * 自动保存策略：每 5 分钟，保留最近 20 个版本 (IndexedDB)
 */
import { useEffect, useRef } from 'react';

const DB_NAME = 'CanvasProjectDB';
const STORE_NAME = 'autosaves';
const MAX_VERSIONS = 20;
const SAVE_INTERVAL = 5 * 60 * 1000; // 5分钟

export const useAutoSave = (projectData, uuid) => {
    const dbRef = useRef(null);

    // 初始化 DB
    useEffect(() => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // keyPath 使用 compound index [uuid, timestamp]
                db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            }
        };
        request.onsuccess = (e) => {
            dbRef.current = e.target.result;
            console.log("AutoSave DB Connected");
        };
    }, []);

    // 定时保存逻辑
    useEffect(() => {
        if (!uuid) return;

        const saveSnapshot = () => {
            if (!dbRef.current) return;
            
            const timestamp = Date.now();
            const key = `autosave_${uuid}_${timestamp}`;
            const snapshot = {
                key: key,
                uuid: uuid,
                timestamp: timestamp,
                data: JSON.parse(JSON.stringify(projectData)) // 深拷贝数据
            };

            const transaction = dbRef.current.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            store.add(snapshot);

            // 清理旧版本 (FIFO)
            // 这里做一个简单的清理逻辑：获取该 UUID 下的所有 key，如果超过 20 个，删掉最旧的
            const indexRequest = store.getAllKeys();
            indexRequest.onsuccess = () => {
                const allKeys = indexRequest.result;
                const myKeys = allKeys.filter(k => k.includes(uuid)).sort(); // 按时间戳排序 (因为 key 包含 timestamp)
                
                if (myKeys.length > MAX_VERSIONS) {
                    const keysToDelete = myKeys.slice(0, myKeys.length - MAX_VERSIONS);
                    keysToDelete.forEach(k => store.delete(k));
                    console.log(`AutoSave: Cleaned ${keysToDelete.length} old versions.`);
                }
            };
            
            console.log("AutoSave: Snapshot taken at", new Date().toLocaleTimeString());
        };

        const intervalId = setInterval(saveSnapshot, SAVE_INTERVAL);
        return () => clearInterval(intervalId);
    }, [projectData, uuid]);
};