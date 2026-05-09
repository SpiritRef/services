import { getIni } from './API.js';
import * as Global from 'https://spiritref.github.io/Javascript/global.js';

let NOVEL_API_URL = "";    
let SERVICE_API_URL = "";  
let JsonDataPath = "";     
let JsonServicePath = "";
const iniPath = 'https://spiritref.github.io/settings/global.ini'; 

let allNotices = [];
let allServices = [];
let allFAQs = [];

/**
 * 初始化應用程式
 */
async function initApp() {
    // 💡 第一階段：立即載入快取
    loadCache();

    try {
        const config = await getIni(iniPath);
        if (config.MENU_DATA) Global.initMenu(config.MENU_DATA);
        if (config) {
            JsonDataPath = config.JsonData;
            JsonServicePath = config.JsonService;

            // 💡 第二階段：補抓靜態 JSON (如果快取是空的)
            const loadTasks = [];
            if (allNotices.length === 0 && JsonDataPath) {
                loadTasks.push(loadStaticData(JsonDataPath, 'notice'));
            }
            if (allServices.length === 0 && JsonServicePath) {
                loadTasks.push(loadStaticData(JsonServicePath, 'service'));
            }
            if (loadTasks.length > 0) await Promise.all(loadTasks);

            // 💡 第三階段：解析 API 並執行背景同步
            if (config.NOVEL_API_URL && config.SERVICE_API_URL) {
                NOVEL_API_URL = config.NOVEL_API_URL.startsWith("http") ? config.NOVEL_API_URL : atob(config.NOVEL_API_URL);
                SERVICE_API_URL = config.SERVICE_API_URL.startsWith("http") ? config.SERVICE_API_URL : atob(config.SERVICE_API_URL);
                console.log("✅ 系統設定載入成功，啟動遠端同步...");
                fetchRemoteData();
            }
        } else {
            throw new Error("INI 設定檔缺少關鍵 API 網址");
        }
    } catch (e) {
        console.error("❌ 初始化失敗:", e);
    }
}

/**
 * 載入本地快取資料
 */
function loadCache() {
    const cachedNotices = localStorage.getItem('cache_notices');
    const cachedServices = localStorage.getItem('cache_services');

    if (cachedNotices) {
        allNotices = JSON.parse(cachedNotices);
        renderNotices();
    }
    if (cachedServices) {
        // 從快取的服務中拆分並顯示 (使用異步處理以免阻塞公告渲染)
        processServiceData(JSON.parse(cachedServices));
    }
}

/**
 * 核心邏輯：異步處理服務資料，達成「服務」與「FAQ」競爭渲染
 */
function processServiceData(data) {
    // 💡 任務 1：處理服務項目 (丟入 Microtask)
    Promise.resolve().then(() => {
        allServices = data.filter(item => {
            const title = String(item["服務名稱"] || item["標題"] || "");
            return !title.includes("公告") && !title.includes("問");
        });
        renderServices(allServices);
        console.log("🛠️ 服務項目已渲染");
    });

    // 💡 任務 2：處理 FAQ (丟入 Microtask)
    Promise.resolve().then(() => {
        allFAQs = data.filter(item => {
            const title = String(item["分類"] || item["標題"] || "");
            return title.includes("常見問題");
        });
        renderFAQ();
        console.log("❓ FAQ 已渲染");
    });
}

/**
 * 讀取靜態 JSON 檔案
 */
async function loadStaticData(path, type) {
    try {
        const res = await fetch(path);
        if (!res.ok) return;
        const data = await res.json();
        
        if (type === 'notice') {
            const rawData = Array.isArray(data) ? data : (data.notices || []);
            allNotices = rawData.filter(item => String(item["標題"] || "").includes("公告"));
            renderNotices();
        } else if (type === 'service'){
            const rawData = Array.isArray(data) ? data : (data.services || []);
            processServiceData(rawData); // 觸發並行處理
        }
    } catch (e) {
        console.warn(`⚠️ 無法讀取 ${type} JSON:`, e);
    }
}

/**
 * 執行背景同步 (獨立執行緒，互不等待)
 */
async function fetchRemoteData() {
    // 1. 同步服務與 FAQ
    const syncServices = async () => {
        try {
            const res = await fetch(`${SERVICE_API_URL}${SERVICE_API_URL.includes('?') ? '&' : '?'}type=service`);
            if (!res.ok) return;
            const data = await res.json();
            
            if (JSON.stringify(data) !== localStorage.getItem('cache_services')) {
                localStorage.setItem('cache_services', JSON.stringify(data));
                processServiceData(data); // 誰快誰先顯示
                console.log("🔄 服務類 API 同步完成");
            }
        } catch (e) {
            console.error("服務同步失敗:", e);
        }
    };

    // 2. 同步公告
    const syncNotices = async () => {
        try {
            const res = await fetch(`${NOVEL_API_URL}${NOVEL_API_URL.includes('?') ? '&' : '?'}type=notice`);
            if (!res.ok) return;
            const data = await res.json();

            let newData = data.filter(item => String(item["標題"] || "").includes("公告"));
            newData.sort((a, b) => new Date(b["發佈日期"]) - new Date(a["發佈日期"]));

            if (JSON.stringify(newData) !== localStorage.getItem('cache_notices')) {
                allNotices = newData;
                localStorage.setItem('cache_notices', JSON.stringify(newData));
                renderNotices(); // 公告跑完立即顯示
                console.log("🔄 公告區 API 同步完成");
            }
        } catch (e) {
            console.error("公告同步失敗:", e);
        }
    };

    // 🚀 三路並行發射
    syncServices();
    syncNotices();
}

/**
 * 渲染公告列表
 */
function renderNotices() {
    const content = document.getElementById('announcement-content');
    if (!content) return;
    if (allNotices.length === 0) {
        content.innerText = "目前暫無公告。";
        return;
    }
    const displayList = allNotices.slice(0, 5);
    content.innerHTML = displayList.map(item => {
        const text = item["貼文內容"] || item["內容"] || "";
        const summary = text.length > 50 ? text.substring(0, 50) + "..." : text;
        const date = item["發佈日期"] ? new Date(item["發佈日期"]).toLocaleDateString() : "近期";
        return `
            <div class="notice-item">
                <span class="notice-date">[${date}]</span>
                <span class="notice-text">${summary}</span>
            </div>
        `;
    }).join('');
}

/**
 * 渲染常見問題列表
 */
function renderFAQ() {
    const content = document.getElementById('faq-content');
    if (!content) return;
    if (allFAQs.length === 0) {
        content.innerText = "目前暫無常見問題。";
        return;
    }
    const displayList = allFAQs.slice(0, 5);
    content.innerHTML = displayList.map(item => {
        const q = item["服務名稱"] || item["標題"] || "常見問題";
        const a = item["服務介紹"] || item["貼文內容"] || item["內容"] || "暫無解答";
        return `
            <div class="notice-item" style="display: block; margin-bottom: 15px;">
                <div class="notice-text" style="font-weight: bold; color: #d4af37;">Q: ${q}</div>
                <div class="notice-text" style="margin-left: 20px; font-size: 0.95em; opacity: 0.9;">A: ${a}</div>
            </div>
        `;
    }).join('');
}

/**
 * 渲染服務項目卡片
 */
function renderServices(data) {
    const container = document.getElementById('services-container');
    if (!container) return;
    if (data.length === 0) {
        container.innerHTML = '<p style="text-align: center; grid-column: 1/-1;">服務項目整理中。</p>';
        return;
    }
    container.innerHTML = data.map(item => `
        <div class="card">
            <h3>${item["服務名稱"] || item["標題"] || '專業服務'}</h3>
            <p>${item["服務介紹"] || item["貼文內容"] || '歡迎洽詢。'}</p>
        </div>
    `).join('');
}

// 啟動應用程式
window.addEventListener('DOMContentLoaded', initApp);
