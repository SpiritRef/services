import { getIni } from './API.js';

let NOVEL_API_URL = "";
let SERVICE_API_URL = ""; 
const iniPath = 'settings/Services.ini'; 

let allNotices = [];

async function initApp() {
    try {
        const config = await getIni(iniPath);
        
        if (config && config.NOVEL_API_URL && config.SERVICE_API_URL) {
            NOVEL_API_URL = config.NOVEL_API_URL; 
            SERVICE_API_URL = config.SERVICE_API_URL;
            console.log("✅ 系統設定載入成功");
            
            // 務必 await fetchData
            await fetchData();
        } else {
            throw new Error("INI 設定檔缺少 API 網址");
        }
    } catch (e) {
        console.error("❌ 初始化失敗:", e);
    }
}

async function fetchData() {
    // 1. 抓取公告
    try {
        const NOVEL_URL = NOVEL_API_URL.startsWith("http") ? NOVEL_API_URL : atob(NOVEL_API_URL);
        const response = await fetch(NOVEL_URL);
        const data = await response.json();
        
        console.log("📢 小說 API 原始資料:", data); // 除錯用

        // 過濾標題包含「公告」的資料
        allNotices = data.filter(item => {
            const title = String(item["標題"] || "");
            return title.includes("公告");
        });
        
        // 排序
        allNotices.sort((a, b) => new Date(b["發佈日期"]) - new Date(a["發佈日期"]));
        
        // 執行渲染
        renderNotices(); 
        
    } catch (e) {
        console.error("公告讀取出錯:", e);
        const el = document.getElementById('announcement-content');
        if (el) el.innerText = "公告加載失敗。";
    }

    // 2. 抓取服務項目
    try {
        const SERVICE_URL = SERVICE_API_URL.startsWith("http") ? SERVICE_API_URL : atob(SERVICE_API_URL);
        const serviceRes = await fetch(SERVICE_URL);
        const serviceData = await serviceRes.json();
        
        const container = document.getElementById('services-container');
        if (!container) return;
        
        container.innerHTML = ''; 

        const filteredServices = serviceData.filter(item => !String(item["標題"] || "").includes("公告"));

        filteredServices.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <h3>${item["服務名稱"] || item["標題"] || '專業服務'}</h3>
                <p>${item["服務介紹"] || item["貼文內容"] || '歡迎洽詢。'}</p>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        console.error("服務項目讀取出錯:", e);
    }
}

// 💡 關鍵：必須定義這個函式，fetchData 才呼叫得到
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
        const date = item["發佈日期"] ? new Date(item["發佈日期"]).toLocaleDateString() : "未知日期";
        
        return `
            <div class="notice-item">
                <span class="notice-date">[${date}]</span>
                <span>${summary}</span>
            </div>
        `;
    }).join('');
}

window.addEventListener('DOMContentLoaded', () => {
    initApp().catch(err => {
        console.error("系統初始化失敗，可能是 API 網址解碼錯誤或連線問題:", err);
    });
});
